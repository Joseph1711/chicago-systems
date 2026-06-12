import os
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.environ.get("DATABASE_URL", "")

def get_conn():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    return conn

def execute(query, params=None, fetch=None):
    conn = get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(query, params or ())
                if fetch == "one":
                    return cur.fetchone()
                if fetch == "all":
                    return cur.fetchall()
                return None
    finally:
        conn.close()

def execute_many(queries):
    conn = get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                for query, params in queries:
                    cur.execute(query, params or ())
    finally:
        conn.close()
