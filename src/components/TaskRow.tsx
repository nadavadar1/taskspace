"use client";

import { X } from "lucide-react";
import { useData } from "./DataProvider";
import { Swipeable } from "./Swipe";
import { CoveredPill, HabitDots, useCovered } from "./Recurring";
import { relativeLabel } from "@/lib/dates";
import { DueLabel, TaskExtras } from "./TaskCard";
import { PriorityBadge, StatusIcon, cn } from "./ui";
import { PRIORITY_MAP, STATUS_MAP, isClosed } from "@/lib/constants";
import type { Space, Task } from "@/lib/types";

/** A round tick: one tap marks the task done (and a second tap re-opens it). Big enough for a thumb. */
export function DoneCircle({ task, size = 24 }: { task: Task; size?: number }) {
  const { patchTask, toast, today } = useData();
  const covered = useCovered(task);
  const done = task.status === "done";
  const color = PRIORITY_MAP[task.priority].color;
  if (covered) {
    // a repeating task already done for this round: a soft green tick; tapping it doesn't silently do the next round
    return (
      <button
        type="button"
        data-no-swipe
        onClick={(e) => {
          e.stopPropagation();
          toast(`כבר בוצע לתקופה הזו. הפעם הבאה: ${task.due_date ? relativeLabel(task.due_date, today) : "בקרוב"}`, {
            action: { label: "לסמן שוב", run: () => void patchTask(task.id, { status: "done" }) },
          });
        }}
        className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
        aria-label={`"${task.title}" כבר בוצע לתקופה הזו`}
        data-covered
      >
        <span
          className="flex items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-50 text-emerald-600"
          style={{ width: size, height: size }}
        >
          <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    );
  }
  if (task.status === "not_done") {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center" aria-hidden>
        <StatusIcon status="not_done" size={size - 2} />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void patchTask(task.id, { status: done ? "new" : "done" });
      }}
      data-no-swipe
      className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90"
      aria-label={done ? "החזרה למשימות פתוחות" : `סימון "${task.title}" כהושלמה`}
    >
      <span
        className="flex items-center justify-center rounded-full border-2 transition"
        style={{
          width: size,
          height: size,
          borderColor: done ? STATUS_MAP.done.color : color,
          backgroundColor: done ? STATUS_MAP.done.color : "transparent",
        }}
      >
        {done ? (
          <svg className="anim-check" width={size * 0.5} height={size * 0.5} viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : task.status === "in_progress" ? (
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_MAP.in_progress.color }} />
        ) : null}
      </span>
    </button>
  );
}

/**
 * A compact, two-line row: a tick on the side, the title (up to two lines), then due date / priority / space.
 * Meant for long lists, so nothing has to be hidden behind a scroll box.
 */
export function TaskRow({
  task,
  space,
  showSpace,
  showPriority,
}: {
  task: Task;
  space?: Space;
  showSpace?: boolean;
  showPriority?: boolean;
}) {
  const { today, openTask, patchTask, deleteWithUndo, openActions } = useData();
  const p = PRIORITY_MAP[task.priority];
  const closed = isClosed(task.status);
  const covered = useCovered(task);
  return (
    <Swipeable
      done={task.status === "done"}
      onDone={task.status === "not_done" ? undefined : () => patchTask(task.id, { status: task.status === "done" ? "new" : "done" })}
      onDelete={() => deleteWithUndo(task.id)}
      onLongPress={() => openActions(task.id)}
    >
    <div
      role="button"
      tabIndex={0}
      onClick={() => openTask(task.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openTask(task.id))}
      data-task-row
      className="group relative flex w-full cursor-pointer items-center gap-3 rounded-xl py-2.5 pe-3 ps-4 text-start transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none active:bg-slate-100"
    >
      <span
        className="absolute inset-y-2 start-0 w-1 rounded-full"
        style={{ backgroundColor: covered ? "#10b981" : p.color }}
        aria-hidden
      />
      <DoneCircle task={task} size={22} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "line-clamp-2 block text-[15px] font-medium leading-snug",
            closed && "text-muted line-through",
            covered && "text-muted",
          )}
        >
          {task.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {covered ? (
            <CoveredPill task={task} />
          ) : task.due_date ? (
            <DueLabel task={task} today={today} />
          ) : (
            <span className="text-xs text-slate-400">ללא תאריך</span>
          )}
          <HabitDots task={task} />
          {showPriority && <PriorityBadge priority={task.priority} small />}
          <TaskExtras task={task} />
          {showSpace && space && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: space.color }} />
              {space.name}
            </span>
          )}
        </span>
      </span>
      <DeleteX taskId={task.id} title={task.title} />
    </div>
    </Swipeable>
  );
}

/** Deletes straight away (with "ביטול" in the toast for a few seconds). */
export function DeleteX({ taskId, title }: { taskId: number; title: string }) {
  const { deleteWithUndo } = useData();
  return (
    <button
      type="button"
      data-no-swipe
      onClick={(e) => {
        e.stopPropagation();
        deleteWithUndo(taskId);
      }}
      className="-me-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:bg-red-50 hover:text-red-600 active:bg-red-50 active:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      aria-label={`מחיקת "${title}"`}
      title="מחיקה"
    >
      <X size={17} />
    </button>
  );
}
