import { diffDays, utcToZoned, zonedToUtcISO } from "./dates";
import type { Reminder, RepeatKind, Task } from "./types";

export const REPEAT_KINDS: RepeatKind[] = ["none", "hourly", "daily", "weekly", "every_n_days"];

export const REPEAT_LABELS: Record<RepeatKind, string> = {
  none: "פעם אחת",
  hourly: "כל שעה",
  daily: "כל יום",
  weekly: "כל שבוע",
  every_n_days: "כל כמה ימים",
};

/** The moment (UTC ISO) a task is due, or null when it has no due date. A date without a time means end of that day. */
export function taskDeadlineUTC(task: Pick<Task, "due_date" | "due_time">): string | null {
  if (!task.due_date) return null;
  return zonedToUtcISO(task.due_date, task.due_time ?? "23:59");
}

/**
 * The reminder that the task dialog edits: the oldest enabled reminder linked to the task.
 * Must stay in sync with `primaryTaskReminderId` on the server.
 */
export function primaryReminder(reminders: Reminder[], taskId: number): Reminder | undefined {
  return reminders
    .filter((r) => r.task_id === taskId && r.enabled)
    .sort((a, b) => a.id - b.id)[0];
}

/**
 * Whether an enabled reminder is scheduled to fire on the given Israel-local day.
 * Repeating reminders stop at the task's due date (see claimDueReminders), so days after it don't count.
 */
export function reminderFiresOn(reminder: Reminder, day: string, task?: Pick<Task, "due_date" | "due_time">): boolean {
  if (!reminder.enabled) return false;
  const start = utcToZoned(reminder.remind_at).date;
  if (day < start) return false;
  if (reminder.repeat === "none") return day === start;
  if (task?.due_date && day > task.due_date) return false;
  const gap = diffDays(day, start);
  switch (reminder.repeat) {
    case "hourly":
    case "daily":
      return true;
    case "weekly":
      return gap % 7 === 0;
    case "every_n_days":
      return gap % Math.max(1, reminder.repeat_n ?? 1) === 0;
    default:
      return false;
  }
}
