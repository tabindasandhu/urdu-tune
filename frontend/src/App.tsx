import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Project } from "./api";
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

export default function App() {
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

  function open(id: number) {
    setProject(null);
    setProjectId(id);
    setTab("collect");
  }

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
      </header>

      {projectId === null ? (
        <ProjectsPage onOpen={open} />
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
              <div className="stats">
                <Stat label="Clips" value={project.clips} />
                <Stat label="To review" value={project.to_review} />
                <Stat label="Labelled" value={project.labelled} />
                <Stat label="Labelled minutes" value={project.labelled_minutes} />
                <Stat label="Labelled speakers" value={project.speakers} />
              </div>

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

              {tab === "collect" && (
                <CollectTab projectId={project.id} speaker={speaker} setSpeaker={setSpeaker} onChanged={refresh} />
              )}
              {tab === "label" && (
                <LabelTab projectId={project.id} initialSpeaker={labelSpeaker} onChanged={refresh} />
              )}
              {tab === "dataset" && (
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