import { useEffect, useRef, useState } from "react";

export const MAX_SECONDS = 29; // backend rejects > 30 s, keep a small margin

// Records from the microphone. Calls onFinished(blob) when recording stops,
// either because the user pressed stop or because it hit MAX_SECONDS.
export function useRecorder(onFinished: (audio: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | undefined>(undefined);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  async function start() {
    if (recorderRef.current) return;
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Noise suppression OFF: training audio should sound like real-world audio.
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
      });
    } catch {
      setError("Microphone is blocked. Allow it from the lock icon in the address bar.");
      return;
    }

    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      window.clearInterval(timerRef.current);
      stream.getTracks().forEach((t) => t.stop()); // turn the mic light off
      recorderRef.current = null;
      setRecording(false);
      const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      onFinishedRef.current(audio);
    };

    const startedAt = Date.now();
    setSeconds(0);
    timerRef.current = window.setInterval(() => {
      const s = (Date.now() - startedAt) / 1000;
      setSeconds(s);
      if (s >= MAX_SECONDS && recorder.state === "recording") recorder.stop();
    }, 200);

    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  // If the component disappears mid-recording, release the mic without uploading.
  useEffect(() => {
    return () => {
      window.clearInterval(timerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
        recorder.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return { recording, seconds, error, start, stop };
}