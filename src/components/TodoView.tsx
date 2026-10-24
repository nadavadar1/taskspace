"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { useData } from "./DataProvider";
import { DueLabel } from "./TaskCard";
import { StatusIcon, cn } from "./ui";
import { PRIORITIES, PRIORITY_MAP, STATUS_MAP, isClosed } from "@/lib/constants";
import type { Priority, Space, Task } from "@/lib/types";

function byDueThenPosition(a: Task, b: Task) {
  if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
  if (a.due_date && !b.due_date) return -1;
  if (!a.due_date && b.due_date) return 1;
  return a.position - b.position || a.id - b.id;
}

function Check({ done, color, onToggle }: { done: boolean; color: string; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition hover:scale-110"
      style={{ borderColor: done ? STATUS_MAP.done.color : color, backgroundColor: done ? STATUS_MAP.done.color : "transparent" }}
      aria-label={done ? "סימון כלא הושלמה" : "סימון כהושלמה"}
    >
      {done && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function Row({ task }: { task: Task }) {
  const { today, patchTask, openTask } = useData();
  const done = task.status === "done";
  const notDone = task.status === "not_done";
  const p = PRIORITY_MAP[task.priority];
  return (
    <li
      onClick={() => openTask(task.id)}
      className="group flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition hover:border-line hover:bg-slate-50"
    >
      {notDone ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            void patchTask(task.id, { status: "new" });
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition hover:scale-110"
          title="החזרה למשימות פתוחות"
          aria-label="החזרה למשימות פתוחות"
        >
          <StatusIcon status="not_done" size={22} />
        </button>
      ) : (
        <Check
          done={done}
          color={p.color}
          onToggle={() => patchTask(task.id, { status: done ? "new" : "done" })}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[15px]", done && "text-muted line-through", notDone && "text-muted")}>
          {task.title}
        </span>
        {notDone && task.status_note && (
          <span className="mt-0.5 block text-xs leading-snug text-stone-500">
            <span className="font-bold">למה לא: </span>
            {task.status_note}
          </span>
        )}
      </span>
      {!isClosed(task.status) && task.status !== "new" && (
        <span className="hidden text-xs font-medium sm:inline" style={{ color: STATUS_MAP[task.status].color }}>
          {STATUS_MAP[task.status].label}
        </span>
      )}
      <DueLabel task={task} today={today} />
    </li>
  );
}

export function TodoView({ space }: { space: Space }) {
  const { tasks, openNewTask, addTask } = useData();
  const [quick, setQuick] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [showNotDone, setShowNotDone] = useState(true);

  const spaceTasks = useMemo(() => tasks.filter((t) => t.space_id === space.id), [tasks, space.id]);
  const open = spaceTasks.filter((t) => !isClosed(t.status));
  const done = spaceTasks.filter((t) => t.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  const notDone = spaceTasks.filter((t) => t.status === "not_done").sort(byDueThenPosition);

  const groups = PRIORITIES.map((p) => ({
    ...p,
    tasks: open.filter((t) => t.priority === p.key).sort(byDueThenPosition),
  })).filter((g) => g.tasks.length);

  async function addQuick() {
    const title = quick.trim();
    if (!title) return;
    setQuick("");
    await addTask({ space_id: space.id, title, priority: "medium" as Priority });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm focus-within:border-primary focus-within:ring-4 focus-within:ring-indigo-100">
        <Plus size={18} className="ms-2 text-muted" />
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addQuick()}
          placeholder="הוסף משימה מהירה והקש Enter..."
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none"
        />
        <button
          onClick={() => (quick.trim() ? addQuick() : openNewTask({ space_id: space.id }))}
          className="rounded-xl bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
        >
          {quick.trim() ? "הוספה" : "עוד אפשרויות"}
        </button>
      </div>

      {groups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 py-14 text-center text-muted">
          {done.length || notDone.length ? "אין משימות פתוחות. כל הכבוד! 🎉" : "אין משימות עדיין. הוסף את הראשונה למעלה."}
        </div>
      )}

      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.key}>
            <h3 className="mb-1 flex items-center gap-2 px-3 text-sm font-bold" style={{ color: g.color }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} />
              {g.label}
              <span className="text-xs font-medium text-muted">{g.tasks.length}</span>
            </h3>
            <ul className="rounded-2xl border border-line bg-surface p-1 shadow-sm">
              {g.tasks.map((t) => (
                <Row key={t.id} task={t} />
              ))}
            </ul>
          </section>
        ))}

        {notDone.length > 0 && (
          <section>
            <button
              onClick={() => setShowNotDone((v) => !v)}
              className="mb-1 flex items-center gap-2 px-3 text-sm font-bold text-stone-500"
            >
              <ChevronDown size={16} className={cn("transition", !showNotDone && "-rotate-90")} />
              לא בוצעו
              <span className="text-xs font-medium">{notDone.length}</span>
            </button>
            {showNotDone && (
              <ul className="anim-fade rounded-2xl border border-line bg-surface p-1 shadow-sm">
                {notDone.map((t) => (
                  <Row key={t.id} task={t} />
                ))}
              </ul>
            )}
          </section>
        )}

        {done.length > 0 && (
          <section>
            <button
              onClick={() => setShowDone((v) => !v)}
              className="mb-1 flex items-center gap-2 px-3 text-sm font-bold text-muted"
            >
              <ChevronDown size={16} className={cn("transition", !showDone && "-rotate-90")} />
              הושלמו
              <span className="text-xs font-medium">{done.length}</span>
            </button>
            {showDone && (
              <ul className="anim-fade rounded-2xl border border-line bg-surface p-1 shadow-sm">
                {done.map((t) => (
                  <Row key={t.id} task={t} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
