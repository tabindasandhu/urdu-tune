import asyncio
from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import asr, dataset, db
from .audio import AudioError, save_as_wav
from .config import AUDIO_DIR, MAX_UPLOAD_BYTES

Status = Literal["needs_review", "labelled", "rejected"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    asr.load_model()
    yield


app = FastAPI(title="Urdu Tune", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")


def clean(text: str) -> str:
    return " ".join(text.split())  # trim and squash extra spaces/newlines


class ProjectIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    use_case: str = Field(default="", max_length=300)


class ClipUpdate(BaseModel):
    text: str = Field(max_length=1000)
    status: Status


class SplitIn(BaseModel):
    speaker: str = Field(min_length=1, max_length=40)
    split: Literal["train", "test"]


class ExportIn(BaseModel):
    # "username/dataset-name", or empty to export only to the local folder
    repo_id: Optional[str] = Field(default=None, pattern=r"^[\w.-]+/[\w.-]+$")


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/docs")


@app.get("/api/health")
def health():
    return {"ok": True, "asr": asr._model is not None}


# ---------- projects ----------

@app.post("/api/projects", status_code=201)
def create_project(body: ProjectIn):
    return db.create_project(clean(body.name), clean(body.use_case))


@app.get("/api/projects")
def list_projects():
    return db.list_projects()


@app.get("/api/projects/{pid}")
def get_project(pid: int):
    project = db.get_project(pid)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


# ---------- clips ----------

@app.post("/api/projects/{pid}/clips", status_code=201)
async def upload_clip(pid: int, speaker: str = Form(...), file: UploadFile = File(...)):
    if not db.get_project(pid):
        raise HTTPException(404, "Project not found")
    speaker = clean(speaker)
    if not 1 <= len(speaker) <= 40:
        raise HTTPException(422, "Speaker name must be 1-40 characters")

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is too big (max 10 MB)")

    try:
        name, duration = await asyncio.to_thread(save_as_wav, raw)
    except AudioError as exc:
        raise HTTPException(422, str(exc))

    draft = await asyncio.to_thread(asr.draft, AUDIO_DIR / name)
    return db.add_clip(pid, speaker, name, duration, draft)


@app.get("/api/projects/{pid}/clips")
def list_clips(pid: int, status: Optional[Status] = None):
    if not db.get_project(pid):
        raise HTTPException(404, "Project not found")
    return db.list_clips(pid, status)


@app.put("/api/clips/{cid}")
def update_clip(cid: int, body: ClipUpdate):
    if not db.get_clip(cid):
        raise HTTPException(404, "Clip not found")
    text = clean(body.text)
    if body.status == "labelled" and not text:
        raise HTTPException(422, "A labelled clip needs a transcript")
    return db.update_clip(cid, text, body.status)


@app.delete("/api/clips/{cid}", status_code=204)
def delete_clip(cid: int):
    clip = db.get_clip(cid)
    if not clip:
        raise HTTPException(404, "Clip not found")
    db.delete_clip(cid)
    (AUDIO_DIR / clip["audio_file"]).unlink(missing_ok=True)
    return Response(status_code=204)


# ---------- dataset (phase 3) ----------

@app.get("/api/projects/{pid}/dataset")
def get_dataset(pid: int):
    if not db.get_project(pid):
        raise HTTPException(404, "Project not found")
    return dataset.summary(pid)


@app.put("/api/projects/{pid}/splits")
def set_split(pid: int, body: SplitIn):
    if not db.get_project(pid):
        raise HTTPException(404, "Project not found")
    speakers = {s["speaker"] for s in db.speaker_stats(pid)}
    if body.speaker not in speakers:
        raise HTTPException(404, "No clips from this speaker")
    db.set_split(pid, body.speaker, body.split)
    return dataset.summary(pid)


@app.post("/api/projects/{pid}/export", status_code=201)
async def export_dataset(pid: int, body: ExportIn):
    if not db.get_project(pid):
        raise HTTPException(404, "Project not found")
    try:
        return await asyncio.to_thread(dataset.export, pid, body.repo_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except dataset.PushError as exc:
        raise HTTPException(502, str(exc))