from contextlib import contextmanager
import psycopg2
from app.core.config import DATABASE_URL


@contextmanager
def get_conn():
    """Opens a connection, commits on success, rolls back on error, always closes."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_connection():
    """Kept for backwards compatibility with other modules."""
    return psycopg2.connect(DATABASE_URL)