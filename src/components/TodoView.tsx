"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useData } from "./DataProvider";
import { DueLabel, TaskExtras } from "./TaskCard";
import { QuickAdd } from "./QuickAdd";
import { Swipeable } from "./Swipe";
import { DeleteX } from "./TaskRow";
import { GestureTip } from "./GestureTip";
import { DoneCircle } from "./TaskRow";
import { CoveredPill, HabitDots, useCovered } from "./Recurring";
import { seriesKey } from "@/lib/recurrence";
import { StatusIcon, cn } from "./ui";
import { PRIORITIES, PRIORITY_MAP, STATUS_MAP, isClosed } from "@/lib/constants";
import type { Space, Task } from "@/lib/types";

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
      data-no-swipe
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition hover:scale-110 active:scale-90"
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

function Row({ task, times }: { task: Task; times?: number }) {
  const { today, patchTask, openTask, deleteWithUndo, openActions } = useData();
  const done = task.status === "done";
  const notDone = task.status === "not_done";
  const covered = useCovered(task);
  const p = PRIORITY_MAP[task.priority];
  return (
    <li>
    <Swipeable
      done={done}
      onDone={notDone ? undefined : () => patchTask(task.id, { status: done ? "new" : "done" })}
      onDelete={() => deleteWithUndo(task.id)}
      onLongPress={() => openActions(task.id)}
    >
    <div
      onClick={() => openTask(task.id)}
      data-task-row
      className="group flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-3 transition hover:border-line hover:bg-slate-50 active:bg-slate-100 sm:py-2.5"
    >
      {covered ? (
        <DoneCircle task={task} size={24} />
      ) : notDone ? (
        <button
          data-no-swipe
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
        <span className={cn("line-clamp-2 block text-[15px] leading-snug sm:truncate", done && "text-muted line-through", (notDone || covered) && "text-muted")}>
          {task.title}
          {times && times > 1 && <span className="ms-1.5 text-xs font-bold text-emerald-600">×{times}</span>}
        </span>
        {(covered || (task.recurrence !== "none" && !done)) && (
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <CoveredPill task={task} />
            <HabitDots task={task} />
          </span>
        )}
        {notDone && (
          <span className="mt-0.5 block text-xs leading-snug text-stone-500">
            {task.status_note ? (
              <>
                <span className="font-bold">למה לא: </span>
                {task.status_note}
              </>
            ) : (
              <span className="text-stone-400">אין הערה. לחץ כדי להוסיף למה.</span>
            )}
          </span>
        )}
      </span>
      <span className="hidden items-center gap-2 sm:flex">
        <TaskExtras task={task} />
      </span>
      {!isClosed(task.status) && task.status !== "new" && (
        <span className="hidden text-xs font-medium sm:inline" style={{ color: STATUS_MAP[task.status].color }}>
          {STATUS_MAP[task.status].label}
        </span>
      )}
      {!covered && <DueLabel task={task} today={today} />}
      <DeleteX taskId={task.id} title={task.title} />
    </div>
    </Swipeable>
    </li>
  );
}

export function TodoView({ space }: { space: Space }) {
  const { tasks, series } = useData();
  const [showDone, setShowDone] = useState(false);
  const [showNotDone, setShowNotDone] = useState(true);

  const spaceTasks = useMemo(() => tasks.filter((t) => t.space_id === space.id), [tasks, space.id]);
  const allOpen = spaceTasks.filter((t) => !isClosed(t.status));
  // repeating tasks already done for this round get their own green section
  const coveredList = allOpen.filter((t) => series.get(t.id)?.covered).sort(byDueThenPosition);
  const open = allOpen.filter((t) => !series.get(t.id)?.covered);
  const doneAll = spaceTasks.filter((t) => t.status === "done").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  // a repeating task shows once in "הושלמו" (its latest copy), with how many times it was done
  const doneCount = new Map<string, number>();
  for (const t of doneAll) if (t.recurrence !== "none") doneCount.set(seriesKey(t), (doneCount.get(seriesKey(t)) ?? 0) + 1);
  const seen = new Set<string>();
  const done = doneAll.filter((t) => {
    if (t.recurrence === "none") return true;
    const k = seriesKey(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const notDone = spaceTasks.filter((t) => t.status === "not_done").sort(byDueThenPosition);

  const groups = PRIORITIES.map((p) => ({
    ...p,
    tasks: open.filter((t) => t.priority === p.key).sort(byDueThenPosition),
  })).filter((g) => g.tasks.length);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <QuickAdd spaceId={space.id} />
      </div>
      <GestureTip />

      {groups.length === 0 && coveredList.length === 0 && (
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
            <ul className="rounded-2xl border border-line bg-surface p-1 shadow-soft">
              {g.tasks.map((t) => (
                <Row key={t.id} task={t} />
              ))}
            </ul>
          </section>
        ))}

        {coveredList.length > 0 && (
          <section>
            <h3 className="mb-1 flex items-center gap-2 px-3 text-sm font-bold text-emerald-600">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">✓</span>
              בוצעו לתקופה הזו
              <span className="text-xs font-medium text-muted">{coveredList.length}</span>
            </h3>
            <ul className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-1 shadow-soft">
              {coveredList.map((t) => (
                <Row key={t.id} task={t} />
              ))}
            </ul>
          </section>
        )}

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
              <ul className="anim-fade rounded-2xl border border-line bg-surface p-1 shadow-soft">
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
              <ul className="anim-fade rounded-2xl border border-line bg-surface p-1 shadow-soft">
                {done.map((t) => (
                  <Row key={t.id} task={t} times={t.recurrence !== "none" ? doneCount.get(seriesKey(t)) : undefined} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
