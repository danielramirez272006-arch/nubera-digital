-- Migración inicial para Nubera Digital - Portal de RRHH (MySQL 8.0+)
CREATE DATABASE IF NOT EXISTS nubera_rrhh
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE nubera_rrhh;

CREATE TABLE IF NOT EXISTS employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_code VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(20) NOT NULL,
    department VARCHAR(80) NOT NULL,
    position VARCHAR(100) NOT NULL,
    hire_date DATE NOT NULL,
    termination_date DATE NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'activo',
    salary_mxn DECIMAL(12, 2) NOT NULL DEFAULT 0,
    manager_name VARCHAR(150) NULL,
    next_payment_date DATE NULL,
    next_review_date DATE NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS balances (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    year INT NOT NULL,
    entitled_days DECIMAL(6, 2) NOT NULL,
    used_days DECIMAL(6, 2) NOT NULL DEFAULT 0,
    pending_days DECIMAL(6, 2) NOT NULL DEFAULT 0,
    available_days DECIMAL(6, 2) NOT NULL,
    expiration_date DATE NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_balance_emp_year (employee_id, year),
    CONSTRAINT fk_bal_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leave_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    request_type VARCHAR(30) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count DECIMAL(5, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    reason TEXT NULL,
    approver_notes TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    CONSTRAINT fk_lr_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS disabilities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    folio_imss VARCHAR(40) NOT NULL,
    disability_type VARCHAR(40) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'activa',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dis_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    movement_type VARCHAR(40) NOT NULL,
    movement_date DATE NOT NULL,
    days_delta DECIMAL(6, 2) NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_mov_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS drive_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drive_file_id VARCHAR(128) NOT NULL UNIQUE,
    policy_code VARCHAR(30) NOT NULL,
    title VARCHAR(200) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    version VARCHAR(40) NOT NULL,
    effective_date VARCHAR(80) NOT NULL DEFAULT '2026-01-01',
    owner VARCHAR(120) NOT NULL DEFAULT 'Dirección de Talento y Cultura',
    drive_url TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'activo',
    last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS document_chunks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NOT NULL,
    drive_file_id VARCHAR(128) NOT NULL,
    policy_code VARCHAR(30) NOT NULL,
    title VARCHAR(200) NOT NULL,
    section VARCHAR(200) NOT NULL,
    version VARCHAR(40) NOT NULL,
    effective_date VARCHAR(80) NOT NULL DEFAULT '2026-01-01',
    owner VARCHAR(120) NOT NULL DEFAULT 'Dirección de Talento y Cultura',
    drive_url TEXT NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    embedding JSON NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chunk_doc FOREIGN KEY (document_id) REFERENCES drive_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS document_audit_alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drive_file_id VARCHAR(128) NOT NULL,
    title VARCHAR(200) NOT NULL,
    alert_type VARCHAR(40) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'media',
    detail TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'activa',
    occurrence_count INT NOT NULL DEFAULT 1,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chat_conversations (
    id VARCHAR(64) PRIMARY KEY,
    employee_id INT NOT NULL,
    title VARCHAR(160) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_conv_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chat_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    trace_id VARCHAR(64) NOT NULL,
    employee_id INT NOT NULL,
    session_id VARCHAR(64) NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    intent VARCHAR(40) NOT NULL,
    agent_used VARCHAR(80) NOT NULL,
    prompt_version VARCHAR(40) NOT NULL DEFAULT '1.2.0',
    topic VARCHAR(60) NOT NULL,
    citations_json JSON NOT NULL,
    latency_ms INT NOT NULL,
    outcome VARCHAR(30) NOT NULL,
    helpful BOOLEAN NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    folio VARCHAR(30) NOT NULL UNIQUE,
    employee_id INT NOT NULL,
    topic VARCHAR(120) NOT NULL,
    confirmed_summary TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'abierto',
    assigned_to VARCHAR(150) NOT NULL,
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_tkt_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    actor_name VARCHAR(150) NOT NULL,
    action VARCHAR(80) NOT NULL,
    notes TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_th_tkt FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS daily_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_date DATE NOT NULL UNIQUE,
    absences_today INT NOT NULL DEFAULT 0,
    pending_requests INT NOT NULL DEFAULT 0,
    pending_over_3_days INT NOT NULL DEFAULT 0,
    active_disabilities INT NOT NULL DEFAULT 0,
    resolved_without_escalation_pct DECIMAL(5, 2) NOT NULL DEFAULT 0,
    monthly_disability_days INT NOT NULL DEFAULT 0,
    monthly_hires INT NOT NULL DEFAULT 0,
    monthly_exits INT NOT NULL DEFAULT 0,
    turnover_rate_pct DECIMAL(5, 2) NOT NULL DEFAULT 0,
    employees_over_20_vacation_days INT NOT NULL DEFAULT 0,
    prev_day_chat_volume INT NOT NULL DEFAULT 0,
    prev_day_avg_latency_ms INT NOT NULL DEFAULT 0,
    payload_json JSON NOT NULL,
    executive_summary TEXT NOT NULL,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
