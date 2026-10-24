"use client";

import { Flag } from "lucide-react";
import { PRIORITY_MAP, isClosed } from "@/lib/constants";
import { relativeLabel } from "@/lib/dates";
import type { Space, Task } from "@/lib/types";
import { cn, PriorityBadge, StatusIcon } from "./ui";

export function DueLabel({ task, today, className }: { task: Task; today: string; className?: string }) {
  if (!task.due_date) return null;
  const overdue = !isClosed(task.status) && task.due_date < today;
  const isToday = task.due_date === today;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        overdue ? "text-red-600" : isToday ? "text-amber-600" : "text-muted",
        className,
      )}
    >
      {relativeLabel(task.due_date, today)}
      {task.due_time && <span className="font-normal opacity-80">, {task.due_time}</span>}
    </span>
  );
}

/** Compact task card used by the kanban board and dashboard lists. */
export function TaskCard({
  task,
  today,
  space,
  onClick,
  dragging,
}: {
  task: Task;
  today: string;
  space?: Space;
  onClick?: () => void;
  dragging?: boolean;
}) {
  const p = PRIORITY_MAP[task.priority];
  const done = task.status === "done";
  const notDone = task.status === "not_done";
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer rounded-xl border border-line bg-surface p-3 shadow-sm transition",
        "hover:border-slate-300 hover:shadow-md",
        dragging && "rotate-1 shadow-xl ring-2 ring-primary/30",
      )}
    >
      <span
        className="absolute inset-y-2 end-0 w-1 rounded-full"
        style={{ backgroundColor: p.color }}
        aria-hidden
      />
      <div className="flex items-start gap-2 pe-2">
        <span className="mt-0.5 shrink-0">
          <StatusIcon status={task.status} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("text-sm font-medium leading-snug", done && "text-muted line-through", notDone && "text-muted")}>
            {task.title}
          </div>
          {notDone && task.status_note && (
            <div className="mt-1.5 rounded-lg bg-stone-100 px-2 py-1 text-xs leading-snug text-stone-600">
              <span className="font-bold">למה לא: </span>
              {task.status_note}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <PriorityBadge priority={task.priority} small />
            <DueLabel task={task} today={today} />
            {space && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: space.color }} />
                {space.name}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { Flag };
