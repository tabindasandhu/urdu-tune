from .config import ASR_MODEL

_model = None


def load_model():
    """Load the drafting model once, at startup."""
    global _model
    if ASR_MODEL.lower() == "none":
        print("ASR drafting is off (ASR_MODEL=none)")
        return
    from faster_whisper import WhisperModel

    print(f"Loading {ASR_MODEL} ...")
    _model = WhisperModel(ASR_MODEL, device="cpu", compute_type="int8")
    print("ASR ready")


def draft(path) -> str:
    """First-draft transcript. Empty string if drafting is off."""
    if _model is None:
        return ""
    segments, _ = _model.transcribe(str(path), language="ur", beam_size=1, vad_filter=True)
    return " ".join(s.text.strip() for s in segments).strip()