"use client";

import { useMemo, useRef, useState } from "react";
import { Bell, Loader2, Trash2 } from "lucide-react";
import { useData } from "./DataProvider";
import { Modal, StatusIcon, cn } from "./ui";
import { PRIORITIES, STATUSES, isClosed } from "@/lib/constants";
import { addDays, utcToZoned, zonedToUtcISO } from "@/lib/dates";
import { REPEAT_LABELS, primaryReminder, taskDeadlineUTC } from "@/lib/reminder-utils";
import type { Priority, RepeatKind, Status } from "@/lib/types";

const FREQUENCIES: RepeatKind[] = ["none", "hourly", "daily", "weekly"];

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
  const {
    taskDialog,
    tasks,
    reminders,
    spaces,
    today,
    addTask,
    patchTask,
    removeTask,
    saveTaskReminder,
    removeTaskReminder,
    toast,
  } = useData();
  const editing = taskDialog?.mode === "edit" ? tasks.find((t) => t.id === taskDialog.id) : undefined;
  const defaults = taskDialog?.mode === "new" ? taskDialog.defaults : {};
  const existingReminder = editing ? primaryReminder(reminders, editing.id) : undefined;

  const [title, setTitle] = useState(editing?.title ?? defaults.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? defaults.priority ?? "medium");
  const [status, setStatus] = useState<Status>(editing?.status ?? defaults.status ?? "new");
  const [statusNote, setStatusNote] = useState(editing?.status_note ?? "");
  const [due, setDue] = useState<string>(editing ? (editing.due_date ?? "") : (defaults.due_date ?? ""));
  const [dueTime, setDueTime] = useState<string>(editing ? (editing.due_time ?? "") : (defaults.due_time ?? ""));
  const [spaceId, setSpaceId] = useState<number | undefined>(
    editing?.space_id ?? defaults.space_id ?? spaces[0]?.id,
  );
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // reminder: first send time defaults to one hour from now (Israel time); when editing, the next scheduled time
  const [remOn, setRemOn] = useState(!!existingReminder);
  const [remFreq, setRemFreq] = useState<RepeatKind>(existingReminder?.repeat ?? "daily");
  const [remN, setRemN] = useState(existingReminder?.repeat_n ?? 2);
  const [remStart] = useState(() =>
    utcToZoned(existingReminder ? existingReminder.remind_at : new Date(Date.now() + 3600_000).toISOString()),
  );
  const [remDate, setRemDate] = useState(remStart.date);
  const [remTime, setRemTime] = useState(remStart.time);
  // when the task was created in this dialog but the reminder failed, saving again must not create it twice
  const createdId = useRef<number | null>(null);
  const done = isClosed(status); // done or not done: no reminders any more
  const frequencies: RepeatKind[] = existingReminder?.repeat === "every_n_days" ? [...FREQUENCIES, "every_n_days"] : FREQUENCIES;

  function changeTitle(v: string) {
    setTitle(v);
    setConfirmDelete(false);
  }

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
    const noteField = status === "not_done" ? { status_note: statusNote.trim() } : {};
    const withReminder = remOn && !done;
    if (withReminder) {
      if (!remDate || !remTime) {
        toast("צריך תאריך ושעה לתזכורת");
        return;
      }
      if (remFreq === "every_n_days" && !(Number.isInteger(remN) && remN > 0)) {
        toast("צריך מספר ימים חיובי לתזכורת");
        return;
      }
      // a repeating reminder stops at the due date, so it cannot start after it
      const deadline = taskDeadlineUTC({ due_date: due || null, due_time: due && dueTime ? dueTime : null });
      if (remFreq !== "none" && deadline && new Date(zonedToUtcISO(remDate, remTime)) > new Date(deadline)) {
        toast("התזכורת החוזרת מתחילה אחרי תאריך היעד של המשימה");
        return;
      }
    }

    setBusy(true);
    let taskId = editing?.id ?? createdId.current;
    if (editing) {
      await patchTask(editing.id, {
        title: title.trim(),
        description,
        priority,
        status,
        ...noteField,
        due_date: due || null,
        due_time: due && dueTime ? dueTime : null,
        space_id: spaceId,
      });
    } else if (taskId === null) {
      const created = await addTask({
        space_id: spaceId,
        title: title.trim(),
        description,
        priority,
        status,
        ...noteField,
        due_date: due || null,
        due_time: due && dueTime ? dueTime : null,
      });
      taskId = created?.id ?? null;
      createdId.current = taskId;
    }

    // a finished task has no reminders: the server already switched them off
    if (taskId !== null && !done) {
      if (withReminder) {
        const ok = await saveTaskReminder(taskId, {
          date: remDate,
          time: remTime,
          repeat: remFreq,
          repeat_n: remFreq === "every_n_days" ? remN : null,
        });
        if (!ok) {
          setBusy(false);
          return; // keep the dialog open; the toast says what went wrong
        }
      } else if (existingReminder) {
        await removeTaskReminder(taskId);
      }
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
            onChange={(e) => changeTitle(e.target.value)}
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
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
          {status === "not_done" && (
            <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 p-3">
              <label className="mb-1.5 block text-sm font-medium text-stone-700" htmlFor="status-note">
                הערה: למה לא בוצעה?
              </label>
              <textarea
                id="status-note"
                autoFocus
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                rows={2}
                placeholder="למשל: לא רלוונטי יותר, יקר מדי, הקורס נדחה, אי אפשר לבצע כרגע..."
                className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-indigo-100"
              />
              <p className="mt-1.5 text-xs text-muted">לא חובה: אפשר להשאיר ריק ולהוסיף אחר כך. ההערה מוצגת על המשימה.</p>
            </div>
          )}
        </Field>

        <div className="grid gap-5">
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

        <Field label="תזכורת">
          <div className={cn("rounded-2xl border p-3 transition", remOn && !done ? "border-amber-200 bg-amber-50/60" : "border-line")}>
            <button
              type="button"
              role="switch"
              aria-checked={remOn && !done}
              disabled={done}
              onClick={() => setRemOn((v) => !v)}
              className="flex w-full items-center justify-between gap-3 disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Bell size={16} className={remOn && !done ? "text-amber-600" : "text-slate-400"} />
                תזכורת לטלפון
              </span>
              <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", remOn && !done ? "bg-amber-500" : "bg-slate-300")}>
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                    remOn && !done ? "start-[1.375rem]" : "start-0.5",
                  )}
                />
              </span>
            </button>

            {done && <p className="mt-2 text-xs text-muted">משימה סגורה (הושלמה או לא בוצעה) לא שולחת תזכורות.</p>}

            {remOn && !done && (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1.5 text-xs font-medium text-slate-600">תדירות</div>
                  <div className="flex flex-wrap gap-1.5">
                    {frequencies.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setRemFreq(f)}
                        className={cn(
                          "rounded-xl border px-3 py-1.5 text-sm font-medium transition",
                          remFreq === f
                            ? "border-amber-500 bg-amber-500 text-white"
                            : "border-line bg-white text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        {f === "every_n_days" ? `כל ${remN} ימים` : REPEAT_LABELS[f]}
                      </button>
                    ))}
                  </div>
                  {remFreq === "every_n_days" && (
                    <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                      כל
                      <input
                        type="number"
                        min={1}
                        value={remN}
                        onChange={(e) => setRemN(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                        className="w-20 rounded-xl border border-line px-2 py-1.5 outline-none focus:border-primary focus:ring-4 focus:ring-indigo-100"
                      />
                      ימים
                    </label>
                  )}
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-medium text-slate-600">
                    {existingReminder ? "התזכורת הבאה" : "התזכורת הראשונה"}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={remDate}
                      onChange={(e) => setRemDate(e.target.value)}
                      className="w-full rounded-xl border border-line bg-white px-3 py-2 outline-none focus:border-primary focus:ring-4 focus:ring-indigo-100"
                      aria-label="תאריך התזכורת"
                    />
                    <input
                      type="time"
                      value={remTime}
                      onChange={(e) => setRemTime(e.target.value)}
                      className="w-28 shrink-0 rounded-xl border border-line bg-white px-2 py-2 outline-none focus:border-primary focus:ring-4 focus:ring-indigo-100"
                      aria-label="שעת התזכורת"
                    />
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-muted">
                  {remFreq === "none"
                    ? "ההתראה תישלח פעם אחת."
                    : due
                      ? "התזכורת החוזרת נעצרת בתאריך היעד, או כשהמשימה מסומנת כהושלמה."
                      : "התזכורת החוזרת נעצרת כשהמשימה מסומנת כהושלמה."}{" "}
                  ההתראות מגיעות לטלפון אחרי שמפעילים אותן בפעמון שבראש המסך.
                </p>
              </div>
            )}
          </div>
        </Field>

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
