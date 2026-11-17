-- Migración versionada: agrega aprobador de solicitudes, asignado de tickets e índices de consulta real
ALTER TABLE `leave_requests`
  ADD COLUMN `approver_id` INT NULL AFTER `employee_id`,
  ADD INDEX `idx_lr_emp_status` (`employee_id`, `status`),
  ADD INDEX `idx_lr_status_dates` (`status`, `start_date`, `end_date`),
  ADD CONSTRAINT `fk_lr_approver` FOREIGN KEY (`approver_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL;

ALTER TABLE `tickets`
  ADD COLUMN `assignee_id` INT NULL AFTER `employee_id`,
  ADD INDEX `idx_tickets_emp_status` (`employee_id`, `status`),
  ADD INDEX `idx_tickets_sensitive` (`is_sensitive`, `status`),
  ADD CONSTRAINT `fk_tkt_assignee` FOREIGN KEY (`assignee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL;

ALTER TABLE `employees`
  ADD INDEX `idx_employees_dept_status` (`department`, `status`);

ALTER TABLE `balances`
  ADD INDEX `idx_balances_available` (`available_days`);

ALTER TABLE `disabilities`
  ADD INDEX `idx_disabilities_emp_status` (`employee_id`, `status`);

ALTER TABLE `movements`
  ADD INDEX `idx_movements_emp_date` (`employee_id`, `movement_date`);

ALTER TABLE `drive_documents`
  ADD INDEX `idx_drive_docs_policy_status` (`policy_code`, `status`);

ALTER TABLE `document_chunks`
  ADD UNIQUE INDEX `uq_chunk_doc_idx` (`document_id`, `chunk_index`);

ALTER TABLE `document_audit_alerts`
  ADD INDEX `idx_alerts_lookup` (`drive_file_id`, `alert_type`, `status`);

ALTER TABLE `chat_conversations`
  ADD INDEX `idx_conv_emp_updated` (`employee_id`, `updated_at`);

ALTER TABLE `chat_logs`
  ADD INDEX `idx_chat_emp_created` (`employee_id`, `created_at`),
  ADD INDEX `idx_chat_outcome_created` (`outcome`, `created_at`);

ALTER TABLE `ticket_history`
  ADD INDEX `idx_ticket_hist_created` (`ticket_id`, `created_at`);
