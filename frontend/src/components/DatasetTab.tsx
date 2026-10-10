import { useEffect, useState } from "react";
import { api } from "../api";
import type { DatasetSummary, Split, SplitTotals } from "../api";

interface Props {
  projectId: number;
  onReview: (speaker: string) => void; // jump to the Label tab for this speaker
}

const ICON = { ok: "✓", warn: "!", error: "✕" } as const;

export default function DatasetTab({ projectId, onReview }: Props) {  const [data, setData] = useState<DatasetSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [repoId, setRepoId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getDataset(projectId)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function changeSplit(speaker: string, split: Split) {
    setBusy(true);
    setError(null);
    try {
      setData(await api.setSplit(projectId, speaker, split));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runExport(push: boolean) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const record = await api.exportDataset(projectId, push ? repoId.trim() : null);
      setNotice(
        record.repo_id
          ? `Pushed to Hugging Face: ${record.repo_id} (commit ${record.commit_sha?.slice(0, 7)})`
          : `Saved locally: ${record.local_path}`,
      );
      setData(await api.getDataset(projectId)); // refresh the export history
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>;

  const repoValid = /^[\w.-]+\/[\w.-]+$/.test(repoId.trim());

  return (
    <div className="tab">
      <div className="split-cards">
        <SplitCard title="Train" hint="The model learns from these" totals={data.totals.train} />
        <SplitCard title="Test" hint="Locked away, only used to score" totals={data.totals.test} />
      </div>

      <div className="card">
        <h3>Speakers</h3>
        <p className="muted small">
          Every clip from a speaker goes to the same side. Put at least one speaker in Test so the score is
          measured on a voice the model never trained on.
        </p>
        {data.speakers.length === 0 ? (
          <p className="muted">No clips yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Speaker</th>
                  <th>Labelled</th>
                  <th>Minutes</th>
                  <th>To review</th>
                  <th>Rejected</th>
                  <th>Split</th>
                </tr>
              </thead>
              <tbody>
                {data.speakers.map((s) => (
                  <tr key={s.speaker}>
                    <td dir="auto">{s.speaker}</td>
                    <td>{s.labelled}</td>
                    <td>{s.minutes}</td>
                    <td>
                      {s.to_review > 0 ? (
                        <button className="link" onClick={() => onReview(s.speaker)}>
                          {s.to_review} → review
                        </button>
                      ) : (
                        0
                      )}
                    </td>                    <td>{s.rejected}</td>
                    <td>
                      <div className="segmented">
                        {(["train", "test"] as const).map((split) => (
                          <button
                            key={split}
                            className={s.split === split ? "active" : ""}
                            disabled={busy}
                            onClick={() => s.split !== split && changeSplit(s.speaker, split)}
                          >
                            {split === "train" ? "Train" : "Test"}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Checks</h3>
        <ul className="checks">
          {data.checks.map((c, i) => (
            <li key={i} className={c.level}>
              <span className="icon">{ICON[c.level]}</span>
              {c.message}
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <div className="card form">
        <h3>Export</h3>
        <p className="muted small">
          Builds train/ and test/ folders (16 kHz WAV + metadata.csv). Pushing to Hugging Face creates a{" "}
          <strong>private</strong> dataset the training notebook can load.
        </p>
        <label>
          Hugging Face dataset
          <input value={repoId} onChange={(e) => setRepoId(e.target.value)} placeholder="your-username/urdu-tune-cod" />
        </label>
        <div className="actions">
          <button disabled={busy || !data.can_export || !repoValid} onClick={() => runExport(true)}>
            {busy ? "Working…" : "Export and push to Hugging Face"}
          </button>
          <button className="secondary" disabled={busy || !data.can_export} onClick={() => runExport(false)}>
            Export locally only
          </button>
        </div>
      </div>

      {data.exports.length > 0 && (
        <div className="card">
          <h3>Export history</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When (UTC)</th>
                  <th>Train</th>
                  <th>Test</th>
                  <th>Where</th>
                </tr>
              </thead>
              <tbody>
                {data.exports.map((e) => (
                  <tr key={e.id}>
                    <td>{e.created_at.replace("T", " ").slice(0, 16)}</td>
                    <td>
                      {e.train_clips} clips · {e.train_minutes} min
                    </td>
                    <td>
                      {e.test_clips} clips · {e.test_minutes} min
                    </td>
                    <td>
                      {e.repo_id ? (
                        <a
                          href={`https://huggingface.co/datasets/${e.repo_id}/tree/${e.commit_sha}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {e.repo_id} @ {e.commit_sha?.slice(0, 7)}
                        </a>
                      ) : (
                        "local only"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SplitCard({ title, hint, totals }: { title: string; hint: string; totals: SplitTotals }) {
  return (
    <div className="card split-card">
      <span className="muted small">{hint}</span>
      <h3>{title}</h3>
      <div className="split-numbers">
        <span>
          <strong>{totals.clips}</strong> clip{totals.clips === 1 ? "" : "s"}
        </span>
        <span>
          <strong>{totals.minutes}</strong> min
        </span>
        <span>
          <strong>{totals.speakers}</strong> speaker{totals.speakers === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}