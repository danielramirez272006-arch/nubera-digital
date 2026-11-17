function daysInMonth(year, month1To12) {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

export function addMonthsUtc(d, months) {
  const y0 = d.getUTCFullYear();
  const m0 = d.getUTCMonth(); // 0-11
  const totalMonths = m0 + months;
  const year = y0 + Math.floor(totalMonths / 12);
  const month0 = ((totalMonths % 12) + 12) % 12;
  const day = Math.min(d.getUTCDate(), daysInMonth(year, month0 + 1));
  return new Date(Date.UTC(year, month0, day));
}

export function addDaysUtc(d, days) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

export function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function parseIsoDateUtc(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function computeVacationEntitlement(hireDateInput, refDateInput) {
  const hireDate = hireDateInput instanceof Date ? hireDateInput : new Date(hireDateInput);
  const refDate = refDateInput instanceof Date ? refDateInput : new Date(refDateInput);

  const hY = hireDate.getUTCFullYear();
  const hM = hireDate.getUTCMonth();
  const hD = hireDate.getUTCDate();

  const rY = refDate.getUTCFullYear();
  const rM = refDate.getUTCMonth();
  const rD = refDate.getUTCDate();

  let years = rY - hY;
  if (rM < hM || (rM === hM && rD < hD)) {
    years -= 1;
  }
  years = Math.max(0, years);

  let entitled = 0;
  let lastAnniv;
  let nextAnniv;
  let deadline;

  if (years === 0) {
    lastAnniv = new Date(Date.UTC(hY, hM, hD));
    nextAnniv = addMonthsUtc(lastAnniv, 12);
    deadline = addMonthsUtc(nextAnniv, 6);
  } else {
    if (years === 1 || years === 2) entitled = 15;
    else if (years === 3) entitled = 16;
    else if (years === 4) entitled = 18;
    else if (years === 5) entitled = 20;
    else if (years >= 6 && years <= 10) entitled = 22;
    else if (years >= 11 && years <= 15) entitled = 24;
    else if (years >= 16 && years <= 20) entitled = 26;
    else entitled = 26 + 2 * Math.floor((years - 16) / 5);

    const annivYear = hY + years;
    const annivDay = Math.min(hD, daysInMonth(annivYear, hM + 1));
    lastAnniv = new Date(Date.UTC(annivYear, hM, annivDay));
    nextAnniv = addMonthsUtc(lastAnniv, 12);
    deadline = addMonthsUtc(lastAnniv, 6);
  }

  const periodEnd = addDaysUtc(nextAnniv, -1);
  const refIso = toIsoDate(refDate);
  const deadlineIso = toIsoDate(deadline);

  return {
    yearsOfService: years,
    entitledDays: entitled,
    periodStart: lastAnniv,
    periodEnd,
    anniversaryDate: lastAnniv,
    nextAnniversaryDate: nextAnniv,
    sixMonthDeadline: deadline,
    isDeadlineExpired: years > 0 && refIso > deadlineIso,
  };
}

export function countBusinessDays(startDate, endDate, holidaySet = new Set()) {
  let count = 0;
  let cur = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

  while (cur <= end) {
    const dow = cur.getUTCDay(); // 0 = Sun, 6 = Sat
    const iso = toIsoDate(cur);
    if (dow !== 0 && dow !== 6 && !holidaySet.has(iso)) {
      count += 1;
    }
    cur = addDaysUtc(cur, 1);
  }
  return count;
}
