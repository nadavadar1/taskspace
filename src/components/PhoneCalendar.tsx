"use client";

import { useMemo, useRef, useState } from "react";
import { Bell, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useData } from "./DataProvider";
import { TaskRow } from "./TaskRow";
import { cn } from "./ui";
import { PRIORITY_MAP, isClosed } from "@/lib/constants";
import { HE_DAYS_SHORT, HE_MONTHS, formatLong, monthGrid, parts, relativeLabel } from "@/lib/dates";
import { reminderFiresOn } from "@/lib/reminder-utils";
import type { Space, Task } from "@/lib/types";

/**
 * The calendar on a phone: a small month where each day shows coloured dots (one per task),
 * and the tasks of the tapped day listed underneath in full. Swipe sideways to change month.
 */
export function PhoneCalendar({ spaces }: { spaces: Space[] }) {
  const { tasks, reminders, today, openNewTask } = useData();
  const { y: ty, m: tm } = parts(today);
  const [cursor, setCursor] = useState({ y: ty, m: tm });
  const [selected, setSelected] = useState(today);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const multi = spaces.length > 1;
  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const scoped = useMemo(() => tasks.filter((t) => spaceById.has(t.space_id)), [tasks, spaceById]);
  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of scoped) {
      if (!t.due_date) continue;
      const arr = m.get(t.due_date) ?? [];
      arr.push(t);
      m.set(t.due_date, arr);
    }
    for (const arr of m.values())
      arr.sort(
        (a, b) =>
          Number(isClosed(a.status)) - Number(isClosed(b.status)) ||
          (a.due_time ?? "99").localeCompare(b.due_time ?? "99") ||
          PRIORITY_MAP[a.priority].rank - PRIORITY_MAP[b.priority].rank,
      );
    return m;
  }, [scoped]);

  const grid = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  // the sixth row only when the month needs it
  const weeks = grid[5].some((d) => parts(d).m === cursor.m) ? grid : grid.slice(0, 5);
  const dayTasks = byDay.get(selected) ?? [];
  const undated = scoped.filter((t) => !t.due_date && !isClosed(t.status));
  const hasBell = (day: string) =>
    (byDay.get(day) ?? []).some(
      (t) => !isClosed(t.status) && reminders.some((r) => r.task_id === t.id && r.enabled && reminderFiresOn(r, day, t)),
    );

  function shift(delta: number) {
    setCursor((c) => {
      const idx = c.y * 12 + (c.m - 1) + delta;
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
    });
  }
  const dotColor = (t: Task) => (multi ? (spaceById.get(t.space_id)?.color ?? "#94a3b8") : PRIORITY_MAP[t.priority].color);

  return (
    <div>
      <div
        className="overflow-hidden rounded-3xl border border-line bg-surface shadow-soft"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const s = touch.current;
          touch.current = null;
          if (!s) return;
          const dx = e.changedTouches[0].clientX - s.x;
          const dy = e.changedTouches[0].clientY - s.y;
          // right-to-left page: swiping toward the right goes forward in time
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx > 0 ? 1 : -1);
        }}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <h2 className="text-lg font-bold">
            {HE_MONTHS[cursor.m - 1]} {cursor.y}
          </h2>
          <div className="flex items-center gap-1">
            {(cursor.y !== ty || cursor.m !== tm || selected !== today) && (
              <button
                onClick={() => {
                  setCursor({ y: ty, m: tm });
                  setSelected(today);
                }}
                className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary"
              >
                היום
              </button>
            )}
            <button onClick={() => shift(-1)} className="rounded-full p-2.5 active:bg-slate-100" aria-label="חודש קודם">
              <ChevronRight size={20} />
            </button>
            <button onClick={() => shift(1)} className="rounded-full p-2.5 active:bg-slate-100" aria-label="חודש הבא">
              <ChevronLeft size={20} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 px-1.5 text-center text-[11px] font-bold text-muted">
          {HE_DAYS_SHORT.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5 px-1.5 pb-2.5">
          {weeks.flat().map((iso) => {
            const inMonth = parts(iso).m === cursor.m;
            const list = byDay.get(iso) ?? [];
            const open = list.filter((t) => !isClosed(t.status));
            const isSel = iso === selected;
            const isToday = iso === today;
            const overdue = iso < today && open.some((t) => !t.is_event);
            return (
              <button
                key={iso}
                onClick={() => {
                  setSelected(iso);
                  if (!inMonth) setCursor({ y: parts(iso).y, m: parts(iso).m });
                }}
                className="flex h-14 flex-col items-center justify-start gap-1 rounded-2xl pt-1.5 transition active:scale-95"
                aria-label={`${formatLong(iso)}${list.length ? `, ${list.length} משימות` : ""}`}
                aria-pressed={isSel}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition",
                    isSel ? "bg-primary text-white" : isToday ? "text-primary ring-2 ring-primary/40" : inMonth ? "text-ink" : "text-slate-300",
                  )}
                >
                  {parts(iso).d}
                </span>
                <span className="flex h-1.5 items-center gap-[3px]">
                  {(open.length ? open : list).slice(0, 4).map((t) => (
                    <span
                      key={t.id}
                      className={cn("h-1.5 w-1.5 rounded-full", isClosed(t.status) && "opacity-35")}
                      style={
                        t.is_event
                          ? { boxShadow: `inset 0 0 0 1.5px ${dotColor(t)}` } // an event: a hollow ring
                          : { backgroundColor: overdue ? "#dc2626" : dotColor(t) }
                      }
                    />
                  ))}
                  {list.length > 4 && <span className="text-[9px] font-bold leading-none text-muted">+</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* the chosen day */}
      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="flex items-center gap-2 text-base font-bold">
            {formatLong(selected)}
            <span className="text-sm font-medium text-muted">{relativeLabel(selected, today).startsWith("באיחור") ? "" : `· ${relativeLabel(selected, today)}`}</span>
            {hasBell(selected) && <Bell size={14} className="text-amber-600" aria-label="יש תזכורת" />}
          </h3>
          <button
            onClick={() => openNewTask({ ...(spaces.length === 1 ? { space_id: spaces[0].id } : {}), due_date: selected })}
            className="flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary"
          >
            <Plus size={14} />
            משימה ליום הזה
          </button>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-1 shadow-soft">
          {dayTasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">אין משימות ביום הזה</p>
          ) : (
            dayTasks.map((t) => <TaskRow key={t.id} task={t} space={spaceById.get(t.space_id)} showSpace={multi} showPriority />)
          )}
        </div>
      </section>

      {multi && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-muted">
          {spaces.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}

      {undated.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 px-1 text-sm font-bold text-muted">ללא תאריך ({undated.length})</h3>
          <div className="rounded-2xl border border-line bg-surface p-1 shadow-soft">
            {undated.map((t) => (
              <TaskRow key={t.id} task={t} space={spaceById.get(t.space_id)} showSpace={multi} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
