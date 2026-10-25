"use client";

import { useData } from "./DataProvider";
import { DueLabel } from "./TaskCard";
import { PriorityBadge, StatusIcon, cn } from "./ui";
import { PRIORITY_MAP } from "@/lib/constants";
import type { Space, Task } from "@/lib/types";

/**
 * A compact, two-line row for an open task: the priority colour on the edge, the title (up to two lines),
 * then due date / priority / space. Meant for long lists, so nothing has to be hidden behind a scroll box.
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
  return (
    <button
      type="button"
      onClick={() => openTask(task.id)}
      className="group relative flex w-full cursor-pointer items-start gap-2.5 rounded-xl py-2 pe-3 ps-4 text-start transition hover:bg-slate-50"
    >
      <span className="absolute inset-y-1.5 start-0 w-1 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
      <span className="mt-0.5 shrink-0">
        <StatusIcon status={task.status} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[14px] font-medium leading-snug">{task.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {task.due_date ? (
            <DueLabel task={task} today={today} />
          ) : (
            <span className="text-xs text-slate-400">ללא תאריך</span>
          )}
          {showPriority && <PriorityBadge priority={task.priority} small />}
          {showSpace && space && (
            <span className={cn("inline-flex items-center gap-1 text-xs text-muted")}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: space.color }} />
              {space.name}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
