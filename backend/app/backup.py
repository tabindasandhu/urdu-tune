"""Keep recordings safe on a free Hugging Face Space.

A free Space forgets its disk on every restart. So:
- restore(): on start-up, download the last backup (audio + database) if the disk is empty
- start():   every 2 minutes, upload anything new to a private HF dataset
- flush():   on shutdown, upload one last time
"""
import logging
import shutil
import sqlite3

from huggingface_hub import CommitScheduler, HfApi, snapshot_download
from huggingface_hub.errors import RepositoryNotFoundError

from .config import BACKUP_REPO, DATA_DIR, DB_PATH, HF_TOKEN

log = logging.getLogger("uvicorn.error")
SNAPSHOT = DATA_DIR / "backup.db"          # a consistent copy of the live database
PATTERNS = ["audio/*", "backup.db"]        # exports are left out, they can be rebuilt
_scheduler = None


def snapshot_db(force: bool = False) -> None:
    """Copy the database with SQLite's backup API (safe even while it is being written)."""
    if not DB_PATH.exists():
        return
    if not force and SNAPSHOT.exists() and SNAPSHOT.stat().st_mtime >= DB_PATH.stat().st_mtime:
        return  # nothing changed since the last copy, so don't create a pointless commit
    src, dst = sqlite3.connect(DB_PATH), sqlite3.connect(SNAPSHOT)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()


class _Scheduler(CommitScheduler):
    def push_to_hub(self):
        snapshot_db()
        return super().push_to_hub()


def restore() -> None:
    """Bring back the last backup. Refuses to start rather than start empty by mistake,
    because an empty database would then be backed up over the good one."""
    if not BACKUP_REPO or DB_PATH.exists():
        return
    api = HfApi(token=HF_TOKEN)
    try:
        api.whoami()
    except Exception as exc:
        raise RuntimeError("HF_TOKEN is missing or invalid. Paste a Write token that starts with hf_") from exc
    try:
        files = api.list_repo_files(BACKUP_REPO, repo_type="dataset")
    except RepositoryNotFoundError:
        log.info("No backup found in %s yet, starting empty", BACKUP_REPO)
        return
    if "backup.db" not in files:
        log.info("Backup repo %s has no database yet, starting empty", BACKUP_REPO)
        return
    snapshot_download(BACKUP_REPO, repo_type="dataset", local_dir=DATA_DIR,
                      allow_patterns=PATTERNS, token=HF_TOKEN)
    if not SNAPSHOT.exists():
        raise RuntimeError(f"Could not download the backup from {BACKUP_REPO}. Not starting empty.")
    shutil.copy(SNAPSHOT, DB_PATH)
    log.info("Restored database and audio from %s", BACKUP_REPO)


def start() -> None:
    global _scheduler
    if BACKUP_REPO and _scheduler is None:
        _scheduler = _Scheduler(repo_id=BACKUP_REPO, repo_type="dataset", folder_path=DATA_DIR,
                                every=2, private=True, token=HF_TOKEN, allow_patterns=PATTERNS)
        log.info("Backing up to %s every 2 minutes", BACKUP_REPO)


def flush() -> None:
    if _scheduler is not None:
        try:
            _scheduler.trigger().result(timeout=60)
        except Exception as exc:  # never block shutdown on a failed upload
            log.warning("Final backup failed: %s", exc)


def push_once(repo_id: str) -> str:
    """Upload the current local data in one go (used by seed_backup.py)."""
    snapshot_db(force=True)
    api = HfApi(token=HF_TOKEN)
    api.create_repo(repo_id, repo_type="dataset", private=True, exist_ok=True)
    info = api.upload_folder(repo_id=repo_id, repo_type="dataset", folder_path=DATA_DIR,
                             allow_patterns=PATTERNS, commit_message="Seed from laptop")
    return info.oid
