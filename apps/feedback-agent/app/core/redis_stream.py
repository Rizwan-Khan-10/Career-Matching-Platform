import json
import time
import redis
from app.core.config import REDIS_URL

r = redis.from_url(REDIS_URL, decode_responses=True)

def ensure_group(stream: str, group: str):
    try:
        r.xgroup_create(stream, group, id="0", mkstream=True)
    except redis.exceptions.ResponseError:
        pass

def publish(stream: str, data: dict):
    r.xadd(stream, {"data": json.dumps(data)})

def consume_loop(stream: str, group: str, consumer_name: str, handler):
    ensure_group(stream, group)
    while True:
        try:
            resp = r.xreadgroup(group, consumer_name, {stream: ">"}, count=5, block=5000)
            if resp:
                for _, messages in resp:
                    for msg_id, fields in messages:
                        data = json.loads(fields["data"])
                        try:
                            handler(data)
                            r.xack(stream, group, msg_id)
                        except Exception as e:
                            print(f"Error handling message {msg_id}: {e}")
        except Exception as e:
            print(f"Redis stream error: {e}")
            time.sleep(2)
