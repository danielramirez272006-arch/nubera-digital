import { normalizeText } from './embeddings.js';
import { getNextPaymentInfo, todayInTimezone } from '../services/paymentSchedule.js';
import { computeVacationEntitlement } from '../services/vacationRules.js';

function formatDmy(dateVal) {
  if (!dateVal) return '';
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatNum(val) {
  const n = Number(val);
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/**
 * Agente de datos del colaborador: consultas parametrizadas de solo lectura
 * filtradas estrictamente por currentUser.id.
 */
export async function answerEmployeeQuestion(prisma, currentUser, question) {
  const qNorm = normalizeText(question);

  if (['pago', 'nomina', 'fecha de pago', 'proximo pago', 'cuando pagan', 'viernes', 'semanal'].some((k) => qNorm.includes(k))) {
    const today = todayInTimezone();
    const payInfo = await getNextPaymentInfo(prisma, today);
    const schedStr = formatDmy(payInfo.scheduledDate);
    const projStr = formatDmy(payInfo.projectedDate);
    const effStr = payInfo.effectiveDate ? formatDmy(payInfo.effectiveDate) : 'pendiente de validación por Nómina';
    const advNote = payInfo.isAdvanced
      ? ` Por cierre bancario o feriado, se proyecta adelanto al día hábil anterior (**${projStr}**).`
      : '';

    return {
      answer:
        `Hola ${currentUser.fullName}, conforme al esquema de pagos semanales los viernes (RH-05 / RH-12), ` +
        `tu próxima fecha programada de pago es el **${schedStr}** (estado: ${payInfo.status}; ` +
        `fecha efectiva confirmada: ${effStr}).${advNote}`,
      data_type: 'pago',
      tool_figures: [schedStr],
    };
  }

  if (['evaluacion', 'desempeno', 'revision'].some((k) => qNorm.includes(k))) {
    const revStr = currentUser.nextReviewDate ? formatDmy(currentUser.nextReviewDate) : 'Próximo ciclo semestral';
    return {
      answer: `Hola ${currentUser.fullName}, tu próxima evaluación de desempeño está programada para el **${revStr}**.`,
      data_type: 'evaluacion',
      tool_figures: [revStr],
    };
  }

  if (['vacacion', 'dias', 'saldo', 'quedan', 'disponible', 'vencen', 'caducan', 'proximo ano'].some((k) => qNorm.includes(k))) {
    const balance = await prisma.balance.findFirst({
      where: { employeeId: currentUser.id },
      orderBy: { year: 'desc' },
    });

    if (!balance) {
      return {
        answer: `No se encontró un registro de saldo vacacional vigente para tu cuenta (${currentUser.fullName}).`,
        data_type: 'vacaciones',
        tool_figures: [],
      };
    }

    const today = todayInTimezone();
    const vacInfo = computeVacationEntitlement(currentUser.hireDate, today);
    const entStr = formatNum(balance.entitledDays);
    const usedStr = formatNum(balance.usedDays);
    const pendStr = formatNum(balance.pendingDays);
    const availStr = formatNum(balance.availableDays);
    const annivStr = formatDmy(vacInfo.anniversaryDate);
    const pStartStr = formatDmy(vacInfo.periodStart);
    const pEndStr = formatDmy(vacInfo.periodEnd);
    const deadStr = formatDmy(vacInfo.sixMonthDeadline);

    return {
      answer:
        `Hola ${currentUser.fullName}, tu ingreso fue el **${formatDmy(currentUser.hireDate)}** ` +
        `(${vacInfo.yearsOfService} años cumplidos; último aniversario: **${annivStr}**). ` +
        `En tu periodo vigente (**${pStartStr} al ${pEndStr}**) tienes **${availStr} días disponibles** ` +
        `de vacaciones (**${entStr} días asignados** según tabla RH-01, **${usedStr} disfrutados** y ` +
        `**${pendStr} días reservados en solicitudes pendientes**). ` +
        `Conforme a RH-01, el periodo se asigna por aniversario (puede cruzar diciembre) y debe programarse ` +
        `dentro de los **6 meses posteriores al aniversario** (fecha límite de referencia: **${deadStr}**; ` +
        `si existen días pendientes, Operaciones de RRHH revisa el caso para agendar su disfrute).`,
      data_type: 'vacaciones',
      tool_figures: [availStr, entStr, pendStr],
    };
  }

  if (['incapacidad', 'incapacidades'].some((k) => qNorm.includes(k))) {
    const dis = await prisma.disability.findMany({
      where: { employeeId: currentUser.id },
      orderBy: { startDate: 'desc' },
      take: 3,
    });

    if (dis.length === 0) {
      return {
        answer: `No tienes incapacidades registradas en tu historial, ${currentUser.fullName}.`,
        data_type: 'incapacidades',
        tool_figures: [],
      };
    }

    const lines = dis.map((d) => {
      const label = d.disabilityType.replace(/_/g, ' ');
      const cap = label.charAt(0).toUpperCase() + label.slice(1);
      return `- ${cap} (${formatDmy(d.startDate)} al ${formatDmy(d.endDate)}, ${d.daysCount} días): **${d.status.toUpperCase()}**`;
    });

    return {
      answer: 'Tus incapacidades registradas son:\n' + lines.join('\n'),
      data_type: 'incapacidades',
      tool_figures: dis.map((d) => String(d.daysCount)),
    };
  }

  if (['solicitud', 'solicitudes', 'estatus', 'estado', 'aprobada', 'pendiente', 'permiso'].some((k) => qNorm.includes(k))) {
    const reqs = await prisma.leaveRequest.findMany({
      where: { employeeId: currentUser.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (reqs.length === 0) {
      return {
        answer: `No tienes solicitudes recientes registradas en tu historial, ${currentUser.fullName}.`,
        data_type: 'solicitudes',
        tool_figures: [],
      };
    }

    const lines = reqs.map((r) => {
      const label = r.requestType.replace(/_/g, ' ');
      const cap = label.charAt(0).toUpperCase() + label.slice(1);
      return `- ${cap} del ${formatDmy(r.startDate)} al ${formatDmy(r.endDate)} (${formatNum(r.daysCount)} días): **${r.status.toUpperCase()}**`;
    });

    return {
      answer: 'Estas son tus solicitudes más recientes:\n' + lines.join('\n'),
      data_type: 'solicitudes',
      tool_figures: [],
    };
  }

  if (['puesto', 'departamento', 'antiguedad', 'ingreso', 'salario', 'sueldo', 'jefe', 'lider', 'perfil'].some((k) => qNorm.includes(k))) {
    return {
      answer:
        `Tu ficha laboral registra el puesto de **${currentUser.position}** en el departamento de ` +
        `**${currentUser.department}**, con fecha de ingreso el **${formatDmy(currentUser.hireDate)}** ` +
        `y líder directo **${currentUser.managerName || 'Dirección de Área'}**.`,
      data_type: 'perfil',
      tool_figures: [],
    };
  }

  const [balance, pendingCount] = await Promise.all([
    prisma.balance.findFirst({
      where: { employeeId: currentUser.id },
      orderBy: { year: 'desc' },
    }),
    prisma.leaveRequest.count({
      where: { employeeId: currentUser.id, status: 'pendiente' },
    }),
  ]);

  const avail = balance ? formatNum(balance.availableDays) : '0';
  return {
    answer:
      `Resumen de tu cuenta (${currentUser.fullName}, ${currentUser.employeeCode}): ` +
      `tienes **${avail} días de vacaciones disponibles** y **${pendingCount} solicitud(es) pendiente(s)**.`,
    data_type: 'resumen',
    tool_figures: [avail, String(pendingCount)],
  };
}
