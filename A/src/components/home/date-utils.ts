export const MIN_YEAR = 2015;
export const CURRENT_YEAR = new Date().getFullYear();
export const MIN_DATE = String(MIN_YEAR) + "-01-01";
export const MAX_DATE = String(CURRENT_YEAR) + "-12-31";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isLeapYear(year: number) {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

export function daysInMonth(year: number, month: number) {
  const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return monthLengths[month];
}

export function firstWeekdayOfMonth(year: number, month: number) {
  const date = new Date(Date.UTC(2000, month, 1));
  date.setUTCFullYear(year);
  return date.getUTCDay();
}

export function toIsoDate(year: number, month: number, day: number) {
  return String(year).padStart(4, "0") + "-" + pad(month + 1) + "-" + pad(day);
}

export function formatDateDigits(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length < 4) return digits;
  if (digits.length === 4) return digits + "-";
  if (digits.length < 6) return digits.slice(0, 4) + "-" + digits.slice(4);
  if (digits.length === 6) return digits.slice(0, 4) + "-" + digits.slice(4) + "-";
  return digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-" + digits.slice(6);
}

export function formatDateForDisplay(value: string) {
  return value;
}

export function parseDisplayDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < MIN_YEAR || year > CURRENT_YEAR || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month - 1)) return null;
  const iso = toIsoDate(year, month - 1, day);
  return iso >= MIN_DATE && iso <= MAX_DATE ? iso : null;
}
