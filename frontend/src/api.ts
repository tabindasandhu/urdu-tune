export const API = "http://localhost:8000";

export type ClipStatus = "needs_review" | "labelled" | "rejected";

export interface Project {
  id: number;
  name: string;
  use_case: string;
  created_at: string;
  clips: number;
  labelled: number;
  to_review: number;
  labelled_minutes: number;
  speakers: number;
}

export interface Clip {
  id: number;
  project_id: number;
  speaker: string;
  audio_file: string;
  duration_s: number;
  draft_text: string;
  text: string;
  status: ClipStatus;
  created_at: string;
  updated_at: string;
}

export type Split = "train" | "test";

export interface SpeakerRow {
  speaker: string;
  split: Split;
  labelled: number;
  to_review: number;
  rejected: number;
  minutes: number;
}

export interface SplitTotals {
  speakers: number;
  clips: number;
  minutes: number;
}

export interface Check {
  level: "ok" | "warn" | "error";
  message: string;
}

export interface ExportRecord {
  id: number;
  created_at: string;
  repo_id: string | null;
  commit_sha: string | null;
  local_path: string;
  train_clips: number;
  test_clips: number;
  train_minutes: number;
  test_minutes: number;
}

export interface DatasetSummary {
  speakers: SpeakerRow[];
  totals: { train: SplitTotals; test: SplitTotals };
  sentence_overlap: number;
  checks: Check[];
  can_export: boolean;
  exports: ExportRecord[];
}

// One place that talks to the backend and turns any failure into a readable message.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, init);
  } catch {
    throw new Error("Can't reach the backend. Is uvicorn running on port 8000?");
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (Array.isArray(body.detail)) message = body.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* body wasn't JSON, keep the status text */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export const api = {
  listProjects: () => request<Project[]>("/api/projects"),
  getProject: (id: number) => request<Project>(`/api/projects/${id}`),
  createProject: (name: string, use_case: string) =>
    request<Project>("/api/projects", json("POST", { name, use_case })),

  listClips: (projectId: number, status?: ClipStatus) =>
    request<Clip[]>(`/api/projects/${projectId}/clips${status ? `?status=${status}` : ""}`),
  uploadClip: (projectId: number, speaker: string, audio: Blob, filename: string) => {
    const form = new FormData();
    form.append("speaker", speaker);
    form.append("file", audio, filename);
    return request<Clip>(`/api/projects/${projectId}/clips`, { method: "POST", body: form });
  },
  updateClip: (clipId: number, text: string, status: ClipStatus) =>
    request<Clip>(`/api/clips/${clipId}`, json("PUT", { text, status })),
  deleteClip: (clipId: number) => request<void>(`/api/clips/${clipId}`, { method: "DELETE" }),

  getDataset: (projectId: number) => request<DatasetSummary>(`/api/projects/${projectId}/dataset`),
  setSplit: (projectId: number, speaker: string, split: Split) =>
    request<DatasetSummary>(`/api/projects/${projectId}/splits`, json("PUT", { speaker, split })),
  exportDataset: (projectId: number, repoId: string | null) =>
    request<ExportRecord>(`/api/projects/${projectId}/export`, json("POST", { repo_id: repoId })),
};

export const audioUrl = (clip: Clip) => `${API}/audio/${clip.audio_file}`;