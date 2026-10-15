"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Priority, Settings, Space, Status, Task, ViewType } from "@/lib/types";
import { todayISO } from "@/lib/dates";

export interface NewTaskDefaults {
  space_id?: number;
  due_date?: string | null;
  status?: Status;
  priority?: Priority;
  title?: string;
}

type TaskDialogState = { mode: "edit"; id: number } | { mode: "new"; defaults: NewTaskDefaults } | null;
type SpaceDialogState = { mode: "new" } | { mode: "edit"; id: number } | null;

interface Toast {
  id: number;
  message: string;
}

interface DataCtx {
  spaces: Space[];
  tasks: Task[];
  settings: Settings;
  today: string;
  refresh: () => Promise<void>;
  addTask: (input: NewTaskDefaults & { space_id: number; title: string; description?: string }) => Promise<Task | null>;
  patchTask: (id: number, patch: Partial<Task>) => Promise<void>;
  removeTask: (id: number) => Promise<void>;
  addSpace: (input: { name: string; color: string; view: ViewType }) => Promise<Space | null>;
  patchSpace: (id: number, patch: Partial<Pick<Space, "name" | "color" | "view">>) => Promise<void>;
  removeSpace: (id: number) => Promise<void>;
  setDashboardSpaces: (ids: number[] | null) => void;
  toast: (message: string) => void;
  toasts: Toast[];
  taskDialog: TaskDialogState;
  openTask: (id: number) => void;
  openNewTask: (defaults?: NewTaskDefaults) => void;
  closeTaskDialog: () => void;
  spaceDialog: SpaceDialogState;
  openSpaceDialog: (state: NonNullable<SpaceDialogState>) => void;
  closeSpaceDialog: () => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  chatPrefill: { text: string; send: boolean; nonce: number } | null;
  askAgent: (text: string, send?: boolean) => void;
  consumePrefill: () => void;
}

const Ctx = createContext<DataCtx | null>(null);

export function useData(): DataCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData outside provider");
  return v;
}

async function request<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.reload();
    throw new Error("unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "הפעולה נכשלה");
  return data as T;
}

function localPatch(task: Task, patch: Partial<Task>): Task {
  const next = { ...task, ...patch };
  if (patch.status && patch.status !== task.status) {
    next.completed_at = patch.status === "done" ? new Date().toISOString() : null;
  }
  return next;
}

