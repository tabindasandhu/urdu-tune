"""Upload a folder of audio clips into an Urdu Tune project.

Usage (from the backend folder, with uvicorn running):
    .venv\\Scripts\\python upload_folder.py "C:\\path\\to\\folder" --speaker Ali
    .venv\\Scripts\\python upload_folder.py "C:\\path\\to\\folder" --speaker Ali --project 2
"""
import argparse
import json
import mimetypes
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

API = "http://127.0.0.1:8000/api"
# Talk to localhost directly, even if the computer has a proxy set
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))

AUDIO_TYPES = {".wav", ".mp3", ".m4a", ".ogg", ".opus", ".webm", ".flac", ".aac", ".mp4"}


def get_json(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.load(r)


def upload(project_id, speaker, path):
    """Build a multipart form by hand (same as the browser's FormData) and POST it."""
    boundary = uuid.uuid4().hex
    ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="speaker"\r\n\r\n{speaker}\r\n'
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{path.name}"\r\n'
        f"Content-Type: {ctype}\r\n\r\n"
    ).encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{API}/projects/{project_id}/clips", data=body, method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:  # drafting can take a few seconds
        return json.load(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--speaker", required=True)
    ap.add_argument("--project", type=int)
    args = ap.parse_args()

    try:
        projects = get_json(f"{API}/projects")
    except urllib.error.URLError:
        sys.exit("Can't reach the backend. Start uvicorn first.")

    if args.project is None:
        if len(projects) != 1:
            print("Pick a project with --project:")
            for p in projects:
                print(f"  {p['id']}: {p['name']}")
            sys.exit(1)
        args.project = projects[0]["id"]

    files = sorted(p for p in Path(args.folder).iterdir() if p.suffix.lower() in AUDIO_TYPES)
    if not files:
        sys.exit(f"No audio files found in {args.folder}")

    print(f"Uploading {len(files)} files as speaker '{args.speaker}' to project {args.project}\n")
    ok, failed = 0, []
    for i, f in enumerate(files, 1):
        try:
            clip = upload(args.project, args.speaker, f)
            ok += 1
            print(f"[{i}/{len(files)}] OK    {f.name}  ({clip['duration_s']:.1f}s)  {clip['draft_text'][:50]}")
        except urllib.error.HTTPError as e:
            reason = json.loads(e.read() or b"{}").get("detail", e.reason)
            failed.append((f.name, reason))
            print(f"[{i}/{len(files)}] SKIP  {f.name}  -> {reason}")

    print(f"\nDone: {ok} uploaded, {len(failed)} skipped.")
    for name, reason in failed:
        print(f"  {name}: {reason}")


if __name__ == "__main__":
    main()