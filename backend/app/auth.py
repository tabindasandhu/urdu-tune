"""Two passcodes: friends can record, only the owner can label, split and export."""
import secrets
from typing import Literal, Optional

from fastapi import Header, HTTPException

from .config import ACCESS_CODE, ADMIN_CODE

Role = Literal["admin", "contributor"]


def _same(a: str, b: str) -> bool:
    # compare_digest takes the same time whether the first or last letter is wrong,
    # so nobody can guess the code letter by letter from response times
    return secrets.compare_digest(a.encode(), b.encode())


def role_for(code: Optional[str]) -> Optional[Role]:
    if not ACCESS_CODE and not ADMIN_CODE:
        return "admin"  # running locally with no codes set: no login
    code = code or ""
    if ADMIN_CODE and _same(code, ADMIN_CODE):
        return "admin"
    if ACCESS_CODE and _same(code, ACCESS_CODE):
        return "contributor"
    return None


def contributor(x_access_code: Optional[str] = Header(default=None)) -> Role:
    """Anyone with either code."""
    role = role_for(x_access_code)
    if role is None:
        raise HTTPException(401, "Wrong or missing access code")
    return role


def admin(x_access_code: Optional[str] = Header(default=None)) -> Role:
    """Only the owner's code."""
    if contributor(x_access_code) != "admin":
        raise HTTPException(403, "Only the project owner can do this")
    return "admin"
