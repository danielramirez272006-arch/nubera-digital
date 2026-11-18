import { addDaysUtc, addMonthsUtc, toIsoDate } from './vacationRules.js';

function getPeriodWindowForBalance(hireDate, balanceYear, expirationDate) {
  const hM = hireDate.getUTCMonth();
  const hD = hireDate.getUTCDate();
  const maxDay = new Date(Date.UTC(balanceYear, hM + 1, 0)).getUTCDate();
  const periodStart = new Date(Date.UTC(balanceYear, hM, Math.min(hD, maxDay)));
  const naturalEnd = addDaysUtc(addMonthsUtc(periodStart, 12), -1);
  const effectiveEnd = expirationDate && expirationDate > naturalEnd ? expirationDate : naturalEnd;
  return { periodStart, periodEnd: effectiveEnd };
}

function hasCapacityForRequest(bal, req) {
  const days = Number(req.daysCount);
  if (req.status === 'pendiente') {
    return Number(bal.pendingDays) + 1e-6 >= days;
  }
  if (req.status === 'aprobada') {
    return Number(bal.usedDays) + 1e-6 >= days;
  }
  return true;
}

/**
 * Evalúa y reconstruye `leave_requests.balance_id` usando evidencia del periodo de antigüedad,
 * reservas acumuladas (`pending_days`), días disfrutados acumulados (`used_days`) y movimientos.
 * Nunca asigna un saldo ajeno ni resuelve conjuntos sobre-suscritos arbitrariamente por orden de ID.
 */
