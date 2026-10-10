import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import type { Project } from "../api";

interface Props {
  onOpen: (projectId: number) => void;
}

export default function ProjectsPage({ onOpen }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [useCase, setUseCase] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .listProjects()
      .then(setProjects)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const project = await api.createProject(name, useCase);
      onOpen(project.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h2>Projects</h2>
      <p className="muted">One project = one use case. Its clips train one model.</p>

      {error && <p className="error">{error}</p>}

      <form className="card form" onSubmit={create}>
        <h3>New project</h3>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="COD order phrases" />
        </label>
        <label>
          Use case
          <input
            value={useCase}
            onChange={(e) => setUseCase(e.target.value)}
            placeholder="Customers confirming or cancelling orders on calls"
          />
        </label>
        <button type="submit" disabled={saving || name.trim().length < 2}>
          {saving ? "Creating…" : "Create project"}
        </button>
      </form>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="muted">No projects yet.</p>
      ) : (
        <div className="grid">
          {projects.map((p) => (
            <button key={p.id} className="card project-card" onClick={() => onOpen(p.id)}>
              <strong>{p.name}</strong>
              <span className="muted">{p.use_case || "No description"}</span>
              <span className="stats-line">
                {p.labelled} labelled · {p.to_review} to review · {p.labelled_minutes} min · {p.speakers} speakers
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}