export function DataProvider({
  initial,
  children,
}: {
  initial: { spaces: Space[]; tasks: Task[]; settings: Settings };
  children: React.ReactNode;
}) {
  const [spaces, setSpaces] = useState<Space[]>(initial.spaces);
  const [tasks, setTasks] = useState<Task[]>(initial.tasks);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [today, setToday] = useState(() => todayISO());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [taskDialog, setTaskDialog] = useState<TaskDialogState>(null);
  const [spaceDialog, setSpaceDialog] = useState<SpaceDialogState>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPrefill, setChatPrefill] = useState<{ text: string; send: boolean; nonce: number } | null>(null);
  const toastId = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(t);
  }, []);

  const toast = useCallback((message: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await request<{ spaces: Space[]; tasks: Task[]; settings: Settings }>("/api/bootstrap", "GET");
      setSpaces(data.spaces);
      setTasks(data.tasks);
      setSettings(data.settings);
    } catch {
      /* keep what we have */
    }
  }, []);

  // refresh when the tab becomes visible again
  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  const addTask = useCallback<DataCtx["addTask"]>(
    async (input) => {
      try {
        const { task } = await request<{ task: Task }>("/api/tasks", "POST", input);
        setTasks((t) => [...t, task]);
        return task;
      } catch (e) {
        toast(e instanceof Error ? e.message : "יצירת המשימה נכשלה");
        return null;
      }
    },
    [toast],
  );

  const patchTask = useCallback<DataCtx["patchTask"]>(
    async (id, patch) => {
      let before: Task | undefined;
      setTasks((list) =>
        list.map((t) => {
          if (t.id !== id) return t;
          before = t;
          return localPatch(t, patch);
        }),
      );
      try {
        const { task } = await request<{ task: Task }>(`/api/tasks/${id}`, "PATCH", patch);
        setTasks((list) => list.map((t) => (t.id === id ? task : t)));
      } catch (e) {
        if (before) setTasks((list) => list.map((t) => (t.id === id ? before! : t)));
        toast(e instanceof Error ? e.message : "העדכון נכשל");
      }
    },
    [toast],
  );

  const removeTask = useCallback<DataCtx["removeTask"]>(
    async (id) => {
      let removed: Task | undefined;
      setTasks((list) => {
        removed = list.find((t) => t.id === id);
        return list.filter((t) => t.id !== id);
      });
      try {
        await request(`/api/tasks/${id}`, "DELETE");
      } catch (e) {
        if (removed) setTasks((list) => [...list, removed!]);
        toast(e instanceof Error ? e.message : "המחיקה נכשלה");
      }
    },
    [toast],
  );

  const addSpace = useCallback<DataCtx["addSpace"]>(
    async (input) => {
      try {
        const { space } = await request<{ space: Space }>("/api/spaces", "POST", input);
        setSpaces((s) => [...s, space]);
        return space;
      } catch (e) {
        toast(e instanceof Error ? e.message : "יצירת המרחב נכשלה");
        return null;
      }
    },
    [toast],
  );

  const patchSpace = useCallback<DataCtx["patchSpace"]>(
    async (id, patch) => {
      let before: Space | undefined;
      setSpaces((list) =>
        list.map((s) => {
          if (s.id !== id) return s;
          before = s;
          return { ...s, ...patch };
        }),
      );
      try {
        const { space } = await request<{ space: Space }>(`/api/spaces/${id}`, "PATCH", patch);
        setSpaces((list) => list.map((s) => (s.id === id ? space : s)));
      } catch (e) {
        if (before) setSpaces((list) => list.map((s) => (s.id === id ? before! : s)));
        toast(e instanceof Error ? e.message : "העדכון נכשל");
      }
    },
    [toast],
  );

  const removeSpace = useCallback<DataCtx["removeSpace"]>(
    async (id) => {
      try {
        await request(`/api/spaces/${id}`, "DELETE");
        setSpaces((s) => s.filter((x) => x.id !== id));
        setTasks((t) => t.filter((x) => x.space_id !== id));
      } catch (e) {
        toast(e instanceof Error ? e.message : "המחיקה נכשלה");
      }
    },
    [toast],
  );

  const setDashboardSpaces = useCallback(
    (ids: number[] | null) => {
      setSettings((s) => ({ ...s, dashboard_spaces: ids }));
      request("/api/settings", "PUT", { dashboard_spaces: ids }).catch(() => toast("שמירת הבחירה נכשלה"));
    },
    [toast],
  );

  const askAgent = useCallback((text: string, send = true) => {
    setChatOpen(true);
    setChatPrefill({ text, send, nonce: Date.now() });
  }, []);

  const value = useMemo<DataCtx>(
    () => ({
      spaces,
      tasks,
      settings,
      today,
      refresh,
      addTask,
      patchTask,
      removeTask,
      addSpace,
      patchSpace,
      removeSpace,
      setDashboardSpaces,
      toast,
      toasts,
      taskDialog,
      openTask: (id) => setTaskDialog({ mode: "edit", id }),
      openNewTask: (defaults = {}) => setTaskDialog({ mode: "new", defaults }),
      closeTaskDialog: () => setTaskDialog(null),
      spaceDialog,
      openSpaceDialog: (s) => setSpaceDialog(s),
      closeSpaceDialog: () => setSpaceDialog(null),
      chatOpen,
      setChatOpen,
      chatPrefill,
      askAgent,
      consumePrefill: () => setChatPrefill(null),
    }),
    [
      spaces,
      tasks,
      settings,
      today,
      refresh,
      addTask,
      patchTask,
      removeTask,
      addSpace,
      patchSpace,
      removeSpace,
      setDashboardSpaces,
      toast,
      toasts,
      taskDialog,
      spaceDialog,
      chatOpen,
      chatPrefill,
      askAgent,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
