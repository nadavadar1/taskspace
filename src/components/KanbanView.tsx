"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { useData } from "./DataProvider";
import { TaskCard } from "./TaskCard";
import { StatusIcon, cn } from "./ui";
import { STATUSES } from "@/lib/constants";
import type { Space, Status, Task } from "@/lib/types";

function SortableCard({ task, today, onOpen }: { task: Task; today: string; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} today={today} onClick={onOpen} />
    </div>
  );
}

function Column({
  status,
  tasks,
  today,
  onOpen,
  onAdd,
}: {
  status: (typeof STATUSES)[number];
  tasks: Task[];
  today: string;
  onOpen: (id: number) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status.key}` });
  return (
    <section
      className={cn(
        "flex min-h-[220px] flex-col rounded-2xl border bg-slate-100/60 p-2.5 transition",
        isOver ? "border-primary/50 bg-indigo-50/60" : "border-transparent",
      )}
    >
      <header className="mb-2.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-sm font-bold">
          <StatusIcon status={status.key} size={16} />
          <span>{status.label}</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-muted">{tasks.length}</span>
        </div>
        {status.key !== "not_done" && (
          <button
            onClick={onAdd}
            className="rounded-lg p-1 text-slate-500 transition hover:bg-white hover:text-primary"
            aria-label={`משימה חדשה ב${status.label}`}
          >
            <Plus size={16} />
          </button>
        )}
      </header>
      <div ref={setNodeRef} className="flex flex-1 flex-col gap-2">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} today={today} onOpen={() => onOpen(t.id)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 py-6 text-xs text-muted">
            {status.key === "not_done" ? "גרור לכאן משימה שלא בוצעה" : "גרור לכאן משימה"}
          </div>
        )}
      </div>
    </section>
  );
}

export function KanbanView({ space }: { space: Space }) {
  const { tasks, today, patchTask, openTask, openNewTask } = useData();
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const spaceTasks = useMemo(() => tasks.filter((t) => t.space_id === space.id), [tasks, space.id]);
  const columns = useMemo(() => {
    const by: Record<Status, Task[]> = { new: [], in_progress: [], on_hold: [], done: [], not_done: [] };
    for (const t of spaceTasks) by[t.status].push(t);
    for (const k of Object.keys(by) as Status[]) by[k].sort((a, b) => a.position - b.position || a.id - b.id);
    return by;
  }, [spaceTasks]);

  const active = activeId ? spaceTasks.find((t) => t.id === activeId) : undefined;

  function onDragStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const id = Number(active.id);
    const task = spaceTasks.find((t) => t.id === id);
    if (!task) return;

    let targetStatus: Status;
    let list: Task[];
    let insertAt: number;

    if (String(over.id).startsWith("col:")) {
      targetStatus = String(over.id).slice(4) as Status;
      list = columns[targetStatus].filter((t) => t.id !== id);
      insertAt = list.length;
    } else {
      const overTask = spaceTasks.find((t) => t.id === Number(over.id));
      if (!overTask) return;
      targetStatus = overTask.status;
      list = columns[targetStatus].filter((t) => t.id !== id);
      const overIdx = list.findIndex((t) => t.id === overTask.id);
      const translated = active.rect.current.translated;
      const below = translated ? translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2 : false;
      insertAt = overIdx + (below ? 1 : 0);
    }

    const prev = list[insertAt - 1];
    const next = list[insertAt];
    let position: number;
    if (prev && next) position = (prev.position + next.position) / 2;
    else if (prev) position = prev.position + 1;
    else if (next) position = next.position - 1;
    else position = 1;

    if (targetStatus === task.status && Math.abs(position - task.position) < 1e-9) return;
    void patchTask(id, { status: targetStatus, position });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {STATUSES.map((s) => (
          <Column
            key={s.key}
            status={s}
            tasks={columns[s.key]}
            today={today}
            onOpen={openTask}
            onAdd={() => openNewTask({ space_id: space.id, status: s.key })}
          />
        ))}
      </div>
      <DragOverlay>{active ? <TaskCard task={active} today={today} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
