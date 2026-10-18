import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, AUTH_EVENT, getCode, setCode } from "./api";
import type { Project, Role } from "./api";
import ProjectsPage from "./components/ProjectsPage";
import CollectTab from "./components/CollectTab";
import LabelTab from "./components/LabelTab";
import DatasetTab from "./components/DatasetTab";

type Tab = "collect" | "label" | "dataset" | "train" | "evaluate";

const TABS: { id: Tab; label: string; ready: boolean }[] = [
  { id: "collect", label: "1. Collect", ready: true },
  { id: "label", label: "2. Label", ready: true },
  { id: "dataset", label: "3. Dataset", ready: true },
  { id: "train", label: "4. Train", ready: false },
  { id: "evaluate", label: "5. Evaluate", ready: false },
];

// A shared link can carry the code (…/?code=XXXX). Save it and remove it from the address bar.
function takeCodeFromUrl() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (code) {
    setCode(code.trim());
    url.searchParams.delete("code");
    window.history.replaceState(null, "", url.toString());
  }
}

export default function App() {
  const [role, setRole] = useState<Role | null | "checking">("checking");

  useEffect(() => {
    takeCodeFromUrl();
    api
      .me()
      .then((r) => setRole(r.role))
      .catch(() => setRole(null));
    const signOut = () => setRole(null);
    window.addEventListener(AUTH_EVENT, signOut);
    return () => window.removeEventListener(AUTH_EVENT, signOut);
  }, []);

  if (role === "checking") return <div className="app"><p className="muted">Loading…</p></div>;
  if (role === null) return <Gate onSignedIn={setRole} />;
  return (
    <Workspace
      role={role}
      onSignOut={() => {
        setCode("");
        setRole(null);
      }}
    />
  );
}

function Gate({ onSignedIn }: { onSignedIn: (role: Role) => void }) {
  const [code, setCodeInput] = useState(getCode());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCode(code.trim());
    try {
      onSignedIn((await api.me()).role);
    } catch (err) {
      setCode("");
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Urdu Tune</h1>
        <span className="muted">Help improve Urdu speech recognition</span>
      </header>
      <form className="card form gate" onSubmit={submit}>
        <h3>Enter the access code</h3>
        <p className="muted small">Ask Tabinda for the code if you don't have it.</p>
        <input value={code} onChange={(e) => setCodeInput(e.target.value)} autoFocus />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || code.trim().length === 0}>
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

function Workspace({ role, onSignOut }: { role: Role; onSignOut: () => void }) {
  const isAdmin = role === "admin";
  const [projectId, setProjectId] = useState<number | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("collect");
  const [speaker, setSpeaker] = useState("");
  const [labelSpeaker, setLabelSpeaker] = useState(""); // Label tab's speaker filter
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (projectId === null) return;
    api
      .getProject(projectId)
      .then((p) => {
        setProject(p);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // useCallback keeps the same function between renders, so ProjectsPage doesn't reload in a loop
  const open = useCallback((id: number) => {
    setProject(null);
    setProjectId(id);
    setTab("collect");
  }, []);

  function goTo(next: Tab) {
    setLabelSpeaker("");
    setTab(next);
    refresh(); // keep the stats row fresh when switching tabs
  }

  return (
    <div className="app">
      <header>
        <h1 onClick={() => setProjectId(null)}>Urdu Tune</h1>
        <span className="muted">Improve Urdu speech recognition with your own audio</span>
        {getCode() && (
          <button className="link signout" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </header>

      {projectId === null ? (
        <ProjectsPage onOpen={open} canCreate={isAdmin} />
      ) : (
        <div className="page">
          <button className="link" onClick={() => setProjectId(null)}>
            ← All projects
          </button>
          {error && <p className="error">{error}</p>}
          {project && (
            <>
              <h2>{project.name}</h2>
              <p className="muted">{project.use_case}</p>
              {isAdmin && (
              <div className="stats">
                <Stat label="Clips" value={project.clips} />
                <Stat label="To review" value={project.to_review} />
                <Stat label="Labelled" value={project.labelled} />
                <Stat label="Labelled minutes" value={project.labelled_minutes} />
                <Stat label="Labelled speakers" value={project.speakers} />
              </div>
              )}

              {isAdmin && (
              <nav className="tabs">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    className={tab === t.id ? "active" : ""}
                    disabled={!t.ready}
                    title={t.ready ? "" : "Coming in a later phase"}
                    onClick={() => goTo(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
              )}

              {tab === "collect" && (
                <CollectTab projectId={project.id} contributor={!isAdmin} speaker={speaker} setSpeaker={setSpeaker} onChanged={refresh} />
              )}
              {isAdmin && tab === "label" && (
                <LabelTab projectId={project.id} initialSpeaker={labelSpeaker} onChanged={refresh} />
              )}
              {isAdmin && tab === "dataset" && (
                <DatasetTab
                  projectId={project.id}
                  onReview={(name) => {
                    setLabelSpeaker(name);
                    setTab("label");
                  }}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}