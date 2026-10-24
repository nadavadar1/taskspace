import type { Priority, Status, ViewType } from "./types";

export const PRIORITIES: { key: Priority; label: string; color: string; rank: number }[] = [
  { key: "urgent", label: "דחוף", color: "#dc2626", rank: 0 },
  { key: "high", label: "גבוהה", color: "#f97316", rank: 1 },
  { key: "medium", label: "בינונית", color: "#eab308", rank: 2 },
  { key: "low", label: "נמוכה", color: "#64748b", rank: 3 },
];

export const STATUSES: { key: Status; label: string; color: string }[] = [
  { key: "new", label: "חדשה", color: "#6366f1" },
  { key: "in_progress", label: "בעבודה", color: "#0ea5e9" },
  { key: "on_hold", label: "בהשהייה", color: "#a855f7" },
  { key: "done", label: "הושלמה", color: "#22c55e" },
  { key: "not_done", label: "לא בוצעה", color: "#78716c" },
];

/** A task is closed once it is done, or it was decided it won't be done (with a reason). Closed tasks are not "open", overdue or reminded. */
export function isClosed(status: Status): boolean {
  return status === "done" || status === "not_done";
}

export const VIEWS: { key: ViewType; label: string; description: string }[] = [
  { key: "kanban", label: "קנבן", description: "עמודות לפי סטטוס, גוררים משימות ביניהן" },
  { key: "todo", label: "רשימת TODO", description: "רשימה עם וי, ממוינת לפי עדיפות" },
  { key: "calendar", label: "לוח שנה", description: "חודש שלם, כל משימה על תאריך היעד שלה" },
];

export const SPACE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
  "#6366f1",
  "#14b8a6",
];

export const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map((p) => [p.key, p])) as Record<
  Priority,
  (typeof PRIORITIES)[number]
>;
export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s])) as Record<
  Status,
  (typeof STATUSES)[number]
>;

export const PRIORITY_KEYS = PRIORITIES.map((p) => p.key);
export const STATUS_KEYS = STATUSES.map((s) => s.key);
export const VIEW_KEYS = VIEWS.map((v) => v.key);
