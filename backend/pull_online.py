"""Bring friends' recordings from the online app into this laptop's Urdu Tune.

Run from the backend folder (uvicorn can keep running):
    .venv\\Scripts\\python pull_online.py

Only clips this laptop doesn't have yet are added. Each one gets a draft from your
Whisper model here, then you label and export on the laptop exactly as before.
"""
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

from huggingface_hub import snapshot_download

from app import asr, db
from app.config import AUDIO_DIR, HF_TOKEN

REPO = sys.argv[1] if len(sys.argv) > 1 else "tabindasandhu/urdu-tune-data"


def merge(online_dir: Path) -> int:
    """Copy clips from an online backup folder (audio/ + backup.db) into the local database."""
    online = sqlite3.connect(online_dir / "backup.db")
    online.row_factory = sqlite3.Row
    projects = {r["id"]: dict(r) for r in online.execute("SELECT * FROM projects")}
    clips = [dict(r) for r in online.execute("SELECT * FROM clips ORDER BY id")]
    online.close()

    local_projects = {p["name"]: p["id"] for p in db.list_projects()}
    have = {c["audio_file"] for pid in local_projects.values() for c in db.list_clips(pid)}
    new = [c for c in clips if c["audio_file"] not in have]  # audio file names are unique ids
    if not new:
        print("Nothing new online.")
        return 0

    print(f"{len(new)} new clips. Drafting them with your Whisper model...\n")
    asr.load_model()
    added = 0
    for i, c in enumerate(new, 1):
        src = online_dir / "audio" / c["audio_file"]
        if not src.exists():
            print(f"[{i}/{len(new)}] SKIP  {c['audio_file']} (audio missing from backup)")
            continue
        project = projects[c["project_id"]]
        if project["name"] not in local_projects:  # a project you created online
            local_projects[project["name"]] = db.create_project(project["name"], project["use_case"])["id"]
        shutil.copy(src, AUDIO_DIR / c["audio_file"])
        draft = asr.draft(AUDIO_DIR / c["audio_file"])
        db.add_clip(local_projects[project["name"]], c["speaker"], c["audio_file"], c["duration_s"], draft)
        added += 1
        print(f"[{i}/{len(new)}] {c['speaker']:<12} {c['duration_s']:.1f}s  {draft[:50]}")
    return added


def main():
    db.init_db()
    with tempfile.TemporaryDirectory() as tmp:
        print(f"Downloading the latest backup from {REPO}...")
        snapshot_download(REPO, repo_type="dataset", local_dir=tmp, token=HF_TOKEN,
                          allow_patterns=["audio/*", "backup.db"])
        added = merge(Path(tmp))
    if added:
        print(f"\nDone: {added} clips added. Open the Label tab, they're under 'To review'.")


if __name__ == "__main__":
    main()
