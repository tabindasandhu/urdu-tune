import sqlite3
from datetime import datetime, timezone

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    use_case   TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clips (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    speaker     TEXT NOT NULL,
    audio_file  TEXT NOT NULL,
    duration_s  REAL NOT NULL,
    draft_text  TEXT NOT NULL DEFAULT '',
    text        TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'needs_review',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clips_project ON clips(project_id);
CREATE TABLE IF NOT EXISTS speaker_splits (
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    speaker     TEXT NOT NULL,
    split       TEXT NOT NULL CHECK (split IN ('train', 'test')),
    PRIMARY KEY (project_id, speaker)
);
CREATE TABLE IF NOT EXISTS exports (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at     TEXT NOT NULL,
    repo_id        TEXT,
    commit_sha     TEXT,
    local_path     TEXT NOT NULL,
    train_clips    INTEGER NOT NULL,
    test_clips     INTEGER NOT NULL,
    train_minutes  REAL NOT NULL,
    test_minutes   REAL NOT NULL
);
"""


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with _conn() as conn:
        conn.executescript(SCHEMA)


# ---------- projects ----------

PROJECT_STATS = """
SELECT p.*,
       COUNT(c.id)                                                       AS clips,
       COALESCE(SUM(c.status = 'labelled'), 0)                           AS labelled,
       COALESCE(SUM(c.status = 'needs_review'), 0)                       AS to_review,
       ROUND(COALESCE(SUM(CASE WHEN c.status = 'labelled'
                               THEN c.duration_s END), 0) / 60.0, 2)     AS labelled_minutes,
       COUNT(DISTINCT CASE WHEN c.status = 'labelled' THEN c.speaker END) AS speakers
FROM projects p
LEFT JOIN clips c ON c.project_id = p.id
"""


def create_project(name, use_case):
    with _conn() as conn:
        cur = conn.execute(
            "INSERT INTO projects (name, use_case, created_at) VALUES (?, ?, ?)",
            (name, use_case, _now()),
        )
        pid = cur.lastrowid
    return get_project(pid)


def list_projects():
    with _conn() as conn:
        rows = conn.execute(PROJECT_STATS + " GROUP BY p.id ORDER BY p.id DESC").fetchall()
    return [dict(r) for r in rows]


def get_project(pid):
    with _conn() as conn:
        row = conn.execute(PROJECT_STATS + " WHERE p.id = ? GROUP BY p.id", (pid,)).fetchone()
    return dict(row) if row else None


# ---------- clips ----------

def add_clip(project_id, speaker, audio_file, duration_s, draft_text):
    now = _now()
    with _conn() as conn:
        cur = conn.execute(
            """INSERT INTO clips (project_id, speaker, audio_file, duration_s,
                                  draft_text, text, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'needs_review', ?, ?)""",
            # text starts as the draft, so the person only fixes the mistakes
            (project_id, speaker, audio_file, duration_s, draft_text, draft_text, now, now),
        )
        cid = cur.lastrowid
    return get_clip(cid)


def list_clips(project_id, status=None):
    sql = "SELECT * FROM clips WHERE project_id = ?"
    args = [project_id]
    if status:
        sql += " AND status = ?"
        args.append(status)
    with _conn() as conn:
        rows = conn.execute(sql + " ORDER BY id DESC", args).fetchall()
    return [dict(r) for r in rows]


def get_clip(cid):
    with _conn() as conn:
        row = conn.execute("SELECT * FROM clips WHERE id = ?", (cid,)).fetchone()
    return dict(row) if row else None


def update_clip(cid, text, status):
    with _conn() as conn:
        conn.execute(
            "UPDATE clips SET text = ?, status = ?, updated_at = ? WHERE id = ?",
            (text, status, _now(), cid),
        )
    return get_clip(cid)


def delete_clip(cid):
    with _conn() as conn:
        conn.execute("DELETE FROM clips WHERE id = ?", (cid,))


# ---------- speakers and splits ----------

def speaker_stats(project_id):
    """One row per speaker: their split (train if never set) and clip counts."""
    sql = """
    SELECT c.speaker,
           COALESCE(s.split, 'train')                                     AS split,
           COALESCE(SUM(c.status = 'labelled'), 0)                        AS labelled,
           COALESCE(SUM(c.status = 'needs_review'), 0)                    AS to_review,
           COALESCE(SUM(c.status = 'rejected'), 0)                        AS rejected,
           ROUND(COALESCE(SUM(CASE WHEN c.status = 'labelled'
                                   THEN c.duration_s END), 0) / 60.0, 2)  AS minutes
    FROM clips c
    LEFT JOIN speaker_splits s ON s.project_id = c.project_id AND s.speaker = c.speaker
    WHERE c.project_id = ?
    GROUP BY c.speaker
    ORDER BY c.speaker
    """
    with _conn() as conn:
        return [dict(r) for r in conn.execute(sql, (project_id,)).fetchall()]


def set_split(project_id, speaker, split):
    with _conn() as conn:
        conn.execute(
            """INSERT INTO speaker_splits (project_id, speaker, split) VALUES (?, ?, ?)
               ON CONFLICT (project_id, speaker) DO UPDATE SET split = excluded.split""",
            (project_id, speaker, split),
        )


def labelled_clips_with_split(project_id):
    sql = """
    SELECT c.*, COALESCE(s.split, 'train') AS split
    FROM clips c
    LEFT JOIN speaker_splits s ON s.project_id = c.project_id AND s.speaker = c.speaker
    WHERE c.project_id = ? AND c.status = 'labelled'
    ORDER BY c.id
    """
    with _conn() as conn:
        return [dict(r) for r in conn.execute(sql, (project_id,)).fetchall()]


# ---------- exports ----------

def add_export(project_id, repo_id, commit_sha, local_path, stats):
    with _conn() as conn:
        cur = conn.execute(
            """INSERT INTO exports (project_id, created_at, repo_id, commit_sha, local_path,
                                    train_clips, test_clips, train_minutes, test_minutes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (project_id, _now(), repo_id, commit_sha, local_path,
             stats["train"]["clips"], stats["test"]["clips"],
             stats["train"]["minutes"], stats["test"]["minutes"]),
        )
        eid = cur.lastrowid
        row = conn.execute("SELECT * FROM exports WHERE id = ?", (eid,)).fetchone()
    return dict(row)


def list_exports(project_id):
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM exports WHERE project_id = ? ORDER BY id DESC", (project_id,)
        ).fetchall()
    return [dict(r) for r in rows]