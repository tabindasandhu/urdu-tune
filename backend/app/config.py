import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DATA_DIR = BASE_DIR / "data"
AUDIO_DIR = DATA_DIR / "audio"
EXPORT_DIR = DATA_DIR / "exports"
DB_PATH = Path(os.getenv("DB_PATH") or DATA_DIR / "tune.db")

# The model that writes the first-draft transcript. "none" turns drafting off.
ASR_MODEL = os.getenv("ASR_MODEL", "tabindasandhu/whisper-small-urdu-ct2")

# Hugging Face write token, only needed to push datasets. Never commit it.
HF_TOKEN = os.getenv("HF_TOKEN") or None

MIN_CLIP_SECONDS = 1.0
MAX_CLIP_SECONDS = 30.0  # Whisper reads 30 s at a time, so longer clips can't be trained on
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

AUDIO_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH.parent.mkdir(parents=True, exist_ok=True)