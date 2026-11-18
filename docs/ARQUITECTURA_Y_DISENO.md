# Arquitectura, Búsqueda Documental y Definiciones — Nubera Digital

## 1. Diagrama de Arquitectura

```mermaid
flowchart LR
    U["Colaborador / RRHH (React .jsx + Vite)"] -->|JWT + Trace-ID| API["Backend Express (ESM) + Zod + RBAC"]
    API --> LG["Orquestador LangGraph.js"]
    LG --> POL["Agente de Políticas"]
    LG --> EMP["Agente de Datos del Colaborador"]
    LG --> ANA["Agente Analista (7:00 a.m. CDMX)"]
    LG --> VAL["Agente Validador (hasta 2 reintentos)"]
    API --> ESC["Agente de Escalamiento (Tickets)"]
    API --> ING["Agente de Ingesta (6:30 a.m. CDMX)"]

    POL --> MY[("MySQL 8 + Prisma ORM\n(Índice documental sin datos personales)")]
    EMP --> MY
    ANA --> MY
    ESC --> MY
    ING -->|Google Drive API| GD[("Google Drive\n(Docs, PDF RH-09, Sheet Pagos/Feriados)")]
    ING --> MY
```

## 2. Documentos, Chunking y Embeddings

- **Documentos indexados:** 11 activos oficiales reales en Google Drive (`RH-01` a `RH-10` y calendario `RH-11`/`RH-12` en dos pestañas de cálculo) con metadatos completos (`drive_file_id`, `policy_code`, `title`, `section`, `version`, `effective_date`, `owner`, `drive_url`).
- **Estrategia de fragmentación:** Segmentación por secciones y filas de tabla sin dividir palabras a la mitad (`maxChars = 850`), conservando encabezados de tabla y todas las pestañas de hojas de cálculo.
- **Embeddings:** Vector normalizado de **384 dimensiones** (`EMBEDDING_DIM=384`) en JavaScript puro (`crypto` + tokens normalizados en español, sinónimos de RRHH, bigramas y 4-gramas).
- **Umbral de recuperación:** `MIN_RELEVANCE_SCORE = 0.28` + verificación léxica de respaldo. Consultas sin evidencia disparan sugerencia de ticket con RRHH.
- **Seguridad documental:** Sanitización de instrucciones maliciosas durante la ingesta y alerta persistente `inyeccion_detectada` en `document_audit_alerts`.

## 3. Fórmulas del Reporte Diario y Concurrencia

- **Ausencias de hoy:** Personas únicas (`DISTINCT employee_id`) con solicitudes aprobadas de tipo `vacaciones`, `permiso_con_goce`, `permiso_sin_goce` o `incapacidad` (excluye `home_office`).
- **Solicitudes pendientes > 3 días:** Solicitudes con `status = 'pendiente'` cuya fecha de creación en `America/Mexico_City` supera los 3 días respecto al corte.
- **Criterios de saldo vacacional:** Las solicitudes pendientes reservan saldo; la aprobación bloquea la fila con `SELECT ... FOR UPDATE` para impedir descuentos dobles en operaciones concurrentes.
- **Idempotencia:** `generateDailyReport` ejecuta `prisma.dailyReport.upsert` sobre `reportDate`.

## 4. Modelo Entidad-Relación (Prisma) y Normalización (1FN / 2FN)

```mermaid
erDiagram
    EMPLOYEES ||--o{ BALANCES : "tiene saldos"
    EMPLOYEES ||--o{ LEAVE_REQUESTS : "solicita"
    EMPLOYEES ||--o{ LEAVE_REQUESTS : "aprueba (approver_id)"
    BALANCES ||--o{ LEAVE_REQUESTS : "respalda (balance_id)"
    EMPLOYEES ||--o{ TICKETS : "abre"
    EMPLOYEES ||--o{ TICKETS : "atiende (assignee_id)"
    TICKETS ||--o{ TICKET_HISTORY : "registra"
    EMPLOYEES ||--o{ DISABILITIES : "registra"
    EMPLOYEES ||--o{ MOVEMENTS : "genera"
    EMPLOYEES ||--o{ CHAT_CONVERSATIONS : "posee"
    EMPLOYEES ||--o{ CHAT_LOGS : "consulta"
    CHAT_CONVERSATIONS ||--o{ CHAT_LOGS : "contiene"
    DRIVE_DOCUMENTS ||--o{ DOCUMENT_CHUNKS : "se fragmenta en"

    EMPLOYEES {
        int id PK
        string employee_code UK
        string email UK
        string role
        string department
        date hire_date
    }
    BALANCES {
        int id PK
        int employee_id FK
        int year
        decimal entitled_days
        decimal used_days
        decimal pending_days
        decimal available_days
        date expiration_date
    }
    LEAVE_REQUESTS {
        int id PK
        int employee_id FK
        int approver_id FK
        int balance_id FK
        string request_type
        date start_date
        date end_date
        decimal days_count
        string status
    }
    TICKETS {
        int id PK
        string folio UK
        int employee_id FK
        int assignee_id FK
        string assigned_to
        string status
        boolean is_sensitive
    }
    TICKET_HISTORY {
        int id PK
        int ticket_id FK
        string actor_name
        string action
        datetime created_at
    }
```

### Claves candidatas y evaluación de 1FN / 2FN

- **Claves candidatas:**
  - `employees`: `{id}` (PK) y `{employee_code}`, `{email}` (claves únicas candidatas).
  - `balances`: `{id}` (PK) y clave compuesta `{employee_id, year}` (`uq_balance_emp_year`).
  - `leave_requests`: `{id}` (PK); `balance_id` referencia explícitamente el saldo del periodo afectado y `approver_id` al aprobador.
  - `tickets`: `{id}` (PK) y `{folio}` (clave única candidata); `assignee_id` referencia el responsable activo en `employees`.
  - `document_chunks`: `{id}` (PK) y `{document_id, chunk_index}` (`uq_chunk_doc_idx`).
- **Primera Forma Normal (1FN):** Todas las columnas escalares (`start_date`, `end_date`, `days_count`, `status`, `folio`) son atómicas y cada tabla posee clave primaria definida. Los campos `JSON` (`document_chunks.embedding`, `chat_logs.citations_json`, `daily_reports.payload_json`) almacenan artefactos estructurados de solo lectura/índice que no participan en llaves ni filtros relacionales.
- **Segunda Forma Normal (2FN):** Todas las entidades utilizan clave primaria simple (`id` autoincremental o `id` UUID/compuesto en `chat_conversations`), por lo que no existen dependencias funcionales parciales sobre subconjuntos de la clave primaria. En `tickets`, el nombre histórico `assigned_to` se mantiene sincronizado con `employees.full_name` vía `assignee_id` dentro de la misma transacción. En `document_chunks`, los metadatos denormalizados (`policy_code`, `title`, `version`) aceleran la recuperación RAG y se reemplazan atópicamente junto con `drive_documents` durante la ingesta.
