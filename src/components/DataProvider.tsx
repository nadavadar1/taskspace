"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ChecklistItem, Priority, Recurrence, Reminder, RepeatKind, Settings, Space, Status, Task, ViewType } from "@/lib/types";
import { relativeLabel, todayISO } from "@/lib/dates";
import { isClosed, isOpenTask } from "@/lib/constants";
import { buildSeries, type SeriesInfo } from "@/lib/recurrence";

export interface NewTaskDefaults {
  space_id?: number;
  due_date?: string | null;
  due_time?: string | null;
  status?: Status;
  priority?: Priority;
  title?: string;
  recurrence?: Recurrence;
  recurrence_n?: number | null;
}

type TaskDialogState = { mode: "edit"; id: number } | { mode: "new"; defaults: NewTaskDefaults } | null;
type SpaceDialogState = { mode: "new" } | { mode: "edit"; id: number } | null;

export interface Toast {
  id: number;
  message: string;
  tone?: "default" | "success";
  action?: { label: string; run: () => void };
}

export interface TaskReminderInput {
  date: string; // YYYY-MM-DD, Israel time
  time: string; // HH:MM, Israel time
  repeat: RepeatKind;
  repeat_n?: number | null;
}

interface DataCtx {
  spaces: Space[];
  tasks: Task[];
  /** Enabled reminders only. */
  reminders: Reminder[];
  settings: Settings;
  today: string;
  /** Open repeating tasks: when the task was last done, and whether the current round is already done. */
  series: Map<number, SeriesInfo>;
  /** Still to do: open, not a calendar event, and not a repeating task already done for this round. */
  isTodo: (t: Task) => boolean;
  refresh: () => Promise<void>;
  saveTaskReminder: (taskId: number, input: TaskReminderInput) => Promise<boolean>;
  removeTaskReminder: (taskId: number) => Promise<void>;
  addTask: (
    input: NewTaskDefaults & {
      space_id: number;
      title: string;
      description?: string;
      status_note?: string;
      checklist?: ChecklistItem[];
    },
  ) => Promise<Task | null>;
  patchTask: (id: number, patch: Partial<Task>) => Promise<void>;
  removeTask: (id: number) => Promise<void>;
  addSpace: (input: { name: string; color: string; view: ViewType }) => Promise<Space | null>;
  patchSpace: (id: number, patch: Partial<Pick<Space, "name" | "color" | "view">>) => Promise<void>;
  removeSpace: (id: number) => Promise<void>;
  setDashboardSpaces: (ids: number[] | null) => void;
  toast: (message: string, opts?: Omit<Toast, "id" | "message">) => void;
  dismissToast: (id: number) => void;
  toasts: Toast[];
  /** Bumps on every completed task: drives the small celebration. */
  celebration: number;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  quickAddOpen: boolean;
  setQuickAddOpen: (open: boolean) => void;
  /** Deletes at once on screen; the server delete waits a few seconds so "ביטול" can bring it back. */
  deleteWithUndo: (id: number) => void;
  /** The quick-actions sheet (long press / right click on a task). */
  actionsFor: number | null;
  openActions: (id: number) => void;
  closeActions: () => void;
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
    // the reason only belongs to "not done"; the server keeps the same rule
    if (patch.status !== "not_done" && patch.status_note === undefined) next.status_note = "";
  }
  return next;
}

