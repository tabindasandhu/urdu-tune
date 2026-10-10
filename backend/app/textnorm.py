import re
import unicodedata

DIACRITICS = re.compile(r"[\u064B-\u0652\u0670]")  # zabar, zer, pesh, etc.
PUNCTUATION = re.compile(r"[۔،؟!?.,:;\"'()]")


def normalize(text: str) -> str:
    """Same rules as the frontend's words(): used to compare sentences fairly."""
    text = unicodedata.normalize("NFC", text)
    text = DIACRITICS.sub("", text)
    text = text.replace("ي", "ی").replace("ك", "ک")
    text = PUNCTUATION.sub(" ", text)
    return " ".join(text.split())