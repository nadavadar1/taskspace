export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "new" | "in_progress" | "on_hold" | "done";
export type ViewType = "kanban" | "todo" | "calendar";

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
