export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "new" | "in_progress" | "on_hold" | "done" | "not_done";
export type ViewType = "kanban" | "todo" | "calendar";
/** How a task comes back after it is done: a fresh copy with the next due date. */
export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "every_n_days";

/** One small step inside a task (ADHD-friendly: break a big task into tiny ones). */
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Space {
  id: number;
  name: string;
  color: string;
  view: ViewType;
  position: number;
}

export interface Task {
  id: number;
  space_id: number;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  due_date: string | null; // YYYY-MM-DD
  due_time: string | null; // HH:MM, Israel time
  /** Why the task wasn't done / can't be done. Only meaningful (and required) when status is "not_done". */
  status_note: string;
  /** Small steps, in order. */
  checklist: ChecklistItem[];
  recurrence: Recurrence;
  /** Only meaningful when recurrence === "every_n_days". */
  recurrence_n: number | null;
  /** A calendar entry to know about and prepare for (an exam, a meeting), not something to tick off. */
  is_event: boolean;
  position: number;
  created_at: string;
  completed_at: string | null;
}

export interface Settings {
  dashboard_spaces: number[] | null; // null = all
}

export type RepeatKind = "none" | "hourly" | "daily" | "weekly" | "every_n_days";

export interface Reminder {
  id: number;
  task_id: number | null;
  title: string;
  remind_at: string; // ISO timestamp (UTC)
  repeat: RepeatKind;
  repeat_n: number | null; // only meaningful when repeat === "every_n_days"
  last_sent_at: string | null;
  enabled: boolean;
  created_at: string;
}

export interface PushSubscriptionRecord {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export type AgentScope = { type: "all" } | { type: "space"; spaceId: number };

export interface PendingInfo {
  id: string;
  title: string;
  count: number;
  items: string[];
  destructive: boolean;
}

export interface AgentResponse {
  reply: string;
  actions: string[];
  pending?: PendingInfo;
  mutated: boolean;
  error?: string;
}
