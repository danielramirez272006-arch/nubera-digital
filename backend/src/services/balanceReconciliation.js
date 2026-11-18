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
 * reservas (`pending_days`), días disfrutados (`used_days`) y movimientos (`movements`).
 * Nunca asigna un saldo de otro colaborador ni fuerza casos ambiguos.
 */
export async function reconcileRequestBalances(prisma, { apply = false } = {}) {
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

  const changes = [];
  const ambiguousCases = [];

  for (const req of requests) {
    if (req.requestType !== 'vacaciones') {
      if (req.balanceId !== null) {
        changes.push({
          requestId: req.id,
          employeeId: req.employeeId,
          fromBalanceId: req.balanceId,
          toBalanceId: null,
          reason: 'Solicitud no vacacional no debe tener saldo vinculado.',
        });
      }
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
      // Múltiples saldos para el colaborador: exigir evidencia inequívoca de periodo/movimiento + capacidad
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

    if (ambiguityReason) {
      ambiguousCases.push({
        requestId: req.id,
        employeeId: req.employeeId,
        employeeEmail: req.employee.email,
        startDate: toIsoDate(req.startDate),
        daysCount: Number(req.daysCount),
        status: req.status,
        currentBalanceId: req.balanceId,
        reason: ownershipMismatch
          ? `Saldo actual pertenece a otro colaborador (#${req.balance.employeeId}). ${ambiguityReason}`
          : ambiguityReason,
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
  if (apply && changes.length > 0) {
    await prisma.$transaction(async (tx) => {
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
    appliedCount,
  };
}
