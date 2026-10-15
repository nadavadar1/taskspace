export const TZ = "Asia/Jerusalem";

export const HE_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];
export const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const HE_DAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/** Today's date (YYYY-MM-DD) in Israel time. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isISO(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(iso: string, n: number): string {
  const dt = toUTC(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** 0 = Sunday */
export function dayOfWeek(iso: string): number {
  return toUTC(iso).getUTCDay();
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -dayOfWeek(iso));
}

/** a - b in whole days */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86400000);
}

export function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function formatShort(iso: string): string {
  const { m, d } = parts(iso);
  return `${d}/${m}`;
}

export function formatLong(iso: string): string {
  const { m, d } = parts(iso);
  return `יום ${HE_DAYS[dayOfWeek(iso)]}, ${d} ב${HE_MONTHS[m - 1]}`;
}

export function relativeLabel(iso: string, today: string): string {
  const diff = diffDays(iso, today);
  if (diff === 0) return "היום";
  if (diff === 1) return "מחר";
  if (diff === -1) return "אתמול";
  if (diff < 0) return `באיחור ${-diff} ימים`;
  if (diff < 7) return `יום ${HE_DAYS[dayOfWeek(iso)]}`;
  return formatShort(iso);
}

/** 6 weeks x 7 days, Sunday first, covering the given month. */
export function monthGrid(year: number, month: number): string[][] {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const start = startOfWeek(first);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: string[] = [];
    for (let d = 0; d < 7; d++) row.push(addDays(start, w * 7 + d));
    weeks.push(row);
  }
  return weeks;
}
