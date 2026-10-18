import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DATA_DIR = Path(os.getenv("DATA_DIR") or BASE_DIR / "data")
AUDIO_DIR = DATA_DIR / "audio"
EXPORT_DIR = DATA_DIR / "exports"
DB_PATH = Path(os.getenv("DB_PATH") or DATA_DIR / "tune.db")

# The model that writes the first-draft transcript. "none" turns drafting off.
ASR_MODEL = os.getenv("ASR_MODEL", "tabindasandhu/whisper-small-urdu-ct2")

# Hugging Face write token, only needed to push datasets. Never commit it.
HF_TOKEN = os.getenv("HF_TOKEN") or None

# ---- Online deployment (all optional; leave unset when running on your laptop) ----
# Passcodes: friends get ACCESS_CODE (record only), you keep ADMIN_CODE (everything).
# If neither is set, there is no login at all, like before.
ACCESS_CODE = os.getenv("ACCESS_CODE") or None
ADMIN_CODE = os.getenv("ADMIN_CODE") or None
# Private HF dataset that keeps a live backup of recordings + the database.
BACKUP_REPO = os.getenv("BACKUP_REPO") or None
# Folder with the built frontend (npm run build). Set in Docker so one server serves everything.
STATIC_DIR = Path(os.getenv("STATIC_DIR")) if os.getenv("STATIC_DIR") else None

MIN_CLIP_SECONDS = 1.0
MAX_CLIP_SECONDS = 30.0  # Whisper reads 30 s at a time, so longer clips can't be trained on
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

AUDIO_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
