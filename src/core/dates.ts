const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** e.g. "2026-11-25 (Wednesday)" — the weekday helps the model resolve "next Friday". */
export function todayForPrompt(d: Date): string {
  return `${localDateString(d)} (${WEEKDAYS[d.getDay()]})`;
}

export function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 local of the week containing ts. */
export function startOfLocalWeek(ts: number): number {
  const d = new Date(startOfLocalDay(ts));
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** Normalises a model-provided due date; anything invalid becomes null. */
export function normaliseDueDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, 10);
  return isValidIsoDate(s) ? s : null;
}

/** Next occurrence of hh:mm local time strictly after `now`. */
export function nextOccurrence(now: Date, hour: number, minute: number): Date {
  const d = new Date(now.getTime());
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(ts: number): string {
  return `${localDateString(new Date(ts))} ${formatTime(ts)}`;
}

/** "today", "tomorrow", "Fri 28 Nov", "overdue · 3 Nov" for due dates. */
export function describeDueDate(due: string, now: Date): string {
  const today = localDateString(now);
  const t = new Date(now.getTime());
  t.setDate(t.getDate() + 1);
  const tomorrow = localDateString(t);
  if (due === today) return 'today';
  if (due === tomorrow) return 'tomorrow';
  const [y, m, d] = due.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d);
  const label = `${WEEKDAYS[dt.getDay()]!.slice(0, 3)} ${d} ${dt.toLocaleString('en', { month: 'short' })}`;
  return due < today ? `overdue · ${label}` : label;
}
