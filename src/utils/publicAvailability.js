// ===== DISPONIBILIDAD PÚBLICA: ETIQUETAS =====
// Day labels of the public availability page (SPEC 07). Local-date parsing only: never
// `new Date('YYYY-MM-DD')`, which is UTC and shifts the weekday.

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const parse = (isoDate) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/** 'Lunes 7 ene'; with `today` ('YYYY-MM-DD') the first two days read 'Hoy · …' and 'Mañana · …'. */
export function dayLabel(isoDate, today) {
  const date = parse(isoDate);
  const base = `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
  if (!today) return base;
  const start = parse(today);
  const days = Math.round((date - start) / 86400000);
  if (days === 0) return `Hoy · ${base}`;
  if (days === 1) return `Mañana · ${base}`;
  return base;
}
