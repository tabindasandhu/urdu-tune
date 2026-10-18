"""One-time: copy your laptop's recordings and labels into the backup the online app restores from.

Run from the backend folder:  .venv\\Scripts\\python seed_backup.py tabindasandhu/urdu-tune-data
"""
import sys

from app import backup, db

repo = sys.argv[1] if len(sys.argv) > 1 else "tabindasandhu/urdu-tune-data"
db.init_db()
sha = backup.push_once(repo)
print(f"Uploaded audio + database to {repo} (commit {sha[:7]})")
