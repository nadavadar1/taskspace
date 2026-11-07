import { addDays, parts } from "./dates";
import type { ChecklistItem, Recurrence } from "./types";

export const RECURRENCES: Recurrence[] = ["none", "daily", "weekly", "monthly", "every_n_days"];

export function isRecurrence(v: unknown): v is Recurrence {
  return typeof v === "string" && (RECURRENCES as string[]).includes(v);
}

export function recurrenceLabel(kind: Recurrence, n?: number | null): string {
  switch (kind) {
    case "daily":
      return "כל יום";
    case "weekly":
      return "כל שבוע";
    case "monthly":
      return "כל חודש";
    case "every_n_days":
      return n === 2 ? "כל יומיים" : `כל ${n ?? 2} ימים`;
    default:
      return "לא חוזרת";
  }
}

function addMonths(iso: string, n: number): string {
  const { y, m, d } = parts(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * The due date of the next copy of a recurring task.
 * Counted from the old due date when it is today or later (done early or on time),
 * otherwise from today (done late: the next one is a full interval away, not already overdue).
 */
export function nextDueDate(kind: Recurrence, n: number | null, due: string | null, today: string): string | null {
  if (kind === "none") return null;
  const base = due && due >= today ? due : today;
  switch (kind) {
    case "daily":
      return addDays(base, 1);
    case "weekly":
      return addDays(base, 7);
    case "monthly":
      return addMonths(base, 1);
    case "every_n_days":
      return addDays(base, Math.max(1, n ?? 2));
  }
}

export function checklistProgress(list: ChecklistItem[]): { done: number; total: number } {
  return { done: list.filter((i) => i.done).length, total: list.length };
}

let counter = 0;
export function newChecklistId(): string {
  counter = (counter + 1) % 1e6;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Accepts items or plain strings; keeps at most 50 steps of up to 200 characters. */
export function sanitizeChecklist(input: unknown): ChecklistItem[] {
  let v = input;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  const out: ChecklistItem[] = [];
  for (const raw of v) {
    if (out.length >= 50) break;
    if (typeof raw === "string") {
      const text = raw.trim().slice(0, 200);
      if (text) out.push({ id: newChecklistId(), text, done: false });
      continue;
    }
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const text = String(r.text ?? "").trim().slice(0, 200);
    if (!text) continue;
    const id = typeof r.id === "string" && r.id ? r.id.slice(0, 40) : newChecklistId();
    out.push({ id, text, done: r.done === true });
  }
  return out;
}

/* ---------------- a repeating task's history ("done for this round?") ---------------- */

/** Copies of one repeating task share the space and the title. */
export function seriesKey(t: { space_id: number; title: string }): string {
  return `${t.space_id}|${t.title.trim()}`;
}

export interface SeriesInfo {
  /** Israel date (YYYY-MM-DD) of the latest completion of this task's earlier copies. */
  lastDone: string | null;
  /** The current round is already done: the open copy is the next one, not yet due. */
  covered: boolean;
  /** Every Israel date on which a copy was completed. */
  doneDays: Set<string>;
}

function israelDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** The previous due date, one interval before `due`. */
export function previousDue(kind: Recurrence, n: number | null, due: string): string {
  switch (kind) {
    case "daily":
      return addDays(due, -1);
    case "weekly":
      return addDays(due, -7);
    case "monthly":
      return addMonths(due, -1);
    case "every_n_days":
      return addDays(due, -Math.max(1, n ?? 2));
    default:
      return due;
  }
}

/** For every open repeating task: when it was last done and whether this round is already covered. */
export function buildSeries(
  tasks: { id: number; space_id: number; title: string; status: string; completed_at: string | null; recurrence: Recurrence; recurrence_n: number | null; due_date: string | null }[],
  today: string,
): Map<number, SeriesInfo> {
  const done = new Map<string, Set<string>>();
  for (const t of tasks) {
    if (t.status !== "done" || !t.completed_at || t.recurrence === "none") continue;
    const k = seriesKey(t);
    if (!done.has(k)) done.set(k, new Set());
    done.get(k)!.add(israelDate(t.completed_at));
  }
  const out = new Map<number, SeriesInfo>();
  for (const t of tasks) {
    if (t.recurrence === "none" || t.status === "done" || t.status === "not_done") continue;
    const days = done.get(seriesKey(t)) ?? new Set<string>();
    let lastDone: string | null = null;
    for (const d of days) if (!lastDone || d > lastDone) lastDone = d;
    const covered =
      !!lastDone && !!t.due_date && t.due_date > today && lastDone >= previousDue(t.recurrence, t.recurrence_n, t.due_date);
    out.set(t.id, { lastDone, covered, doneDays: days });
  }
  return out;
}

/** "בוצע היום" / "בוצע אתמול" / "בוצע השבוע" / "בוצע לפני 3 ימים". */
export function coveredLabel(info: SeriesInfo, kind: Recurrence, today: string): string {
  if (!info.lastDone) return "";
  const days = Math.round((Date.parse(today) - Date.parse(info.lastDone)) / 86400000);
  if (days <= 0) return "בוצע היום";
  if (days === 1) return "בוצע אתמול";
  if (kind === "weekly") return "בוצע השבוע";
  if (kind === "monthly") return "בוצע החודש";
  return `בוצע לפני ${days} ימים`;
}
