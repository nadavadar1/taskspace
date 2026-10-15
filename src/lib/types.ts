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
  position: number;
  created_at: string;
  completed_at: string | null;
}

export interface Settings {
  dashboard_spaces: number[] | null; // null = all
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
