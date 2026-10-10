import { useState } from "react";
import type { ChangeEvent } from "react";
import { api } from "../api";
import { MAX_SECONDS, useRecorder } from "../useRecorder";

interface Props {
  projectId: number;
  speaker: string;
  setSpeaker: (name: string) => void;
  onChanged: () => void; // tell the parent to refresh project stats
}

interface Upload {
  key: number;
  label: string;
  state: "uploading" | "done" | "error";
  message: string;
}

let nextKey = 1;

export default function CollectTab({ projectId, speaker, setSpeaker, onChanged }: Props) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const recorder = useRecorder((audio) => {
    const ext = audio.type.includes("mp4") ? "m4a" : "webm"; // Safari records mp4, Chrome webm
    void upload(audio, `recording.${ext}`, "Recording");
  });

  function patch(key: number, change: Partial<Upload>) {
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...change } : u)));
  }

  async function upload(audio: Blob, filename: string, label: string) {
    const key = nextKey++;
    setUploads((list) => [{ key, label, state: "uploading", message: "Uploading and drafting…" }, ...list]);
    try {
      const clip = await api.uploadClip(projectId, speaker, audio, filename);
      patch(key, { state: "done", message: clip.draft_text || "(no draft — drafting is off)" });
      onChanged();
    } catch (err) {
      patch(key, { state: "error", message: (err as Error).message });
    }
  }

  async function pickFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same file again
    for (const f of files) await upload(f, f.name, f.name); // one at a time, the CPU is the bottleneck
  }

  const noSpeaker = speaker.trim().length === 0;

  return (
    <div className="tab">
      <div className="card">
        <label>
          Who is speaking?
          <input value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="e.g. Tabinda" />
        </label>
        <p className="muted small">
          We record the speaker so the test set can use voices the model never trained on.
        </p>
      </div>

      <div className="card record-box">
        <button
          className={`record ${recorder.recording ? "on" : ""}`}
          disabled={noSpeaker}
          onClick={recorder.recording ? recorder.stop : recorder.start}
        >
          {recorder.recording ? "■ Stop" : "● Record"}
        </button>
        <div className="timer">
          {recorder.recording
            ? `${recorder.seconds.toFixed(1)}s / ${MAX_SECONDS}s`
            : noSpeaker
              ? "Enter a speaker name first"
              : "Say one short sentence from your use case"}
        </div>
        {recorder.recording && (
          <div className="bar">
            <div style={{ width: `${(recorder.seconds / MAX_SECONDS) * 100}%` }} />
          </div>
        )}
        {recorder.error && <p className="error">{recorder.error}</p>}

        <div className="divider">or</div>
        <label className={`file-btn ${noSpeaker ? "disabled" : ""}`}>
          Upload audio files
          <input type="file" accept="audio/*" multiple disabled={noSpeaker} onChange={pickFiles} hidden />
        </label>
      </div>

      {uploads.length > 0 && (
        <div className="card">
          <h3>This session</h3>
          <ul className="uploads">
            {uploads.map((u) => (
              <li key={u.key} className={u.state}>
                <span className="small muted">{u.label}</span>
                <span className={u.state === "done" ? "urdu" : ""} dir="auto">
                  {u.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}