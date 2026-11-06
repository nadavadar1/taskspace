import { PRIORITY_MAP, isClosed } from "./constants";
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
export function focusQueue(tasks: Task[], today: string): Task[] {
  return tasks
    .filter((t) => !isClosed(t.status))
    .sort(
      (a, b) =>
        Number(a.status === "on_hold") - Number(b.status === "on_hold") ||
        bucket(a, today) - bucket(b, today) ||
        rank(a) - rank(b) ||
        dueKey(a).localeCompare(dueKey(b)) ||
        a.id - b.id,
    );
}
