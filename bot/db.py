import os
import re
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.environ.get("DATABASE_URL", "")

_DOLLAR_RE = re.compile(r'\$(\d+)')

def _to_psycopg2(query: str) -> str:
    return _DOLLAR_RE.sub('%s', query)

def get_conn():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    return conn

def execute(query, params=None, fetch=None):
    query = _to_psycopg2(query)
    conn = get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(query, params or ())
                if fetch == "one":
                    row = cur.fetchone()
                    return dict(row) if row else None
                if fetch == "all":
                    rows = cur.fetchall()
                    return [dict(r) for r in rows] if rows else []
                return None
    finally:
        conn.close()

def execute_many(queries):
    conn = get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                for query, params in queries:
                    cur.execute(_to_psycopg2(query), params or ())
    finally:
        conn.close()
