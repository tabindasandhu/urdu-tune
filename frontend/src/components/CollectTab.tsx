import { useState } from "react";
import type { ChangeEvent } from "react";
import { api } from "../api";
import { MAX_SECONDS, useRecorder } from "../useRecorder";

interface Props {
  projectId: number;
  contributor: boolean; // a friend recording through the shared link
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

export default function CollectTab({ projectId, contributor, speaker, setSpeaker, onChanged }: Props) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [consent, setConsent] = useState(false);
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
  const blocked = noSpeaker || !consent;

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
        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I agree that my voice recordings are stored privately and used to train an Urdu speech recognition
            model.
          </span>
        </label>
      </div>

      {contributor && (
        <div className="card">
          <h3>What to say</h3>
          <p className="muted small">
            Short sentences (2–10 seconds) a customer might say on a delivery call. Use these as ideas and say them in
            your own words, with your own names, areas and numbers. Every recording should be a different sentence.
          </p>
          <ul className="ideas urdu" dir="rtl">
            <li>جی ہاں، میرا آرڈر کنفرم کر دیں</li>
            <li>میں یہ آرڈر کینسل کرنا چاہتی ہوں</li>
            <li>میرا ایڈریس بدل دیں، گلی نمبر سات، ماڈل ٹاؤن</li>
            <li>ڈیلیوری کب تک ہو جائے گی؟</li>
            <li>پیسے کیش میں دوں گا، کتنے بنتے ہیں؟</li>
            <li>رائیڈر کو کہیں شام کے بعد آئے</li>
          </ul>
        </div>
      )}

      <div className="card record-box">
        <button
          className={`record ${recorder.recording ? "on" : ""}`}
          disabled={blocked}
          onClick={recorder.recording ? recorder.stop : recorder.start}
        >
          {recorder.recording ? "■ Stop" : "● Record"}
        </button>
        <div className="timer">
          {recorder.recording
            ? `${recorder.seconds.toFixed(1)}s / ${MAX_SECONDS}s`
            : noSpeaker
              ? "Enter your name first"
              : !consent
                ? "Tick the consent box first"
              : "Say one short sentence from your use case"}
        </div>
        {recorder.recording && (
          <div className="bar">
            <div style={{ width: `${(recorder.seconds / MAX_SECONDS) * 100}%` }} />
          </div>
        )}
        {recorder.error && <p className="error">{recorder.error}</p>}

        <div className="divider">or</div>
        <label className={`file-btn ${blocked ? "disabled" : ""}`}>
          Upload audio files
          <input type="file" accept="audio/*" multiple disabled={blocked} onChange={pickFiles} hidden />
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
