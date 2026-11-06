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
