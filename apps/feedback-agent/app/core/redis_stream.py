import json
import time
import redis
from app.core.config import REDIS_URL

r = redis.from_url(
    REDIS_URL,
    decode_responses=True,
    socket_timeout=10,
    socket_connect_timeout=10,
    socket_keepalive=True,
)

RECLAIM_IDLE_MS = 60_000
RECLAIM_EVERY_SECONDS = 30
MAX_DELIVERIES = 4


def ensure_group(stream: str, group: str):
    try:
        r.xgroup_create(stream, group, id="0", mkstream=True)
    except redis.exceptions.ResponseError:
        pass  # group already exists


def publish(stream: str, data: dict):
    r.xadd(stream, {"data": json.dumps(data)})


def _dead_letter(stream, group, msg_id, fields, error, on_dead, data=None):
    try:
        r.xadd(f"{stream}.dead", {"origId": msg_id, "error": str(error)[:500], "data": fields.get("data", "")})
    finally:
        r.xack(stream, group, msg_id)
    if on_dead and data is not None:
        try:
            on_dead(data, error)
        except Exception as exc:
            print(f"on_dead callback failed for {msg_id}: {exc}")


def _process(stream, group, msg_id, fields, handler, on_dead, deliveries):
    try:
        data = json.loads(fields["data"])
    except Exception as exc:
        _dead_letter(stream, group, msg_id, fields, f"undecodable message: {exc}", None)
        return
    try:
        handler(data)
        r.xack(stream, group, msg_id)
    except Exception as exc:
        print(f"Error handling {stream} {msg_id} (delivery {deliveries}/{MAX_DELIVERIES}): {exc}")
        if deliveries >= MAX_DELIVERIES:
            _dead_letter(stream, group, msg_id, fields, exc, on_dead, data)
        # else: stays pending -> reclaimed after RECLAIM_IDLE_MS


def _reclaim(stream, group, consumer_name, handler, on_dead):
    try:
        res = r.xautoclaim(stream, group, consumer_name, min_idle_time=RECLAIM_IDLE_MS, start_id="0-0", count=10)
    except redis.exceptions.ResponseError:
        return
    messages = res[1] if len(res) > 1 else []
    for msg_id, fields in messages:
        if not fields:  # entry was trimmed from the stream
            r.xack(stream, group, msg_id)
            continue
        info = r.xpending_range(stream, group, min=msg_id, max=msg_id, count=1)
        deliveries = info[0]["times_delivered"] if info else 1
        _process(stream, group, msg_id, fields, handler, on_dead, deliveries)


def consume_loop(stream: str, group: str, consumer_name: str, handler, on_dead=None):
    """handler(data: dict) -> None. Raise to signal failure (message is retried, then dead-lettered)."""
    ensure_group(stream, group)
    last_reclaim = 0.0
    while True:
        try:
            if time.time() - last_reclaim > RECLAIM_EVERY_SECONDS:
                _reclaim(stream, group, consumer_name, handler, on_dead)
                last_reclaim = time.time()
            resp = r.xreadgroup(group, consumer_name, {stream: ">"}, count=5, block=5000)
            if resp:
                for _, messages in resp:
                    for msg_id, fields in messages:
                        _process(stream, group, msg_id, fields, handler, on_dead, 1)
        except Exception as exc:
            print(f"Redis stream error ({stream}): {exc}")
            time.sleep(2)