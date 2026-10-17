"""x-internal-key check (contract §3.3). Applied to every route except health and docs.

INTERNAL_API_KEY unset -> no check (local dev). The key is compared in constant time and never logged.
"""
import hmac
from typing import Optional

from fastapi import Header, HTTPException, Request

from app.core import config

OPEN_PATHS = {"/", "/health", "/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"}


def require_internal_key(request: Request, x_internal_key: Optional[str] = Header(default=None)) -> None:
    expected = config.INTERNAL_API_KEY
    if not expected or request.url.path in OPEN_PATHS:
        return
    if not x_internal_key or not hmac.compare_digest(x_internal_key.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid internal key")