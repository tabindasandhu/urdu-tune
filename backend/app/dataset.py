"""Phase 3: turn labelled clips into a train/test dataset, check it, and export it."""
import csv
import shutil

from . import db
from .config import AUDIO_DIR, EXPORT_DIR, HF_TOKEN
from .textnorm import normalize

MIN_TRAIN_MINUTES = 5.0
MIN_TEST_MINUTES = 1.0


class PushError(RuntimeError):
    """The local export worked but uploading to Hugging Face failed."""


def _split_totals(speakers, split):
    rows = [s for s in speakers if s["split"] == split and s["labelled"] > 0]
    return {
        "speakers": len(rows),
        "clips": sum(s["labelled"] for s in rows),
        "minutes": round(sum(s["minutes"] for s in rows), 2),
    }


def summary(project_id):
    speakers = db.speaker_stats(project_id)
    clips = db.labelled_clips_with_split(project_id)
    totals = {"train": _split_totals(speakers, "train"), "test": _split_totals(speakers, "test")}

    # Sentence overlap: how many test sentences also appear (word for word) in training?
    train_sentences = {normalize(c["text"]) for c in clips if c["split"] == "train"}
    test_clips = [c for c in clips if c["split"] == "test"]
    seen = sum(normalize(c["text"]) in train_sentences for c in test_clips)
    overlap = round(seen / len(test_clips), 3) if test_clips else 0.0

    checks = []

    def check(level, message):
        checks.append({"level": level, "message": message})

    if totals["train"]["clips"] == 0:
        check("error", "No training clips. Label some clips from at least one train speaker.")
    if totals["test"]["clips"] == 0:
        check("error", "No test speaker. Mark at least one speaker as Test.")
    if totals["train"]["clips"] and totals["test"]["clips"]:
        check("ok", "Train and test use different speakers, so the score is fair.")
    if 0 < totals["train"]["minutes"] < MIN_TRAIN_MINUTES:
        check("warn", f"Only {totals['train']['minutes']} min of training audio. "
                      f"Aim for {MIN_TRAIN_MINUTES:.0f}+ min or gains will be small and noisy.")
    if 0 < totals["test"]["minutes"] < MIN_TEST_MINUTES:
        check("warn", f"Only {totals['test']['minutes']} min of test audio. "
                      f"Each wrong word will swing WER a lot. Aim for {MIN_TEST_MINUTES:.0f}+ min.")
    if test_clips and overlap > 0:
        check("warn", f"{overlap:.0%} of test sentences also appear in training. The test checks new "
                      "voices, but not new sentences, so it may look better than real calls.")
    empty_test = [s["speaker"] for s in speakers if s["split"] == "test" and s["labelled"] == 0]
    if empty_test:
        check("warn", f"{', '.join(empty_test)} set to Test but no labelled clips yet. "
                      "Label their clips first, or they add nothing to the test.")
    pending = sum(s["to_review"] for s in speakers)
    if pending:
        check("warn", f"{pending} clip(s) still need review and won't be exported.")
    return {
        "speakers": speakers,
        "totals": totals,
        "sentence_overlap": overlap,
        "checks": checks,
        "can_export": not any(c["level"] == "error" for c in checks),
        "exports": db.list_exports(project_id),
    }


def export(project_id, repo_id=None):
    """Write train/ and test/ folders (WAV + metadata.csv), then optionally push to Hugging Face."""
    info = summary(project_id)
    if not info["can_export"]:
        raise ValueError("Fix the errors in the checks before exporting.")

    out = EXPORT_DIR / f"project_{project_id}"
    if out.exists():
        shutil.rmtree(out)  # always rebuild from the database, never mix old and new files

    for split in ("train", "test"):
        (out / split).mkdir(parents=True)
        rows = [c for c in db.labelled_clips_with_split(project_id) if c["split"] == split]
        with open(out / split / "metadata.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["file_name", "transcription", "speaker", "duration_s", "clip_id"])
            for c in rows:
                name = f"clip_{c['id']:06d}.wav"
                shutil.copy(AUDIO_DIR / c["audio_file"], out / split / name)
                writer.writerow([name, c["text"], c["speaker"], c["duration_s"], c["id"]])

    t = info["totals"]
    (out / "README.md").write_text(
        "# Urdu Tune dataset\n\n"
        f"- Train: {t['train']['clips']} clips, {t['train']['minutes']} min, {t['train']['speakers']} speakers\n"
        f"- Test: {t['test']['clips']} clips, {t['test']['minutes']} min, {t['test']['speakers']} speakers\n"
        "- Test speakers never appear in train.\n"
        "- Audio: 16 kHz mono WAV. Text: human-corrected transcripts.\n"
        "- Contains real people's voices. Keep this repository private.\n",
        encoding="utf-8",
    )

    commit_sha = None
    if repo_id:
        if not HF_TOKEN:
            raise ValueError("HF_TOKEN is missing from backend/.env, so I can't push to Hugging Face.")
        from huggingface_hub import HfApi

        try:
            api = HfApi(token=HF_TOKEN)
            api.create_repo(repo_id, repo_type="dataset", private=True, exist_ok=True)
            commit = api.upload_folder(
                repo_id=repo_id,
                repo_type="dataset",
                folder_path=out,
                commit_message=f"Export: {t['train']['clips']} train / {t['test']['clips']} test clips",
                delete_patterns=["train/*", "test/*"],  # remove clips that were deleted or re-split
            )
        except Exception as exc:
            raise PushError(f"Saved locally, but the upload to Hugging Face failed: {exc}") from exc
        commit_sha = commit.oid

    return db.add_export(project_id, repo_id, commit_sha, str(out), t)