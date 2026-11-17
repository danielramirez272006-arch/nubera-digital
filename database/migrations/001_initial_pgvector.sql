-- Migración completa para Nubera Digital - Portal de RRHH
-- Requiere PostgreSQL 15+ con extensión pgvector

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('colaborador', 'rrhh')),
    department VARCHAR(80) NOT NULL,
    position VARCHAR(100) NOT NULL,
    hire_date DATE NOT NULL,
    termination_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'baja')),
    salary_mxn NUMERIC(12, 2) NOT NULL DEFAULT 0,
    manager_name VARCHAR(150) NULL,
    next_payment_date DATE NULL,
    next_review_date DATE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS balances (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    entitled_days NUMERIC(6, 2) NOT NULL,
    used_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
    pending_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
    available_days NUMERIC(6, 2) NOT NULL,
    expiration_date DATE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(employee_id, year)
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    request_type VARCHAR(30) NOT NULL CHECK (request_type IN ('vacaciones', 'permiso_con_goce', 'permiso_sin_goce', 'incapacidad', 'home_office')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count NUMERIC(5, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
    reason TEXT NULL,
    approver_notes TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE TABLE IF NOT EXISTS disabilities (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    folio_imss VARCHAR(40) NOT NULL,
    disability_type VARCHAR(40) NOT NULL CHECK (disability_type IN ('enfermedad_general', 'maternidad', 'riesgo_trabajo')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'activa' CHECK (status IN ('activa', 'concluida')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movements (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    movement_type VARCHAR(40) NOT NULL,
    movement_date DATE NOT NULL,
    days_delta NUMERIC(6, 2) NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice documental exclusivo para políticas internas (sin datos personales)
CREATE TABLE IF NOT EXISTS drive_documents (
    id SERIAL PRIMARY KEY,
    drive_file_id VARCHAR(128) UNIQUE NOT NULL,
    policy_code VARCHAR(30) NOT NULL,
    title VARCHAR(200) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    version VARCHAR(40) NOT NULL,
    effective_date VARCHAR(40) NOT NULL,
    owner VARCHAR(120) NOT NULL,
    drive_url TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'eliminado')),
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES drive_documents(id) ON DELETE CASCADE,
    drive_file_id VARCHAR(128) NOT NULL,
    policy_code VARCHAR(30) NOT NULL,
    title VARCHAR(200) NOT NULL,
    section VARCHAR(200) NOT NULL,
    version VARCHAR(40) NOT NULL,
    effective_date VARCHAR(40) NOT NULL,
    owner VARCHAR(120) NOT NULL,
    drive_url TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(384) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
    ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

CREATE TABLE IF NOT EXISTS document_audit_alerts (
    id SERIAL PRIMARY KEY,
    drive_file_id VARCHAR(128) NOT NULL,
    title VARCHAR(200) NOT NULL,
    alert_type VARCHAR(40) NOT NULL CHECK (alert_type IN ('metadato_faltante', 'version_contradictoria', 'error_sincronizacion', 'inyeccion_detectada')),
    severity VARCHAR(20) NOT NULL DEFAULT 'media',
    detail TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_conversations (
    id VARCHAR(64) PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_logs (
    id SERIAL PRIMARY KEY,
    trace_id VARCHAR(64) NOT NULL,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    session_id VARCHAR(64) NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    intent VARCHAR(40) NOT NULL,
    agent_used VARCHAR(80) NOT NULL,
    prompt_version VARCHAR(40) NOT NULL DEFAULT '1.2.0',
    topic VARCHAR(60) NOT NULL,
    citations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    latency_ms INTEGER NOT NULL,
    outcome VARCHAR(30) NOT NULL CHECK (outcome IN ('resuelta', 'escalada_rrhh', 'denegada', 'error')),
    helpful BOOLEAN NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    folio VARCHAR(30) UNIQUE NOT NULL,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    topic VARCHAR(120) NOT NULL,
    confirmed_summary TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto', 'en_proceso', 'resuelto', 'cerrado')),
    assigned_to VARCHAR(150) NOT NULL DEFAULT 'Laura Patricia Mendoza Ortega',
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_history (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    actor_name VARCHAR(150) NOT NULL,
    action VARCHAR(80) NOT NULL,
    notes TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_reports (
    id SERIAL PRIMARY KEY,
    report_date DATE UNIQUE NOT NULL,
    absences_today INTEGER NOT NULL DEFAULT 0,
    pending_requests INTEGER NOT NULL DEFAULT 0,
    pending_over_3_days INTEGER NOT NULL DEFAULT 0,
    active_disabilities INTEGER NOT NULL DEFAULT 0,
    resolved_without_escalation_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
    monthly_disability_days INTEGER NOT NULL DEFAULT 0,
    monthly_hires INTEGER NOT NULL DEFAULT 0,
    monthly_exits INTEGER NOT NULL DEFAULT 0,
    turnover_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
    employees_over_20_vacation_days INTEGER NOT NULL DEFAULT 0,
    prev_day_chat_volume INTEGER NOT NULL DEFAULT 0,
    prev_day_avg_latency_ms INTEGER NOT NULL DEFAULT 0,
    payload_json JSONB NOT NULL,
    executive_summary TEXT NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
