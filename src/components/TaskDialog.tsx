"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useData } from "./DataProvider";
import { Modal, StatusIcon, cn } from "./ui";
import { PRIORITIES, STATUSES } from "@/lib/constants";
import { addDays } from "@/lib/dates";
import type { Priority, Status } from "@/lib/types";

export function TaskDialog() {
  const { taskDialog, closeTaskDialog, tasks } = useData();
  if (!taskDialog) return null;
  const existing = taskDialog.mode === "edit" ? tasks.find((t) => t.id === taskDialog.id) : undefined;
  if (taskDialog.mode === "edit" && !existing) return null;
  // key forces a fresh form state per task / per "new" open
  const key = taskDialog.mode === "edit" ? `e${taskDialog.id}` : `n${JSON.stringify(taskDialog.defaults)}`;
  return <TaskForm key={key} onClose={closeTaskDialog} />;
}

function TaskForm({ onClose }: { onClose: () => void }) {
  const { taskDialog, tasks, spaces, today, addTask, patchTask, removeTask, toast } = useData();
  const editing = taskDialog?.mode === "edit" ? tasks.find((t) => t.id === taskDialog.id) : undefined;
  const defaults = taskDialog?.mode === "new" ? taskDialog.defaults : {};

  const [title, setTitle] = useState(editing?.title ?? defaults.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? defaults.priority ?? "medium");
  const [status, setStatus] = useState<Status>(editing?.status ?? defaults.status ?? "new");
  const [due, setDue] = useState<string>(editing ? (editing.due_date ?? "") : (defaults.due_date ?? ""));
  const [dueTime, setDueTime] = useState<string>(editing ? (editing.due_time ?? "") : (defaults.due_time ?? ""));
  const [spaceId, setSpaceId] = useState<number | undefined>(
    editing?.space_id ?? defaults.space_id ?? spaces[0]?.id,
  );
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
  }, [title]);

  function changeDue(v: string) {
    setDue(v);
    if (!v) setDueTime("");
  }

  const quickDates = useMemo(
    () => [
      { label: "היום", value: today },
      { label: "מחר", value: addDays(today, 1) },
      { label: "בעוד שבוע", value: addDays(today, 7) },
    ],
    [today],
  );

  async function save() {
    if (!title.trim()) {
      toast("צריך לתת למשימה כותרת");
      return;
    }
    if (!spaceId) {
      toast("אין מרחב לשמירה. צור מרחב קודם.");
      return;
    }
    setBusy(true);
    if (editing) {
      await patchTask(editing.id, {
        title: title.trim(),
        description,
        priority,
        status,
        due_date: due || null,
        due_time: due && dueTime ? dueTime : null,
        space_id: spaceId,
      });
    } else {
      await addTask({
        space_id: spaceId,
        title: title.trim(),
        description,
        priority,
        status,
        due_date: due || null,
        due_time: due && dueTime ? dueTime : null,
      });
    }
    setBusy(false);
    onClose();
  }

  async function remove() {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await removeTask(editing.id);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "עריכת משימה" : "משימה חדשה"}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>
            {editing && (
              <button
                onClick={remove}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                  confirmDelete ? "bg-red-600 text-white" : "text-red-600 hover:bg-red-50",
                )}
              >
                <Trash2 size={15} />
                {confirmDelete ? "לחץ שוב למחיקה" : "מחיקה"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              ביטול
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-600 disabled:opacity-60"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {editing ? "שמירה" : "יצירת משימה"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <input
            autoFocus={!editing}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="מה צריך לעשות?"
            className="w-full rounded-xl border border-line px-3.5 py-3 text-base font-medium outline-none transition focus:border-primary focus:ring-4 focus:ring-indigo-100"
          />
        </div>

        <Field label="עדיפות">
          <div className="grid grid-cols-4 gap-2">
            {PRIORITIES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPriority(p.key)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-medium transition",
                  priority === p.key ? "border-transparent text-white" : "border-line bg-white text-slate-600 hover:bg-slate-50",
                )}
                style={priority === p.key ? { backgroundColor: p.color } : undefined}
              >
                {priority !== p.key && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />}
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="סטטוס">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStatus(s.key)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-medium transition",
                  status === s.key ? "bg-white" : "border-line bg-white text-slate-600 hover:bg-slate-50",
                )}
                style={
                  status === s.key
                    ? { borderColor: s.color, color: s.color, backgroundColor: `${s.color}14` }
                    : undefined
                }
              >
                <StatusIcon status={s.key} size={15} />
                {s.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="תאריך יעד">
            <div className="flex gap-2">
              <input
                type="date"
                value={due}
                onChange={(e) => changeDue(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2 outline-none focus:border-primary focus:ring-4 focus:ring-indigo-100"
              />
              <input
                type="time"
                value={dueTime}
                disabled={!due}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-28 shrink-0 rounded-xl border border-line px-2 py-2 outline-none focus:border-primary focus:ring-4 focus:ring-indigo-100 disabled:opacity-40"
                aria-label="שעה"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quickDates.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => changeDue(q.value)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                    due === q.value ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {q.label}
                </button>
              ))}
              {due && (
                <button
                  type="button"
                  onClick={() => changeDue("")}
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  ללא תאריך
                </button>
              )}
            </div>
          </Field>

          <Field label="מרחב">
            <div className="flex flex-wrap gap-1.5">
              {spaces.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSpaceId(s.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition",
                    spaceId === s.id ? "text-white" : "border-line bg-white text-slate-600 hover:bg-slate-50",
                  )}
                  style={spaceId === s.id ? { backgroundColor: s.color, borderColor: s.color } : undefined}
                >
                  {spaceId !== s.id && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />}
                  {s.name}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="פרטים נוספים">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="הערות, קישורים, מה חשוב לזכור..."
            className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-indigo-100"
          />
        </Field>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-slate-700">{label}</div>
      {children}
    </div>
  );
}
