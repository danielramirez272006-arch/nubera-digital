-- Migración versionada:
-- 1) Vincular solicitudes de vacaciones con su saldo (`leave_requests.balance_id`)
-- 2) Indexar `tickets(assignee_id, status)` y reconstruir asignaciones existentes

ALTER TABLE `leave_requests`
  ADD COLUMN `balance_id` INT NULL AFTER `approver_id`,
  ADD INDEX `idx_lr_balance` (`balance_id`),
  ADD CONSTRAINT `fk_lr_balance` FOREIGN KEY (`balance_id`) REFERENCES `balances`(`id`) ON DELETE RESTRICT;

ALTER TABLE `tickets`
  ADD INDEX `idx_tickets_assignee_status` (`assignee_id`, `status`);

-- Reconstrucción conservadora de `leave_requests.balance_id` para solicitudes de vacaciones:
-- Caso A: el colaborador tiene exactamente 1 saldo registrado -> vínculo inequívoco.
UPDATE `leave_requests` lr
JOIN (
  SELECT employee_id, MIN(id) AS only_balance_id
  FROM `balances`
  GROUP BY employee_id
  HAVING COUNT(*) = 1
) single_bal ON single_bal.employee_id = lr.employee_id
SET lr.balance_id = single_bal.only_balance_id
WHERE lr.request_type = 'vacaciones'
  AND lr.balance_id IS NULL;

-- Caso B: el colaborador tiene múltiples saldos, pero solo 1 coincide con YEAR(lr.start_date).
-- Los casos que sigan ambiguos (0 o >1 coincidencias) se conservan en NULL para revisión manual.
UPDATE `leave_requests` lr
JOIN (
  SELECT employee_id, year, MIN(id) AS year_balance_id
  FROM `balances`
  GROUP BY employee_id, year
  HAVING COUNT(*) = 1
) yr_bal ON yr_bal.employee_id = lr.employee_id AND yr_bal.year = YEAR(lr.start_date)
SET lr.balance_id = yr_bal.year_balance_id
WHERE lr.request_type = 'vacaciones'
  AND lr.balance_id IS NULL
  AND (
    SELECT COUNT(*)
    FROM `balances` b2
    WHERE b2.employee_id = lr.employee_id AND b2.year = YEAR(lr.start_date)
  ) = 1;

-- Backfill de `tickets.assignee_id` cuando coincide de forma única con un responsable activo de RRHH
UPDATE `tickets` t
JOIN `employees` e
  ON e.full_name = t.assigned_to
 AND e.role = 'rrhh'
 AND e.status = 'activo'
SET t.assignee_id = e.id
WHERE t.assignee_id IS NULL;
