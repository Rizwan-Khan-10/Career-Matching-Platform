"""JSON log lines: ts, level, service, requestId, msg (coding standards 3.11). Never log resume text, e-mails or tokens."""
import contextvars
import json
import logging
import sys
import uuid
from datetime import datetime, timezone

from app.core.config import LOG_LEVEL, SERVICE_NAME

# requestId of the message being handled right now (contract section 3, rule 1)
request_id_var: contextvars.ContextVar = contextvars.ContextVar("request_id", default=None)


def bind_request_id(value=None) -> str:
    """Use the requestId of the incoming event, or create one. Returns it."""
    rid = value or str(uuid.uuid4())
    request_id_var.set(rid)
    return rid


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "service": SERVICE_NAME,
            "requestId": request_id_var.get(),
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging() -> None:
    root = logging.getLogger()
    if getattr(root, "_json_configured", False):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.handlers = [handler]
    root.setLevel(LOG_LEVEL.upper())
    logging.getLogger("httpx").setLevel(logging.WARNING)
    root._json_configured = True
