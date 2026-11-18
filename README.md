# Portal de RRHH — Nubera Digital

Portal interno de Recursos Humanos para **Nubera Digital** (México), construido íntegramente en **JavaScript puro (ES Modules)**: **React + Vite + Recharts** en el frontend y **Node.js + Express + Prisma ORM + LangGraph.js + MySQL** en el backend.

---

## Estructura del repositorio

```text
.
├── frontend/               # React (.jsx/.js) + Vite + React Router + Recharts
├── backend/                # Express (ESM) + Prisma ORM (MySQL) + Zod + LangGraph.js + node-cron
│   ├── database/           # DDL inicial de referencia y respaldos locales
│   ├── prisma/             # schema.prisma, migraciones versionadas y seed.js
│   ├── src/                # agents/, services/, routes/, middleware/, db/
│   └── tests/              # Pruebas de integración ordenadas (node --test)
├── prompts/                # Prompts versionados por agente + registry.json
├── evaluation/
│   ├── run_eval_45.mjs     # Evaluación aislada en JS (45 preguntas + RBAC + Drive + concurrencia + SQL)
│   └── EVALUATION_RESULTS.md
├── docs/
│   ├── ARQUITECTURA_Y_DISENO.md
│   └── GUION_DEMO.md
├── .env.example
├── docker-compose.yml
└── README.md
```

---

## Integraciones activas

- **Base de datos, integridad e idempotencia:** **MySQL 8** gestionado con **Prisma ORM** ([schema.prisma](backend/prisma/schema.prisma)), migraciones versionadas, transacciones atómicas con bloqueo pesimista `FOR UPDATE`, relación explícita `LeaveRequest.balanceId` y `Ticket.assigneeId`, idempotencia persistente (`X-Idempotency-Key` en `idempotency_records`) y reconciliación acumulada de saldos ([balanceReconciliation.js](backend/src/services/balanceReconciliation.js)).
- **Google Drive y Sheets:** Sincronización incremental con Google Drive API (`drive.changes.list` con `pageToken`, respaldo `drive.files.list` y aislamiento de errores por archivo) usando `googleapis`, `pdf-parse` y `xlsx` para Google Docs, PDFs (`RH-09`) y Google Sheets con múltiples pestañas (`Pagos 2026`, `Feriados 2026`).
- **Orquestación multiagente y RAG:** Grafo en **LangGraph.js** (`@langchain/langgraph`) con control de acceso anti-fugas, agente de políticas con embeddings de 384 dimensiones almacenados en MySQL y caché vectorial en memoria (`Float32Array` por instancia de Prisma), agente de datos personales, validador (hasta 2 reintentos), agente analista con validación numérica post-LLM y tickets de escalamiento.
- **Portal colaborador (`Mis datos`):** Consulta de periodos de saldo vacacional, creación idempotente de solicitudes y cancelación directa de solicitudes pendientes con liberación transaccional de reserva.
- **Programación:** Tareas automáticas con `node-cron` en `America/Mexico_City` (6:30 a. m. ingesta documental, 7:00 a. m. reporte diario).

### Credenciales de demostración

| Rol | Correo | Contraseña | Redirección |
|---|---|---|---|
| Colaborador | `ana.garcia@nubera.mx` | `Colaborador123!` | `/consultas` |
| Colaborador | `carlos.ruiz@nubera.mx` | `Colaborador123!` | `/consultas` |
| RRHH | `laura.mendoza@nubera.mx` | `Rrhh123!` | `/dashboard` |

---

## Ejecución local

### 1. Backend (Node.js + Express + Prisma)

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm start
```

Documentación OpenAPI en `http://127.0.0.1:8000/docs`.

### 2. Frontend (React + JavaScript + Vite)

```bash
cd frontend
npm install
npm run dev
```

Portal disponible en `http://127.0.0.1:5173`.

### 3. Docker Compose (MySQL 8 + Node + React)

```bash
cp .env.example .env
docker compose up --build
```

---

## Pruebas, migración y reconciliación

```bash
# Aplicar migraciones Prisma y vista previa / aplicación de reconciliación de saldos
cd backend
npx prisma migrate deploy
npm run db:reconcile:preview
npm run db:reconcile:apply

# Lint y pruebas de integración del backend (bases temporales aisladas por ejecución)
npm run lint
npm test

# Verificación en vivo de integraciones externas
npm run test:deepseek
npm run test:drive

# Lint, pruebas unitarias y build del frontend
cd ../frontend
npm run lint
npm test
npm run build

# Evaluación integral aislada (45 preguntas + ciclo Drive + SQL + RBAC + concurrencia)
cd ..
npm run eval:45
```

### Última verificación registrada
- **Backend:** `7/7` pruebas aprobadas (`0` fallidas, `0` errores de lint).
- **Frontend:** `5/5` pruebas aprobadas (`0` errores de lint, `vite build` limpio).
- **Evaluación aislada (`eval:45`):** `45/45` (**100.0%**), `p90 = 33 ms`, `<8s = 100.0%`, `leaks = 0`, `rbac = true`, `conc = true`, `dashSql = true`.
