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

- **Base de datos y ORM:** **MySQL 8** gestionado con **Prisma ORM** ([schema.prisma](file:///c:/Users/calva/taller-cli/minis%20proyecto/backend/prisma/schema.prisma)), migraciones versionadas, transacciones atómicas y bloqueo pesimista `FOR UPDATE` para aprobación de solicitudes.
- **Google Drive y Sheets:** Sincronización real con Google Drive API (`googleapis`, `pdf-parse`, `xlsx`) para Google Docs, PDFs (`RH-09`) y Google Sheets con múltiples pestañas (`Pagos 2026`, `Feriados 2026`).
- **Orquestación multiagente:** Grafo en **LangGraph.js** (`@langchain/langgraph`) con clasificación de intención, agente de políticas con embeddings de 384 dimensiones, agente de datos personales, validador (hasta 2 reintentos), agente analista y tickets de escalamiento.
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

## Pruebas y evaluación

```bash
# Pruebas de integración del backend Node
cd backend
npm test

# Evaluación integral aislada (45 preguntas + ciclo Drive + SQL + RBAC)
node evaluation/run_eval_45.mjs
```
