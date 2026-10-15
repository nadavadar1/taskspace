"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useData } from "./DataProvider";
import { cn, StatusIcon } from "./ui";
import { PRIORITY_MAP } from "@/lib/constants";
import { HE_DAYS, HE_MONTHS, monthGrid, parts, formatLong } from "@/lib/dates";
import type { Space, Task } from "@/lib/types";

const MAX_CHIPS = 3;

function Chip({ task, onOpen, floating }: { task: Task; onOpen?: () => void; floating?: boolean }) {
  const p = PRIORITY_MAP[task.priority];
  const done = task.status === "done";
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.();
      }}
      className={cn(
        "flex cursor-pointer items-center gap-1 truncate rounded-md border-s-[3px] px-1.5 py-[3px] text-[12px] font-medium leading-tight transition",
        floating ? "shadow-lg" : "hover:brightness-95",
        done && "opacity-60",
      )}
      style={{ backgroundColor: `${p.color}1f`, borderColor: p.color, color: "#1e2433" }}
      title={task.title}
    >
      <StatusIcon status={task.status} size={11} />
      <span className={cn("truncate", done && "line-through")}>{task.title}</span>
    </div>
  );
}

function DraggableChip({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.3 : 1, touchAction: "none" }}>
      <Chip task={task} onOpen={onOpen} />
    </div>
  );
}

function DayCell({
  iso,
  inMonth,
  isToday,
  tasks,
  onOpenTask,
  onCreate,
  onMore,
}: {
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  tasks: Task[];
  onOpenTask: (id: number) => void;
  onCreate: () => void;
  onMore: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${iso}` });
  const shown = tasks.slice(0, MAX_CHIPS);
  const extra = tasks.length - shown.length;
  return (
    <div
      ref={setNodeRef}
      onClick={onCreate}
      className={cn(
        "group min-h-[104px] cursor-pointer border-b border-s border-line p-1.5 transition sm:min-h-[118px]",
        inMonth ? "bg-surface" : "bg-slate-50/70",
        isOver && "bg-indigo-50 ring-2 ring-inset ring-primary/40",
        !isOver && "hover:bg-slate-50",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold",
            isToday ? "bg-primary text-white" : inMonth ? "text-ink" : "text-slate-400",
          )}
        >
          {parts(iso).d}
        </span>
        <span className="hidden text-xs text-slate-300 group-hover:inline">＋</span>
      </div>
      <div className="flex flex-col gap-1">
        {shown.map((t) => (
          <DraggableChip key={t.id} task={t} onOpen={() => onOpenTask(t.id)} />
        ))}
        {extra > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMore();
            }}
            className="rounded-md px-1.5 py-0.5 text-start text-[11px] font-bold text-primary hover:bg-indigo-50"
          >
            +{extra} נוספות
          </button>
        )}
      </div>
    </div>
  );
}

export function CalendarView({ space }: { space: Space }) {
  const { tasks, today, patchTask, openTask, openNewTask } = useData();
  const { y: ty, m: tm } = parts(today);
  const [cursor, setCursor] = useState({ y: ty, m: tm });
  const [dayList, setDayList] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [showUndated, setShowUndated] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const spaceTasks = useMemo(() => tasks.filter((t) => t.space_id === space.id), [tasks, space.id]);
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of spaceTasks) {
      if (!t.due_date) continue;
      const arr = m.get(t.due_date) ?? [];
      arr.push(t);
      m.set(t.due_date, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.position - b.position);
    return m;
  }, [spaceTasks]);
  const undated = spaceTasks.filter((t) => !t.due_date && t.status !== "done");
  const grid = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const active = activeId ? spaceTasks.find((t) => t.id === activeId) : undefined;

  function shift(delta: number) {
    setCursor((c) => {
      const idx = c.y * 12 + (c.m - 1) + delta;
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const over = e.over ? String(e.over.id) : "";
    if (!over.startsWith("day:")) return;
    const iso = over.slice(4);
    const id = Number(e.active.id);
    const t = spaceTasks.find((x) => x.id === id);
    if (t && t.due_date !== iso) void patchTask(id, { due_date: iso });
  }

  const isCurrentMonth = cursor.y === ty && cursor.m === tm;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(Number(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">
              {HE_MONTHS[cursor.m - 1]} {cursor.y}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCursor({ y: ty, m: tm })}
              disabled={isCurrentMonth}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-40"
            >
              היום
            </button>
            <button onClick={() => shift(-1)} className="rounded-lg p-2 transition hover:bg-slate-100" aria-label="חודש קודם">
              <ChevronRight size={18} />
            </button>
            <button onClick={() => shift(1)} className="rounded-lg p-2 transition hover:bg-slate-100" aria-label="חודש הבא">
              <ChevronLeft size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-line bg-slate-50/70">
          {HE_DAYS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-bold text-muted">
              <span className="hidden sm:inline">יום </span>
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 [&>*:nth-child(7n+1)]:border-s-0">
          {grid.flat().map((iso) => (
            <DayCell
              key={iso}
              iso={iso}
              inMonth={parts(iso).m === cursor.m}
              isToday={iso === today}
              tasks={byDay.get(iso) ?? []}
              onOpenTask={openTask}
              onCreate={() => openNewTask({ space_id: space.id, due_date: iso })}
              onMore={() => setDayList(iso)}
            />
          ))}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-3 shadow-sm">
          <button
            onClick={() => setShowUndated((v) => !v)}
            className="flex w-full items-center gap-2 text-sm font-bold text-slate-600"
          >
            <ChevronDown size={16} className={cn("transition", !showUndated && "-rotate-90")} />
            ללא תאריך יעד ({undated.length})
          </button>
          {showUndated && (
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {undated.map((t) => (
                <DraggableChip key={t.id} task={t} onOpen={() => openTask(t.id)} />
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-muted">גרור משימה ליום בלוח כדי לתת לה תאריך יעד.</p>
        </div>
      )}

      {dayList && (
        <div
          className="anim-fade fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setDayList(null)}
        >
          <div className="anim-pop w-full max-w-sm rounded-2xl bg-surface p-4 shadow-2xl">
            <div className="mb-3 font-bold">{formatLong(dayList)}</div>
            <div className="flex flex-col gap-1.5">
              {(byDay.get(dayList) ?? []).map((t) => (
                <Chip
                  key={t.id}
                  task={t}
                  onOpen={() => {
                    setDayList(null);
                    openTask(t.id);
                  }}
                />
              ))}
            </div>
            <button
              onClick={() => {
                const d = dayList;
                setDayList(null);
                openNewTask({ space_id: space.id, due_date: d });
              }}
              className="mt-3 w-full rounded-xl bg-primary py-2 text-sm font-medium text-white"
            >
              משימה חדשה ליום הזה
            </button>
          </div>
        </div>
      )}

      <DragOverlay>{active ? <Chip task={active} floating /> : null}</DragOverlay>
    </DndContext>
  );
}
