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
import { Bell, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useData } from "./DataProvider";
import { cn, StatusIcon } from "./ui";
import { PRIORITY_MAP, isClosed } from "@/lib/constants";
import { HE_DAYS, HE_MONTHS, monthGrid, parts, formatLong } from "@/lib/dates";
import { reminderFiresOn } from "@/lib/reminder-utils";
import type { Reminder, Space, Task } from "@/lib/types";

const MAX_CHIPS = 3;

function Chip({
  task,
  spaceColor,
  hasReminder,
  onOpen,
  floating,
}: {
  task: Task;
  /** Only passed when the calendar shows more than one space, to tell them apart. */
  spaceColor?: string;
  hasReminder?: boolean;
  onOpen?: () => void;
  floating?: boolean;
}) {
  const p = PRIORITY_MAP[task.priority];
  const done = task.status === "done";
  const notDone = task.status === "not_done";
  // with several spaces the chip wears its space's colour; the priority colour moves to a small dot at the end
  const tint = spaceColor ?? p.color;
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.();
      }}
      className={cn(
        "flex cursor-pointer items-center gap-1 truncate rounded-md border-s-[3px] px-1.5 py-[3px] text-[12px] font-medium leading-tight transition",
        floating ? "shadow-lg" : "hover:brightness-95",
        (done || notDone) && "opacity-60",
      )}
      style={{
        backgroundColor: `${tint}${spaceColor ? "33" : "1f"}`,
        borderColor: tint,
        color: "#1e2433",
      }}
      title={notDone && task.status_note ? `${task.title} — לא בוצעה: ${task.status_note}` : task.title}
    >
      <StatusIcon status={task.status} size={11} />
      {task.due_time && <span className="shrink-0 font-semibold opacity-80">{task.due_time}</span>}
      <span className={cn("truncate", done && "line-through")}>{task.title}</span>
      {hasReminder && <Bell size={11} className="shrink-0 text-amber-600" aria-label="יש תזכורת" />}
      {spaceColor && (
        <span
          className="ms-auto h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: p.color }}
          title={`עדיפות: ${p.label}`}
          aria-label={`עדיפות ${p.label}`}
        />
      )}
    </div>
  );
}

function DraggableChip({
  task,
  spaceColor,
  hasReminder,
  onOpen,
}: {
  task: Task;
  spaceColor?: string;
  hasReminder?: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.3 : 1, touchAction: "none" }}>
      <Chip task={task} spaceColor={spaceColor} hasReminder={hasReminder} onOpen={onOpen} />
    </div>
  );
}

function DayCell({
  iso,
  inMonth,
  isToday,
  tasks,
  colorOf,
  bellOf,
  onOpenTask,
  onCreate,
  onMore,
}: {
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  tasks: Task[];
  colorOf: (task: Task) => string | undefined;
  bellOf: (task: Task, day: string) => boolean;
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
          <DraggableChip
            key={t.id}
            task={t}
            spaceColor={colorOf(t)}
            hasReminder={bellOf(t, iso)}
            onOpen={() => onOpenTask(t.id)}
          />
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

/**
 * Month calendar over the due dates of one or more spaces.
 * With a single space it behaves exactly like the space's own calendar view; with several
 * (the dashboard) every task gets a dot in its space's colour.
 */
export function CalendarView({ spaces }: { spaces: Space[] }) {
  const { tasks, reminders, today, patchTask, openTask, openNewTask } = useData();
  const { y: ty, m: tm } = parts(today);
  const [cursor, setCursor] = useState({ y: ty, m: tm });
  const [dayList, setDayList] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [showUndated, setShowUndated] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const multi = spaces.length > 1;
  const colorBySpace = useMemo(() => new Map(spaces.map((s) => [s.id, s.color])), [spaces]);
  const colorOf = (t: Task) => (multi ? colorBySpace.get(t.space_id) : undefined);

  const scopedTasks = useMemo(() => tasks.filter((t) => colorBySpace.has(t.space_id)), [tasks, colorBySpace]);
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of scopedTasks) {
      if (!t.due_date) continue;
      const arr = m.get(t.due_date) ?? [];
      arr.push(t);
      m.set(t.due_date, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.position - b.position);
    return m;
  }, [scopedTasks]);

  const remindersByTask = useMemo(() => {
    const m = new Map<number, Reminder[]>();
    for (const r of reminders) {
      if (r.task_id === null || !r.enabled) continue;
      const arr = m.get(r.task_id) ?? [];
      arr.push(r);
      m.set(r.task_id, arr);
    }
    return m;
  }, [reminders]);
  const bellOf = (t: Task, day: string) =>
    !isClosed(t.status) && (remindersByTask.get(t.id) ?? []).some((r) => reminderFiresOn(r, day, t));

  const undated = scopedTasks.filter((t) => !t.due_date && !isClosed(t.status));
  const grid = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const active = activeId ? scopedTasks.find((t) => t.id === activeId) : undefined;

  /** A single space is passed on to the new-task dialog; with several, the dialog asks. */
  const newTaskSpace = spaces.length === 1 ? { space_id: spaces[0].id } : {};

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
    const t = scopedTasks.find((x) => x.id === id);
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
              colorOf={colorOf}
              bellOf={bellOf}
              onOpenTask={openTask}
              onCreate={() => openNewTask({ ...newTaskSpace, due_date: iso })}
              onMore={() => setDayList(iso)}
            />
          ))}
        </div>
      </div>

      {multi && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-muted">
          {spaces.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <Bell size={11} className="text-amber-600" />
            יש תזכורת
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            הנקודה בקצה = עדיפות
          </span>
        </div>
      )}

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
                <DraggableChip key={t.id} task={t} spaceColor={colorOf(t)} onOpen={() => openTask(t.id)} />
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
                  spaceColor={colorOf(t)}
                  hasReminder={bellOf(t, dayList)}
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
                openNewTask({ ...newTaskSpace, due_date: d });
              }}
              className="mt-3 w-full rounded-xl bg-primary py-2 text-sm font-medium text-white"
            >
              משימה חדשה ליום הזה
            </button>
          </div>
        </div>
      )}

      <DragOverlay>{active ? <Chip task={active} spaceColor={colorOf(active)} floating /> : null}</DragOverlay>
    </DndContext>
  );
}
