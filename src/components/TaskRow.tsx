"use client";

import { useData } from "./DataProvider";
import { DueLabel, TaskExtras } from "./TaskCard";
import { PriorityBadge, StatusIcon, cn } from "./ui";
import { PRIORITY_MAP, STATUS_MAP, isClosed } from "@/lib/constants";
import type { Space, Task } from "@/lib/types";

/** A round tick: one tap marks the task done (and a second tap re-opens it). Big enough for a thumb. */
export function DoneCircle({ task, size = 24 }: { task: Task; size?: number }) {
  const { patchTask } = useData();
  const done = task.status === "done";
  const color = PRIORITY_MAP[task.priority].color;
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
  const { today, openTask } = useData();
  const p = PRIORITY_MAP[task.priority];
  const closed = isClosed(task.status);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openTask(task.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openTask(task.id))}
      data-task-row
      className="group relative flex w-full cursor-pointer items-center gap-3 rounded-xl py-2.5 pe-3 ps-4 text-start transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none active:bg-slate-100"
    >
      <span className="absolute inset-y-2 start-0 w-1 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
      <DoneCircle task={task} size={22} />
      <span className="min-w-0 flex-1">
        <span className={cn("line-clamp-2 block text-[15px] font-medium leading-snug", closed && "text-muted line-through")}>
          {task.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {task.due_date ? (
            <DueLabel task={task} today={today} />
          ) : (
            <span className="text-xs text-slate-400">ללא תאריך</span>
          )}
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
    </div>
  );
}
