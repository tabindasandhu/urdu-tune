import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { api, audioUrl } from "../api";
import type { Clip, ClipStatus } from "../api";
import { draftWer, wordEdits, words } from "../wer";

interface Props {
  projectId: number;
  initialSpeaker?: string;
  onChanged: () => void;
}

type Filter = ClipStatus | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "needs_review", label: "To review" },
  { id: "labelled", label: "Labelled" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

const STATUS_LABEL: Record<ClipStatus, string> = {
  needs_review: "To review",
  labelled: "Labelled",
  rejected: "Rejected",
};

export default function LabelTab({ projectId, initialSpeaker = "", onChanged }: Props) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [filter, setFilter] = useState<Filter>("needs_review");
  const [speaker, setSpeaker] = useState(initialSpeaker);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch every clip of the project; filtering happens in the browser.
  const load = useCallback(async () => {
    try {
      const all = await api.listClips(projectId);
      setClips(all.reverse()); // oldest first
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    api
      .listClips(projectId)
      .then((all) => !cancelled && setClips(all.reverse()))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    // Refetch when you come back to this browser tab, e.g. after recording on another device.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [projectId, load]);

  const speakers = useMemo(() => [...new Set(clips.map((c) => c.speaker))].sort(), [clips]);
  const counts = useMemo(() => {
    const bySpeaker = clips.filter((c) => !speaker || c.speaker === speaker);
    return {
      needs_review: bySpeaker.filter((c) => c.status === "needs_review").length,
      labelled: bySpeaker.filter((c) => c.status === "labelled").length,
      rejected: bySpeaker.filter((c) => c.status === "rejected").length,
      all: bySpeaker.length,
    };
  }, [clips, speaker]);
  const visible = clips.filter(
    (c) => (filter === "all" || c.status === filter) && (!speaker || c.speaker === speaker),
  );

  // The open clip: the one you clicked, or else the first in the list.
  const selected = visible.find((c) => c.id === selectedId) ?? visible[0];
  const [openedId, setOpenedId] = useState<number | null>(null);
  if (selected && selected.id !== openedId) {
    // A different clip just opened: load its text into the editor.
    setOpenedId(selected.id);
    setText(selected.text);
  }

  async function save(status: ClipStatus) {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateClip(selected.id, text, status);
      // Move on to the next clip in the current list (the saved one may leave the list).
      const index = visible.findIndex((c) => c.id === selected.id);
      const stays = filter === "all" || filter === status;
      const next = visible[index + 1];
      setClips((list) => list.map((c) => (c.id === updated.id ? updated : c)));
      setSelectedId(next?.id ?? (stays ? updated.id : null));
      setOpenedId(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && e.ctrlKey && text.trim()) {
      e.preventDefault();
      void save("labelled");
    }
  }

  if (loading) return <p className="muted">Loading clips…</p>;

  const baseline = draftWer(clips.filter((c) => c.status === "labelled"));
  const labelledCount = clips.filter((c) => c.status === "labelled").length;
  const changed = selected ? wordEdits(words(text), words(selected.draft_text)) : 0;

  return (
    <div className="tab">
      <div className="card baseline">
        <span>Current model's WER on your audio</span>
        <strong>{baseline === null ? "—" : `${(baseline * 100).toFixed(1)}%`}</strong>
        <span className="muted small">
          from {labelledCount} labelled clip{labelledCount === 1 ? "" : "s"} (draft vs your correction)
        </span>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card filters">
        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              className={`chip ${filter === f.id ? "active" : ""}`}
              onClick={() => {
                setFilter(f.id);
                setSelectedId(null);
              }}
            >
              {f.label} <span className="count">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="filter-right">
          <select
            value={speaker}
            onChange={(e) => {
              setSpeaker(e.target.value);
              setSelectedId(null);
            }}
          >
            <option value="">All speakers</option>
            {speakers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="secondary" onClick={() => void load()}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card empty">
          {filter === "needs_review"
            ? "Nothing to review here. Record more clips in Collect, or check the other filters."
            : "No clips match this filter."}
        </div>
      ) : (
        <div className="label-layout">
          <ul className="clip-list card">
            {visible.map((c) => (
              <li key={c.id}>
                <button
                  className={`clip-row ${selected?.id === c.id ? "active" : ""}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <span className="clip-meta">
                    #{c.id} · {c.speaker} · {c.duration_s.toFixed(1)}s
                    <span className={`status ${c.status}`}>{STATUS_LABEL[c.status]}</span>
                  </span>
                  <span className="clip-preview" dir="rtl">
                    {c.text || c.draft_text || "(no text yet)"}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected && (
            <div className="card editor" key={selected.id}>
              <div className="clip-head">
                <span>
                  Clip #{selected.id} · {selected.speaker} · {selected.duration_s.toFixed(1)}s
                </span>
                <span className={`status ${selected.status}`}>{STATUS_LABEL[selected.status]}</span>
              </div>

              <audio key={selected.id} src={audioUrl(selected)} controls autoPlay />

              <p className="muted small">Model's draft</p>
              <p className="urdu draft" dir="rtl">
                {selected.draft_text || "(empty)"}
              </p>

              <p className="muted small">Correct transcript — type exactly what was said</p>
              <textarea
                className="urdu"
                dir="rtl"
                lang="ur"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKey}
                autoFocus
              />
              <p className="muted small">
                {changed === 0
                  ? "No changes to the draft"
                  : `${changed} word edit${changed === 1 ? "" : "s"} vs the draft`}
              </p>

              <div className="actions">
                <button disabled={saving || !text.trim()} onClick={() => save("labelled")}>
                  ✓ Approve <span className="kbd">Ctrl+Enter</span>
                </button>
                <button className="secondary" disabled={saving} onClick={() => setText(selected.draft_text)}>
                  Reset to draft
                </button>
                <button className="danger" disabled={saving} onClick={() => save("rejected")}>
                  Reject (bad audio)
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}