r"""
Script reproducible para inicializar esquema y sembrar los datos de ejemplo en PostgreSQL, MySQL o SQLite.
Uso: ..\backend\.venv\Scripts\python.exe database\seed_db.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.database import init_db, SessionLocal
from app.seed import seed_database


def main():
    init_db()
    db = SessionLocal()
    try:
        seed_database(db)
        print("Base de datos inicializada y sembrada correctamente (55 colaboradores, 10 políticas, 10 reportes).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