export async function reconcileRequestBalances(prisma, { apply = false, expectedSnapshot = null } = {}) {
  const [requests, balances, movements] = await Promise.all([
    prisma.leaveRequest.findMany({
      include: {
        employee: { select: { id: true, email: true, fullName: true, hireDate: true } },
        balance: { select: { id: true, employeeId: true, year: true } },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.balance.findMany({
      orderBy: [{ employeeId: 'asc' }, { year: 'asc' }],
    }),
    prisma.movement.findMany({
      orderBy: { movementDate: 'asc' },
    }),
  ]);

  const balanceById = new Map(balances.map((b) => [b.id, b]));
  const balancesByEmp = new Map();
  for (const b of balances) {
    if (!balancesByEmp.has(b.employeeId)) balancesByEmp.set(b.employeeId, []);
    balancesByEmp.get(b.employeeId).push(b);
  }

  const movementsByEmp = new Map();
  for (const m of movements) {
    if (!movementsByEmp.has(m.employeeId)) movementsByEmp.set(m.employeeId, []);
    movementsByEmp.get(m.employeeId).push(m);
  }

  // Fase 1: Evaluación individual por solicitud
  const proposals = new Map(); // requestId -> { req, proposedBalanceId, ambiguityReason }
  for (const req of requests) {
    if (req.requestType !== 'vacaciones') {
      proposals.set(req.id, {
        req,
        proposedBalanceId: null,
        ambiguityReason: req.balanceId !== null ? 'Solicitud no vacacional no debe tener saldo vinculado.' : null,
        isNonVacationCleanup: req.balanceId !== null,
      });
      continue;
    }

    const empBalances = balancesByEmp.get(req.employeeId) || [];
    const empMovements = movementsByEmp.get(req.employeeId) || [];
    const ownershipMismatch = req.balance && req.balance.employeeId !== req.employeeId;

    let proposedBalanceId = null;
    let ambiguityReason = null;

    if (empBalances.length === 0) {
      ambiguityReason = 'El colaborador no tiene ningún registro en balances.';
    } else if (empBalances.length === 1) {
      const onlyBal = empBalances[0];
      if (!hasCapacityForRequest(onlyBal, req)) {
        ambiguityReason =
          req.status === 'pendiente'
            ? `Reserva insuficiente en saldo ${onlyBal.year} (pending=${Number(onlyBal.pendingDays)}, solicitud=${Number(req.daysCount)}).`
            : `Días utilizados insuficientes en saldo ${onlyBal.year} (used=${Number(onlyBal.usedDays)}, solicitud=${Number(req.daysCount)}).`;
      } else {
        proposedBalanceId = onlyBal.id;
      }
    } else {
      const reqStartMs = req.startDate.getTime();
      const days = Number(req.daysCount);

      const candidates = empBalances.filter((b) => {
        if (!hasCapacityForRequest(b, req)) return false;
        const { periodStart, periodEnd } = getPeriodWindowForBalance(
          req.employee.hireDate,
          b.year,
          b.expirationDate
        );
        const inWindow = reqStartMs >= periodStart.getTime() && reqStartMs <= periodEnd.getTime();

        const hasMatchingMovement = empMovements.some((m) => {
          const mType = (m.movementType || '').toLowerCase();
          if (!mType.includes('vacacion')) return false;
          const deltaMatch = Math.abs(Math.abs(Number(m.daysDelta)) - days) < 0.01;
          const mTime = m.movementDate.getTime();
          return deltaMatch && mTime >= periodStart.getTime() && mTime <= periodEnd.getTime();
        });

        return inWindow || hasMatchingMovement;
      });

      if (candidates.length === 1) {
        proposedBalanceId = candidates[0].id;
      } else if (candidates.length === 0) {
        ambiguityReason = `Ninguno de los ${empBalances.length} saldos coincide con ventana de antigüedad/movimiento y capacidad (${toIsoDate(req.startDate)}).`;
      } else {
        ambiguityReason = `Múltiples saldos (${candidates.map((c) => c.year).join(', ')}) son compatibles para ${toIsoDate(req.startDate)}; requiere revisión manual.`;
      }
    }

    if (ownershipMismatch && ambiguityReason) {
      ambiguityReason = `Saldo actual pertenece a otro colaborador (#${req.balance.employeeId}). ${ambiguityReason}`;
    }

    proposals.set(req.id, { req, proposedBalanceId, ambiguityReason, isNonVacationCleanup: false });
  }

  // Fase 2: Validación acumulada de reservas (pendientes) y utilizados (aprobadas) por saldo
  const pendingByBalance = new Map();
  const usedByBalance = new Map();

  for (const entry of proposals.values()) {
    const { req, proposedBalanceId } = entry;
    if (req.requestType !== 'vacaciones' || proposedBalanceId === null) continue;

    if (req.status === 'pendiente') {
      if (!pendingByBalance.has(proposedBalanceId)) pendingByBalance.set(proposedBalanceId, []);
      pendingByBalance.get(proposedBalanceId).push(entry);
    } else if (req.status === 'aprobada') {
      if (!usedByBalance.has(proposedBalanceId)) usedByBalance.set(proposedBalanceId, []);
      usedByBalance.get(proposedBalanceId).push(entry);
    }
  }

  for (const [balId, entries] of pendingByBalance.entries()) {
    const bal = balanceById.get(balId);
    const totalPendingReq = entries.reduce((sum, e) => sum + Number(e.req.daysCount), 0);
    const balPending = Number(bal.pendingDays);
    if (totalPendingReq > balPending + 1e-6) {
      const reason = `Suma de reservas pendientes (${totalPendingReq} días en ${entries.length} solicitudes) excede pending_days (${balPending}) del saldo ${bal.year} (#${balId}); requiere revisión manual.`;
      for (const e of entries) {
        e.proposedBalanceId = null;
        e.ambiguityReason = reason;
      }
    }
  }

  for (const [balId, entries] of usedByBalance.entries()) {
    const bal = balanceById.get(balId);
    const totalUsedReq = entries.reduce((sum, e) => sum + Number(e.req.daysCount), 0);
    const balUsed = Number(bal.usedDays);
    if (totalUsedReq > balUsed + 1e-6) {
      const reason = `Suma de días aprobados (${totalUsedReq} días en ${entries.length} solicitudes) excede used_days (${balUsed}) del saldo ${bal.year} (#${balId}); requiere revisión manual.`;
      for (const e of entries) {
        e.proposedBalanceId = null;
        e.ambiguityReason = reason;
      }
    }
  }

  // Construir cambios finales, casos ambiguos e instantánea verificable
  const changes = [];
  const ambiguousCases = [];
  const snapshot = { balances: {}, requests: {} };

  for (const b of balances) {
    snapshot.balances[b.id] = {
      pendingDays: Number(b.pendingDays).toFixed(2),
      usedDays: Number(b.usedDays).toFixed(2),
      availableDays: Number(b.availableDays).toFixed(2),
    };
  }

  for (const entry of proposals.values()) {
    const { req, proposedBalanceId, ambiguityReason, isNonVacationCleanup } = entry;
    snapshot.requests[req.id] = {
      balanceId: req.balanceId ?? null,
      status: req.status,
      daysCount: Number(req.daysCount).toFixed(2),
    };

    if (ambiguityReason && !isNonVacationCleanup) {
      ambiguousCases.push({
        requestId: req.id,
        employeeId: req.employeeId,
        employeeEmail: req.employee.email,
        startDate: toIsoDate(req.startDate),
        daysCount: Number(req.daysCount),
        status: req.status,
        currentBalanceId: req.balanceId,
        reason: ambiguityReason,
      });
    }

    if (req.balanceId !== proposedBalanceId) {
      changes.push({
        requestId: req.id,
        employeeId: req.employeeId,
        fromBalanceId: req.balanceId,
        toBalanceId: proposedBalanceId,
        reason: ambiguityReason
          ? `Desvincular por ambigüedad/inconsistencia: ${ambiguityReason}`
          : `Vínculo verificado con balance #${proposedBalanceId}.`,
      });
    }
  }

  let appliedCount = 0;
  if (apply) {
    const verifySnap = expectedSnapshot || snapshot;
    await prisma.$transaction(async (tx) => {
      // Re-verificar dentro de la transacción que saldos y solicitudes no cambiaron desde la vista previa
      const balIdsToVerify = Object.keys(verifySnap.balances).map(Number);
      if (balIdsToVerify.length > 0) {
        const freshBalances = await tx.balance.findMany({
          where: { id: { in: balIdsToVerify } },
          select: { id: true, employeeId: true, pendingDays: true, usedDays: true, availableDays: true },
        });
        const freshMap = new Map(freshBalances.map((b) => [b.id, b]));
        for (const bid of balIdsToVerify) {
          const prev = verifySnap.balances[bid];
          const cur = freshMap.get(bid);
          if (
            !cur ||
            Number(cur.pendingDays).toFixed(2) !== prev.pendingDays ||
            Number(cur.usedDays).toFixed(2) !== prev.usedDays ||
            Number(cur.availableDays).toFixed(2) !== prev.availableDays
          ) {
            throw new Error(
              `La cifra del saldo #${bid} cambió después de la vista previa. Aborta la aplicación y ejecuta una nueva revisión.`
            );
          }
        }
      }

      const reqIdsToVerify = Object.keys(verifySnap.requests).map(Number);
      if (reqIdsToVerify.length > 0) {
        const freshReqs = await tx.leaveRequest.findMany({
          where: { id: { in: reqIdsToVerify } },
          select: { id: true, balanceId: true, status: true, daysCount: true },
        });
        const freshReqMap = new Map(freshReqs.map((r) => [r.id, r]));
        for (const rid of reqIdsToVerify) {
          const prev = verifySnap.requests[rid];
          const cur = freshReqMap.get(rid);
          if (
            !cur ||
            (cur.balanceId ?? null) !== prev.balanceId ||
            cur.status !== prev.status ||
            Number(cur.daysCount).toFixed(2) !== prev.daysCount
          ) {
            throw new Error(
              `La solicitud #${rid} cambió después de la vista previa. Aborta la aplicación y ejecuta una nueva revisión.`
            );
          }
        }
      }

      for (const ch of changes) {
        if (ch.toBalanceId !== null) {
          const targetBal = await tx.balance.findUnique({
            where: { id: ch.toBalanceId },
            select: { id: true, employeeId: true },
          });
          if (!targetBal || targetBal.employeeId !== ch.employeeId) {
            throw new Error(`Invariante violada: el saldo #${ch.toBalanceId} no pertenece al colaborador #${ch.employeeId}.`);
          }
        }
        await tx.leaveRequest.update({
          where: { id: ch.requestId },
          data: { balanceId: ch.toBalanceId },
        });
        appliedCount += 1;
      }
    });
  }

  return {
    mode: apply ? 'apply' : 'preview',
    totalChecked: requests.length,
    changes,
    ambiguousCases,
    snapshot,
    appliedCount,
  };
}
