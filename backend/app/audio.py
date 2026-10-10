import io
import uuid
import wave

import numpy as np
from faster_whisper.audio import decode_audio

from .config import AUDIO_DIR, MAX_CLIP_SECONDS, MIN_CLIP_SECONDS

SAMPLE_RATE = 16_000  # what Whisper expects
MIN_PEAK = 0.01       # quieter than this is basically silence


class AudioError(ValueError):
    """The upload can't be used as a training clip. The message is shown to the user."""


def save_as_wav(raw: bytes):
    """Decode any browser/phone audio, check it, and save it as 16 kHz mono WAV.

    Returns (file_name, duration_seconds).
    """
    try:
        samples = decode_audio(io.BytesIO(raw), sampling_rate=SAMPLE_RATE)
    except Exception as exc:
        raise AudioError("Couldn't read this audio file.") from exc

    duration = len(samples) / SAMPLE_RATE
    if duration < MIN_CLIP_SECONDS:
        raise AudioError(f"Clip is too short ({duration:.1f}s). Record at least {MIN_CLIP_SECONDS:.0f} second.")
    if duration > MAX_CLIP_SECONDS:
        raise AudioError(f"Clip is too long ({duration:.0f}s). Keep it under {MAX_CLIP_SECONDS:.0f} seconds.")
    if float(np.abs(samples).max()) < MIN_PEAK:
        raise AudioError("Clip is silent. Check your microphone.")

    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    name = f"{uuid.uuid4().hex}.wav"
    with wave.open(str(AUDIO_DIR / name), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)  # 16-bit
        f.setframerate(SAMPLE_RATE)
        f.writeframes(pcm.tobytes())
    return name, round(duration, 2)