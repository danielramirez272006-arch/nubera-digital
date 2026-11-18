-- Migración versionada: persistencia de tokens JWT revocados en MySQL
CREATE TABLE IF NOT EXISTS `revoked_tokens` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(0) NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `revoked_tokens_token_hash_key` (`token_hash`),
    INDEX `idx_revoked_tokens_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
