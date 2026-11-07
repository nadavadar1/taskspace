import { PRIORITY_MAP, isOpenTask } from "./constants";
import { addDays, todayISO } from "./dates";
import type { Task } from "./types";

const dueKey = (t: Task) => `${t.due_date ?? "9999-99-99"} ${t.due_time ?? "99:99"}`;
const rank = (t: Task) => PRIORITY_MAP[t.priority].rank;

/** 0 = overdue, 1 = today, 2 = urgent, 3 = in progress, 4 = the rest */
function bucket(t: Task, today: string): number {
  if (t.due_date && t.due_date < today) return 0;
  if (t.due_date === today) return 1;
  if (t.priority === "urgent") return 2;
  if (t.status === "in_progress") return 3;
  return 4;
}

/**
 * The order in which to work: overdue, then today, then urgent, then what is already started, then the rest;
 * inside each group the most important and nearest first. Paused tasks come last.
 */
export function focusQueue(tasks: Task[], today: string, covered?: Set<number> | Map<number, { covered: boolean }>): Task[] {
  // a repeating task already done for this round is not "next" (it waits for its next date)
  const isCovered = (t: Task) =>
    !covered ? false : covered instanceof Set ? covered.has(t.id) : !!covered.get(t.id)?.covered;
  return tasks
    .filter((t) => isOpenTask(t))
    .sort(
      (a, b) =>
        Number(isCovered(a)) - Number(isCovered(b)) ||
        Number(a.status === "on_hold") - Number(b.status === "on_hold") ||
        bucket(a, today) - bucket(b, today) ||
        rank(a) - rank(b) ||
        dueKey(a).localeCompare(dueKey(b)) ||
        a.id - b.id,
    );
}

/**
 * Days in a row (Israel time) with at least one task done, counting back from today.
 * A day that has not had a completion yet does not break the streak until it is over.
 */
export function completionStreak(tasks: Task[], today: string): number {
  const days = new Set<string>();
  for (const t of tasks) if (t.status === "done" && t.completed_at) days.add(todayISO(new Date(t.completed_at)));
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
