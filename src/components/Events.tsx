"use client";

import { CalendarDays, X } from "lucide-react";
import { useData } from "./DataProvider";
import { Swipeable } from "./Swipe";
import { cn } from "./ui";
import { HE_DAYS, HE_MONTHS, addDays, dayOfWeek, diffDays, formatLong, parts } from "@/lib/dates";
import type { Space, Task } from "@/lib/types";

/** "היום" / "מחר" / "בעוד 12 ימים" / "לפני 3 ימים". */
export function eventCountdown(date: string, today: string): string {
  const n = diffDays(date, today);
  if (n === 0) return "היום";
  if (n === 1) return "מחר";
  if (n === -1) return "אתמול";
  return n > 0 ? `בעוד ${n} ימים` : `לפני ${-n} ימים`;
}

/** A calendar event in a list: a date tile instead of a tick (events are not ticked off). */
export function EventRow({ task, space, showSpace }: { task: Task; space?: Space; showSpace?: boolean }) {
  const { today, openTask, deleteWithUndo, openActions, spaces } = useData();
  const sp = space ?? spaces.find((s) => s.id === task.space_id);
  const color = sp?.color ?? "#6366f1";
  const past = !!task.due_date && task.due_date < today;
  return (
    <Swipeable onDelete={() => deleteWithUndo(task.id)} onLongPress={() => openActions(task.id)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => openTask(task.id)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openTask(task.id))}
        data-task-row
        data-event
        className={cn(
          "group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-start transition hover:bg-slate-50 active:bg-slate-100",
          past && "opacity-60",
        )}
      >
        <DateTile date={task.due_date} color={color} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[15px] font-medium leading-snug">{task.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1 font-bold" style={{ color }}>
              <CalendarDays size={12} />
              אירוע ביומן
            </span>
            {task.due_date && <span className="font-bold text-slate-600">{eventCountdown(task.due_date, today)}</span>}
            {task.due_time && <span>{task.due_time}{task.end_time ? ` עד ${task.end_time}` : ""}</span>}
            {showSpace && sp && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: sp.color }} />
                {sp.name}
              </span>
            )}
          </span>
        </span>
        <button
          type="button"
          data-no-swipe
          onClick={(e) => {
            e.stopPropagation();
            deleteWithUndo(task.id);
          }}
          className="-me-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          aria-label={`מחיקת "${task.title}"`}
        >
          <X size={17} />
        </button>
      </div>
    </Swipeable>
  );
}

function DateTile({ date, color }: { date: string | null; color: string }) {
  if (!date) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: color }}>
        <CalendarDays size={18} />
      </span>
    );
  }
  const { d, m } = parts(date);
  return (
    <span
      className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border-2 leading-none"
      style={{ borderColor: color, color }}
      title={formatLong(date)}
    >
      <span className="text-base font-bold">{d}</span>
      <span className="text-[10px] font-bold">{HE_MONTHS[m - 1].slice(0, 3)}</span>
    </span>
  );
}

/** "📅 בקרוב ביומן": the next calendar events, so there is time to prepare. */
export function UpcomingEvents({ events, spaceById, limit = 4 }: { events: Task[]; spaceById: Map<number, Space>; limit?: number }) {
  if (!events.length) return null;
  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-line bg-surface shadow-soft" aria-label="בקרוב ביומן">
      <header className="flex items-center gap-2 px-4 pb-1 pt-3 text-sm font-bold text-slate-700">
        <CalendarDays size={16} className="text-primary" />
        בקרוב ביומן
        <span className="text-xs font-medium text-muted">{events.length}</span>
      </header>
      <div className="px-1.5 pb-1.5">
        {events.slice(0, limit).map((t) => (
          <EventRow key={t.id} task={t} space={spaceById.get(t.space_id)} showSpace={spaceById.size > 1} />
        ))}
      </div>
    </section>
  );
}

/**
 * "השבוע": seven day cards side by side (today first), each with its events and dated tasks,
 * so nothing coming up this week is missed. Sideways scroll on a phone.
 */
export function WeekStrip({ items, spaceById }: { items: Task[]; spaceById: Map<number, Space> }) {
  const { today, openTask } = useData();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const byDay = (d: string) =>
    items
      .filter((t) => t.due_date === d)
      .sort((a, b) => Number(b.is_event) - Number(a.is_event) || (a.due_time ?? "99").localeCompare(b.due_time ?? "99"));
  const events = items.filter((t) => t.is_event).length;
  return (
    <section className="mb-5" aria-label="השבוע" data-week>
      <header className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-base font-bold">📅 השבוע</h2>
        <span className="text-xs font-medium text-muted">
          {events ? `${events} אירועים · ` : ""}
          {items.length - events} משימות עם תאריך
        </span>
      </header>
      <div className="scroll-thin -mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-7 sm:overflow-visible sm:px-0">
        {days.map((d, i) => {
          const list = byDay(d);
          return (
            <div
              key={d}
              className={cn(
                "flex w-[8.75rem] shrink-0 snap-start flex-col rounded-2xl border bg-surface p-2.5 shadow-soft sm:w-auto",
                i === 0 ? "border-primary ring-2 ring-indigo-100" : "border-line",
              )}
            >
              <div className="mb-1.5 flex items-baseline justify-between gap-1">
                <span className={cn("text-sm font-bold", i === 0 && "text-primary")}>
                  {i === 0 ? "היום" : i === 1 ? "מחר" : HE_DAYS[dayOfWeek(d)]}
                </span>
                <span className="text-[11px] font-bold text-muted">
                  {parts(d).d}.{parts(d).m}
                </span>
              </div>
              {list.length === 0 ? (
                <span className="py-2 text-xs text-slate-400">פנוי ✨</span>
              ) : (
                <ul className="space-y-1">
                  {list.slice(0, 4).map((t) => {
                    const color = spaceById.get(t.space_id)?.color ?? "#6366f1";
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => openTask(t.id)}
                          className={cn(
                            "w-full rounded-lg px-1.5 py-1 text-start text-xs leading-snug transition active:scale-[0.98]",
                            t.is_event ? "font-bold text-white" : "bg-slate-50 text-slate-700",
                          )}
                          style={t.is_event ? { backgroundColor: color } : { boxShadow: `inset -3px 0 0 ${color}` }}
                        >
                          {t.due_time && <span className={cn("me-1 font-bold", !t.is_event && "text-primary")}>{t.due_time}</span>}
                          <span className="line-clamp-2">{t.title}</span>
                        </button>
                      </li>
                    );
                  })}
                  {list.length > 4 && <li className="px-1.5 text-[11px] font-bold text-muted">ועוד {list.length - 4}</li>}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
