# Portal de RRHH — Nubera Digital

Portal interno de Recursos Humanos para **Nubera Digital** (México), construido con **React + TypeScript + Recharts** en el frontend y **FastAPI + Pydantic + LangGraph + PostgreSQL/pgvector** en el backend.

---

## Estructura del repositorio

```text
.
├── frontend/               # React + TypeScript + Vite + Recharts (tipografía Inter)
├── backend/                # API FastAPI, autenticación JWT/RBAC, 7 agentes con LangGraph
├── database/
│   ├── migrations/
│   │   └── 001_initial_pgvector.sql  # Esquema PostgreSQL + pgvector
│   └── seed_db.py          # Script reproducible de carga inicial (55 colaboradores, 3 meses)
├── prompts/                # Prompts versionados por agente + registry.json
├── evaluation/
│   ├── run_eval_45.py      # Evaluación automatizada de 45 preguntas + RBAC + Drive
│   └── EVALUATION_RESULTS.md
├── docs/
│   ├── ARQUITECTURA_Y_DISENO.md
│   └── GUION_DEMO.md
├── .env.example
├── .gitignore
├── docker-compose.yml
└── README.md
```

---

## Integraciones activas y modo demostración

- **Base de datos:** PostgreSQL + `pgvector` cuando `DATABASE_URL` apunta a PostgreSQL; en desarrollo local sin Docker usa SQLite con similitud coseno local sobre 384 dimensiones.
- **Google Drive y Sheets:** Sincronización real con Google Drive API (PDF, Google Docs y Google Sheets) cuando `GOOGLE_DRIVE_ENABLED=true`; en modo demostración indexa 10 políticas (`RH-01` a `RH-10`) visibles desde el visor integrado del portal.
- **Datos simulados:** 55 colaboradores, 3 meses de movimientos, incapacidades, solicitudes pendientes (>3 días destacadas), tickets, historial de chat y 10 días de reportes diarios guardados.

### Credenciales de demostración

| Rol | Correo | Contraseña | Redirección |
|---|---|---|---|
| Colaborador | `ana.garcia@nubera.mx` | `Colaborador123!` | `/consultas` |
| Colaborador | `carlos.ruiz@nubera.mx` | `Colaborador123!` | `/consultas` |
| RRHH | `laura.mendoza@nubera.mx` | `Rrhh123!` | `/dashboard` |

---

## Ejecución local

### 1. Backend (FastAPI)

```bash
cd backend
.\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```

Documentación OpenAPI en `http://localhost:8000/docs`.

### 2. Frontend (React + TypeScript + Vite)

```bash
cd frontend
npm install
npm run dev
```

Portal disponible en `http://localhost:5173`.

### 3. Docker Compose (PostgreSQL + pgvector)

```bash
cp .env.example .env
docker compose up --build
```

La base de datos ejecuta automáticamente [001_initial_pgvector.sql](database/migrations/001_initial_pgvector.sql) al inicializar.

---

## Pruebas y evaluación

```bash
# Pruebas funcionales y RBAC
cd backend
.\.venv\Scripts\python.exe -m pytest -v

# Evaluación de 45 preguntas (desde la raíz)
backend\.venv\Scripts\python.exe evaluation\run_eval_45.py
```

Resultado medido en [EVALUATION_RESULTS.md](evaluation/EVALUATION_RESULTS.md): **45/45 aciertos (100.0%)**, **latencia p90 = 18 ms**, **100.0% < 8 s**, **0 fugas de datos**.
# nubera-digital
