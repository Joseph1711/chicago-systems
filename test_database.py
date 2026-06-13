"""
Script de prueba de conexion a la base de datos.
Ejecutar con: python test_database.py
"""
import os
import sys
import re


def mask_url(url: str) -> str:
    return re.sub(r'(:)([^:@/]+)(@)', r'\1***\3', url)


def main():
    print("=" * 55)
    print("  CHICAGO SYSTEMS — PRUEBA DE BASE DE DATOS")
    print("=" * 55)

    # 1. Verificar DATABASE_URL
    raw_url = os.environ.get("DATABASE_URL", "")
    if not raw_url:
        print("\n[ERROR] DATABASE_URL no está configurada.")
        print("  → Agrégala en Secrets de Replit con nombre: DATABASE_URL")
        print("  → Ejemplo: postgresql://usuario:clave@host:5432/db")
        sys.exit(1)

    masked = mask_url(raw_url.strip())
    print(f"\n[OK] DATABASE_URL detectada: {masked}")

    # 2. Detectar sslmode
    if "sslmode=" in raw_url:
        import re as _re
        m = _re.search(r'sslmode=(\w+)', raw_url)
        ssl_info = m.group(1) if m else "incluido en URL"
    elif any(h in raw_url for h in ("localhost", "127.0.0.1")):
        ssl_info = "no aplicado (host local)"
    else:
        ssl_info = "require (añadido automáticamente para host remoto)"
    print(f"[INFO] SSL mode: {ssl_info}")

    # 3. Intentar conexión
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError:
        print("\n[ERROR] psycopg2 no está instalado.")
        print("  → Ejecuta: pip install psycopg2-binary")
        sys.exit(1)

    print("\nConectando a la base de datos...")
    extra = {}
    if "sslmode=" not in raw_url:
        local_hints = ("localhost", "127.0.0.1", "0.0.0.0", "/tmp/", "unix:")
        if not any(h in raw_url for h in local_hints):
            extra["sslmode"] = "require"

    try:
        conn = psycopg2.connect(raw_url, cursor_factory=RealDictCursor,
                                connect_timeout=10, **extra)
    except psycopg2.OperationalError as e:
        print(f"\n[ERROR] No se pudo conectar: {e}")
        print("\nPosibles causas:")
        print("  • La contraseña/usuario en DATABASE_URL es incorrecta")
        print("  • El servidor PostgreSQL no acepta conexiones externas")
        print("  • El firewall bloquea el puerto 5432")
        print("  • Supabase requiere sslmode=require (ya se añade auto para hosts remotos)")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Error inesperado: {e}")
        sys.exit(1)

    print("[OK] Conexión establecida correctamente")

    # 4. Ejecutar SELECT 1
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS resultado")
            row = cur.fetchone()
            print(f"[OK] SELECT 1 → resultado: {dict(row)}")

            cur.execute("SELECT current_database() AS db, current_user AS usuario, version() AS version")
            info = dict(cur.fetchone())
            print(f"[INFO] Base de datos: {info['db']}")
            print(f"[INFO] Usuario: {info['usuario']}")
            print(f"[INFO] Versión PG: {info['version'][:50]}...")

            cur.execute("""
                SELECT COUNT(*) AS tablas
                FROM information_schema.tables
                WHERE table_schema = 'public'
            """)
            count = dict(cur.fetchone())
            print(f"[INFO] Tablas en esquema público: {count['tablas']}")

    except psycopg2.Error as e:
        print(f"\n[ERROR] Fallo ejecutando SELECT: {e}")
        conn.close()
        sys.exit(1)

    conn.close()

    print("\n" + "=" * 55)
    print("  RESULTADO: CONEXIÓN EXITOSA ✓")
    print("=" * 55)


if __name__ == "__main__":
    main()
