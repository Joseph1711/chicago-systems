import os
import re
import logging
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger("bot.db")

_DOLLAR_RE = re.compile(r'\$(\d+)')

def _to_psycopg2(query: str) -> str:
    return _DOLLAR_RE.sub('%s', query)

def _mask_url(url: str) -> str:
    return re.sub(r'(:)([^:@/]+)(@)', r'\1***\3', url)

def _get_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL no está configurada o está vacía. "
            "Agrégala en Secrets (Variables de entorno) de Replit con el nombre DATABASE_URL."
        )
    return url

def _ssl_kwargs(url: str) -> dict:
    kwargs = {"connect_timeout": 10}
    if "sslmode=" not in url:
        local_hints = ("localhost", "127.0.0.1", "0.0.0.0", "/tmp/", "unix:")
        if not any(h in url for h in local_hints):
            kwargs["sslmode"] = "require"
    return kwargs

def get_conn():
    url = _get_database_url()
    extra = _ssl_kwargs(url)
    try:
        conn = psycopg2.connect(url, cursor_factory=RealDictCursor, **extra)
        return conn
    except psycopg2.OperationalError as e:
        masked = _mask_url(url)
        logger.error(
            f"[DB] No se pudo conectar — URL: {masked} | SSL kwargs: {extra} | Error: {e}"
        )
        raise

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
    except psycopg2.Error as e:
        logger.error(f"[DB] Error en query: {e} | Query: {query[:200]}")
        raise
    finally:
        conn.close()

def execute_many(queries):
    conn = get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                for query, params in queries:
                    cur.execute(_to_psycopg2(query), params or ())
    except psycopg2.Error as e:
        logger.error(f"[DB] Error en execute_many: {e}")
        raise
    finally:
        conn.close()

def check_connection() -> dict:
    result = {"ok": False, "masked_url": None, "error": None, "ssl": None}
    try:
        url = _get_database_url()
        result["masked_url"] = _mask_url(url)
        extra = _ssl_kwargs(url)
        result["ssl"] = extra.get("sslmode", "heredado de URL")
        conn = psycopg2.connect(url, cursor_factory=RealDictCursor, **extra)
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            row = cur.fetchone()
            result["ok"] = bool(row)
        conn.close()
    except RuntimeError as e:
        result["error"] = f"Config: {e}"
    except psycopg2.Error as e:
        result["error"] = f"Postgres: {e}"
    except Exception as e:
        result["error"] = f"Inesperado: {e}"
    return result
