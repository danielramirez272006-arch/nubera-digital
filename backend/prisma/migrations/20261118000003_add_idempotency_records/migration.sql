-- Migración versionada: tabla persistente de idempotencia para operaciones transaccionales
CREATE TABLE IF NOT EXISTS `idempotency_records` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `employee_id` INT NOT NULL,
    `operation` VARCHAR(64) NOT NULL,
    `idempotency_key` VARCHAR(128) NOT NULL,
    `request_hash` VARCHAR(64) NOT NULL,
    `status` ENUM('en_proceso', 'completada', 'fallida') NOT NULL DEFAULT 'en_proceso',
    `response_status` INT NULL,
    `response_body` JSON NULL,
    `resource_id` INT NULL,
    `expires_at` DATETIME(0) NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `uq_idem_emp_op_key` (`employee_id`, `operation`, `idempotency_key`),
    INDEX `idx_idem_expires` (`expires_at`),
    CONSTRAINT `fk_idem_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