export function DataProvider({
  initial,
  children,
}: {
  initial: { spaces: Space[]; tasks: Task[]; settings: Settings; reminders: Reminder[] };
  children: React.ReactNode;
}) {
  const [spaces, setSpaces] = useState<Space[]>(initial.spaces);
  const [tasks, setTasks] = useState<Task[]>(initial.tasks);
  const [reminders, setReminders] = useState<Reminder[]>(initial.reminders);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [today, setToday] = useState(() => todayISO());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [taskDialog, setTaskDialog] = useState<TaskDialogState>(null);
  const [spaceDialog, setSpaceDialog] = useState<SpaceDialogState>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPrefill, setChatPrefill] = useState<{ text: string; send: boolean; nonce: number } | null>(null);
  const [celebration, setCelebration] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<number | null>(null);
  const pendingDeletes = useRef(new Map<number, { timer: ReturnType<typeof setTimeout>; task: Task }>());
  const toastId = useRef(0);
  const tasksRef = useRef<Task[]>(initial.tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    const t = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(t);
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback<DataCtx["toast"]>((message, opts) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, message, ...opts }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts?.action ? 6000 : 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await request<{ spaces: Space[]; tasks: Task[]; settings: Settings; reminders: Reminder[] }>(
        "/api/bootstrap",
        "GET",
      );
      setSpaces(data.spaces);
      setTasks(data.tasks.filter((t) => !pendingDeletes.current.has(t.id)));
      setSettings(data.settings);
      setReminders(data.reminders ?? []);
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

  const patchTaskRef = useRef<DataCtx["patchTask"] | null>(null);
  const removeTaskRef = useRef<DataCtx["removeTask"] | null>(null);

  const patchTask = useCallback<DataCtx["patchTask"]>(
    async (id, patch) => {
      const before = tasksRef.current.find((t) => t.id === id);
      setTasks((list) => list.map((t) => (t.id === id ? localPatch(t, patch) : t)));
      const justDone = patch.status === "done" && before && before.status !== "done";
      if (justDone) setCelebration((n) => n + 1);
      try {
        const { task, spawned } = await request<{ task: Task; spawned?: Task | null }>(`/api/tasks/${id}`, "PATCH", patch);
        setTasks((list) => [...list.map((t) => (t.id === id ? task : t)), ...(spawned ? [spawned] : [])]);
        // the server switches off the reminders of a task that is closed (done / not done)
        if (patch.status && isClosed(patch.status)) {
          setReminders((list) => list.filter((r) => r.task_id !== id));
          if (spawned) void refresh(); // the next copy may carry a reminder
        }
        if (justDone && before) {
          const undo = () => {
            void patchTaskRef.current?.(id, {
              status: before.status,
              ...(before.status === "not_done" ? { status_note: before.status_note } : {}),
            });
            if (spawned) void removeTaskRef.current?.(spawned.id);
          };
          toast(
            spawned && spawned.due_date
              ? `כל הכבוד! הפעם הבאה: ${relativeLabel(spawned.due_date, todayISO())}`
              : "כל הכבוד! המשימה הושלמה",
            { tone: "success", action: { label: "ביטול", run: undo } },
          );
        }
      } catch (e) {
        if (before) setTasks((list) => list.map((t) => (t.id === id ? before : t)));
        toast(e instanceof Error ? e.message : "העדכון נכשל");
      }
    },
    [toast, refresh],
  );

  const saveTaskReminder = useCallback<DataCtx["saveTaskReminder"]>(
    async (taskId, input) => {
      try {
        const { reminder } = await request<{ reminder: Reminder }>(`/api/tasks/${taskId}/reminder`, "POST", input);
        setReminders((list) => [...list.filter((r) => r.id !== reminder.id), reminder]);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : "שמירת התזכורת נכשלה");
        return false;
      }
    },
    [toast],
  );

  const removeTaskReminder = useCallback<DataCtx["removeTaskReminder"]>(
    async (taskId) => {
      try {
        const { id } = await request<{ id: number | null }>(`/api/tasks/${taskId}/reminder`, "DELETE");
        if (id !== null) setReminders((list) => list.filter((r) => r.id !== id));
      } catch (e) {
        toast(e instanceof Error ? e.message : "מחיקת התזכורת נכשלה");
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
        setReminders((list) => list.filter((r) => r.task_id !== id));
      } catch (e) {
        if (removed) setTasks((list) => [...list, removed!]);
        toast(e instanceof Error ? e.message : "המחיקה נכשלה");
      }
    },
    [toast],
  );

  useEffect(() => {
    patchTaskRef.current = patchTask;
    removeTaskRef.current = removeTask;
  }, [patchTask, removeTask]);

  const commitDelete = useCallback(
    async (id: number) => {
      const p = pendingDeletes.current.get(id);
      if (!p) return;
      pendingDeletes.current.delete(id);
      clearTimeout(p.timer);
      try {
        await request(`/api/tasks/${id}`, "DELETE");
        setReminders((list) => list.filter((r) => r.task_id !== id));
      } catch (e) {
        setTasks((list) => (list.some((t) => t.id === id) ? list : [...list, p.task]));
        toast(e instanceof Error ? e.message : "המחיקה נכשלה");
      }
    },
    [toast],
  );

  const deleteWithUndo = useCallback<DataCtx["deleteWithUndo"]>(
    (id) => {
      const task = tasksRef.current.find((t) => t.id === id);
      if (!task || pendingDeletes.current.has(id)) return;
      setTasks((list) => list.filter((t) => t.id !== id));
      setTaskDialog((d) => (d?.mode === "edit" && d.id === id ? null : d));
      setActionsFor((a) => (a === id ? null : a));
      const timer = setTimeout(() => void commitDelete(id), 5500);
      pendingDeletes.current.set(id, { timer, task });
      toast(`נמחקה: ${task.title}`, {
        action: {
          label: "ביטול",
          run: () => {
            const p = pendingDeletes.current.get(id);
            if (!p) return;
            clearTimeout(p.timer);
            pendingDeletes.current.delete(id);
            setTasks((list) => (list.some((t) => t.id === id) ? list : [...list, p.task]));
          },
        },
      });
    },
    [toast, commitDelete],
  );

  // leaving the app (or locking the phone) finishes the waiting deletes right away
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== "hidden") return;
      for (const [id, p] of pendingDeletes.current) {
        clearTimeout(p.timer);
        void fetch(`/api/tasks/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
      }
      pendingDeletes.current.clear();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

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
        // refresh drops the reminders of the deleted space's tasks
        void refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "המחיקה נכשלה");
      }
    },
    [toast, refresh],
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

  const series = useMemo(() => buildSeries(tasks, today), [tasks, today]);
  const isTodo = useCallback((t: Task) => isOpenTask(t) && !series.get(t.id)?.covered, [series]);

  const value = useMemo<DataCtx>(
    () => ({
      spaces,
      tasks,
      series,
      isTodo,
      reminders,
      settings,
      today,
      refresh,
      saveTaskReminder,
      removeTaskReminder,
      addTask,
      patchTask,
      removeTask,
      addSpace,
      patchSpace,
      removeSpace,
      setDashboardSpaces,
      toast,
      dismissToast,
      toasts,
      celebration,
      paletteOpen,
      setPaletteOpen,
      quickAddOpen,
      setQuickAddOpen,
      deleteWithUndo,
      actionsFor,
      openActions: (id) => setActionsFor(id),
      closeActions: () => setActionsFor(null),
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
      series,
      isTodo,
      reminders,
      settings,
      today,
      refresh,
      saveTaskReminder,
      removeTaskReminder,
      addTask,
      patchTask,
      removeTask,
      addSpace,
      patchSpace,
      removeSpace,
      setDashboardSpaces,
      toast,
      dismissToast,
      toasts,
      celebration,
      paletteOpen,
      quickAddOpen,
      deleteWithUndo,
      actionsFor,
      taskDialog,
      spaceDialog,
      chatOpen,
      chatPrefill,
      askAgent,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
