import psycopg2
from app.core.config import DATABASE_URL

def get_connection():
    return psycopg2.connect(DATABASE_URL)
