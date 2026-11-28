"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CalendarDays, Check, ChevronDown, Flag, Layers, Play, Plus, Sparkles, Target } from "lucide-react";
import { useData } from "./DataProvider";
import { CalendarView } from "./CalendarView";
import { TaskRow } from "./TaskRow";
import { QuickAdd } from "./QuickAdd";
import { DueLabel, TaskExtras } from "./TaskCard";
import { ChecklistProgressBar } from "./Checklist";
import { PriorityBadge, ProgressRing, cn, useLocalChoice, useMounted } from "./ui";
import { completionStreak, focusQueue, isMoment } from "@/lib/focus";
import { GestureTip } from "./GestureTip";
import { UpcomingEvents, WeekStrip } from "./Events";
import { RoutineCard, routinesNow } from "./RoutineCard";
import { CoveredGroup } from "./Recurring";
import { TodayPlan, useNowHM } from "./TodayPlan";
import { MorningRitual, useMorningRitual } from "./MorningRitual";
import { planDay } from "@/lib/day-plan";
import { PRIORITIES, PRIORITY_MAP } from "@/lib/constants";
import { addDays, formatLong, startOfWeek, todayISO } from "@/lib/dates";
import type { Priority, Space, Task } from "@/lib/types";

type Grouping = "space" | "priority";
const GROUPINGS: readonly Grouping[] = ["space", "priority"];
type PhoneTab = "today" | "general";
const PHONE_TABS: readonly PhoneTab[] = ["today", "general"];

function greeting(): string {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" }).format(new Date()),
  );
  if (h < 5) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 18) return "צהריים טובים";
  return "ערב טוב";
}

const dueKey = (t: Task) => `${t.due_date ?? "9999-99-99"} ${t.due_time ?? "99:99"}`;
const rank = (t: Task) => PRIORITY_MAP[t.priority].rank;
/** most important first, then the nearest due date */
const byImportance = (a: Task, b: Task) => rank(a) - rank(b) || dueKey(a).localeCompare(dueKey(b)) || a.id - b.id;
/** nearest due date first, then most important */
const byDue = (a: Task, b: Task) => dueKey(a).localeCompare(dueKey(b)) || rank(a) - rank(b) || a.id - b.id;

export function DashboardView() {
  const { spaces, tasks, settings, setDashboardSpaces, today, openNewTask, openSpaceDialog, askAgent, patchTask, openTask } =
    useData();
  const [grouping, setGrouping] = useLocalChoice<Grouping>("dashboard-grouping", "space", GROUPINGS);
  // on a phone the dashboard is split into tabs, so it is short instead of five screens long
  const [phoneTab, setPhoneTab] = useLocalChoice<PhoneTab>("dashboard-phone-tab", "today", PHONE_TABS);

  const selected = useMemo(() => {
    const ids = settings.dashboard_spaces;
    const valid = ids ? ids.filter((id) => spaces.some((s) => s.id === id)) : null;
    return valid ?? spaces.map((s) => s.id);
  }, [settings.dashboard_spaces, spaces]);

  const allSelected = selected.length === spaces.length;

  function toggle(id: number) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setDashboardSpaces(next.length === spaces.length ? null : next);
  }

  const mounted = useMounted();
  const shownSpaces = useMemo(() => spaces.filter((s) => selected.includes(s.id)), [spaces, selected]);
  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);

  const scoped = useMemo(() => tasks.filter((t) => selected.includes(t.space_id)), [tasks, selected]);
  const { series, isTodo } = useData();
  // what is still to do: no calendar events, no repeating task that was already done for this round
  const open = useMemo(() => scoped.filter((t) => isTodo(t)), [scoped, isTodo]);
  const coveredAll = useMemo(() => scoped.filter((t) => series.get(t.id)?.covered), [scoped, series]);
  const upcomingEvents = useMemo(
    () =>
      scoped
        // events, plus anything with a set time in the next two weeks (padel, a meeting): the real schedule
        .filter(
          (t) =>
            !!t.due_date &&
            t.due_date >= today &&
            (t.is_event || (!!t.due_time && isTodo(t) && t.due_date <= addDays(today, 14))),
        )
        .sort((a, b) => `${a.due_date} ${a.due_time ?? ""}`.localeCompare(`${b.due_date} ${b.due_time ?? ""}`)),
    [scoped, today, isTodo],
  );

  const weekItems = useMemo(() => {
    const end = addDays(today, 6);
    return scoped.filter((t) => t.due_date && t.due_date >= today && t.due_date <= end && (t.is_event || isTodo(t)));
  }, [scoped, today, isTodo]);

  const nowHM = useNowHM();
  const [ritualOpen, setRitualOpen] = useMorningRitual();
  // routines are not to-dos (isTodo leaves them out): only the one for this hour, in its own card
  const routines = useMemo(() => routinesNow(scoped, nowHM), [scoped, nowHM]);
  const plan = useMemo(() => {
    const doneToday = scoped.filter(
      (t) => !t.is_event && t.status === "done" && t.completed_at && todayISO(new Date(t.completed_at)) === today,
    );
    return planDay(open, doneToday, today, nowHM);
  }, [open, scoped, today, nowHM]);
  const todayLeft = open.filter((t) => t.due_date === today).length;

  const weekStart = startOfWeek(today);
  const doneThisWeek = scoped.filter(
    (t) => t.status === "done" && t.completed_at && todayISO(new Date(t.completed_at)) >= weekStart,
  ).length;
  // "now" follows the day's clock; with nothing for today, the usual focus order
  const nextUp = useMemo(() => plan.now ?? focusQueue(open, today, series)[0], [plan.now, open, today, series]);
  const closedToday = scoped.filter(
    (t) => t.status === "done" && t.completed_at && todayISO(new Date(t.completed_at)) === today,
  ).length;
  const leftToday = open.filter((t) => t.due_date && t.due_date <= today).length;
  const streak = useMemo(() => completionStreak(tasks, today), [tasks, today]);

  const byPriority = useMemo(
    () => Object.fromEntries(PRIORITIES.map((p) => [p.key, open.filter((t) => t.priority === p.key)])) as Record<Priority, Task[]>,
    [open],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
        <div>
          <p className="text-sm text-muted">{formatLong(today)}</p>
          <h1 className="text-2xl font-bold sm:text-3xl">{greeting()} 👋</h1>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <button
            onClick={() => askAgent("תכין לי סיכום יומי: על מה כדאי להתמקד היום?")}
            className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-primary-soft px-4 py-2 text-sm font-medium text-primary transition hover:bg-indigo-100"
          >
            <Sparkles size={16} />
            סיכום יומי
          </button>
          <button
            onClick={() => openNewTask()}
            disabled={!spaces.length}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-indigo-600 disabled:opacity-50"
          >
            <Plus size={16} />
            משימה חדשה
          </button>
        </div>
      </div>

      {ritualOpen && spaces.length > 0 && <MorningRitual open onClose={() => setRitualOpen(false)} />}

      {spaces.length === 0 ? (
        <div className="mx-auto mt-16 max-w-md rounded-3xl border border-dashed border-slate-300 bg-surface p-10 text-center">
          <p className="mb-1 text-lg font-bold">בוא נתחיל</p>
          <p className="mb-5 text-sm text-muted">צור את המרחב הראשון שלך: בית, עבודה, לימודים, או כל דבר אחר.</p>
          <button
            onClick={() => openSpaceDialog({ mode: "new" })}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white"
          >
            יצירת מרחב
          </button>
        </div>
      ) : (
        <>
          {/* phone tabs */}
          <div
            className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 -mx-3 mb-4 bg-bg/90 px-3 py-2 backdrop-blur-xl sm:hidden"
            role="tablist"
            aria-label="מה להציג"
          >
            <div className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface p-1 shadow-soft">
              <PhoneTabButton active={phoneTab === "today"} onClick={() => setPhoneTab("today")} label="היום" count={todayLeft} />
              <PhoneTabButton
                active={phoneTab === "general"}
                onClick={() => setPhoneTab("general")}
                label="כללי"
                count={plan.tomorrow.length + plan.week.length + plan.later.length + plan.someday.length}
              />
            </div>
          </div>

          <div className={cn(phoneTab !== "today" && "hidden sm:block")}>
            <RoutineCard routines={routines} />
          </div>

          {/* hero: the one next thing + today's progress */}
          <div className={cn("mb-4 grid gap-3 sm:mb-5 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_300px]", phoneTab !== "today" && "hidden sm:grid")}>
            {nextUp ? (
              <NextUpCard
                task={nextUp}
                now={nextUp === plan.now}
                space={spaceById.get(nextUp.space_id)}
                onDone={() => patchTask(nextUp.id, { status: "done" })}
                onOpen={() => openTask(nextUp.id)}
              />
            ) : (
              <div className="flex items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-surface p-8 text-center text-muted">
                אין משימות פתוחות. כל הכבוד! 🎉
              </div>
            )}
            <div className="hidden sm:block">
              <TodayCard done={closedToday} left={leftToday} streak={streak} />
            </div>
          </div>

          <div className="mb-6 hidden sm:block">
            <QuickAdd />
          </div>

          {/* the week ahead: events and dated tasks per day, so nothing coming up is missed */}
          <div className={cn(phoneTab !== "today" && "hidden sm:block")}>
            <WeekStrip items={weekItems} spaceById={spaceById} />
          </div>

          {/* space picker: one sideways-scrolling line on a phone */}
          <div className="scroll-thin hidden items-center gap-2 sm:mb-5 sm:flex sm:flex-wrap">
            <span className="me-1 hidden text-sm font-medium text-slate-500 sm:inline">מציג:</span>
            <button
              onClick={() => setDashboardSpaces(null)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                allSelected ? "border-ink bg-ink text-surface" : "border-line bg-surface text-slate-600 hover:bg-slate-50",
              )}
            >
              כל המרחבים
            </button>
            {spaces.map((s) => {
              const on = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                    on ? "text-white" : "border-line bg-surface text-slate-500 hover:bg-slate-50",
                  )}
                  style={on ? { backgroundColor: s.color, borderColor: s.color } : undefined}
                >
                  {on ? <Check size={14} /> : <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />}
                  {s.name}
                </button>
              );
            })}
          </div>

          <GestureTip />

          <div className={cn(phoneTab !== "general" && "hidden sm:block")}>
            <UpcomingEvents events={upcomingEvents} spaceById={spaceById} />
          </div>

          {/* numbers */}
          <div className="mb-6 hidden grid-cols-2 gap-3 sm:grid sm:grid-cols-4">
            <Stat value={open.length} label="משימות פתוחות" />
            <Stat value={plan.overdue.length} label="מימים קודמים" tone={plan.overdue.length ? "warn" : undefined} />
            <Stat value={todayLeft} label="להיום" tone={todayLeft ? "warn" : undefined} />
            <Stat value={doneThisWeek} label="נסגרו השבוע" tone={doneThisWeek ? "good" : undefined} />
          </div>

          {/* phone: every category at a glance, so tasks without a date for today aren't forgotten */}
          <div className={cn("sm:hidden", phoneTab !== "today" && "hidden")}>
            <CategoryBoard spaces={shownSpaces} open={open} scoped={scoped} today={today} weekStart={weekStart} />
          </div>

          {/* my day */}
          <div className="mb-8 max-w-3xl">
            <TodayPlan plan={plan} spaceById={spaceById} multi={shownSpaces.length > 1} onPlan={() => setRitualOpen(true)} part={phoneTab} />
          </div>

          {/* every open task */}
          <section className="mb-8 hidden sm:block">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <h2 className="hidden text-lg font-bold sm:block">
                כל המשימות הפתוחות <span className="text-sm font-medium text-muted">({open.length})</span>
              </h2>
              <div className="flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="סידור המשימות">
                <GroupingTab active={grouping === "space"} onClick={() => setGrouping("space")} icon={<Layers size={15} />} label="לפי מרחב" />
                <GroupingTab active={grouping === "priority"} onClick={() => setGrouping("priority")} icon={<Flag size={15} />} label="לפי עדיפות" />
              </div>
            </div>

            <div className="mb-4 hidden flex-wrap items-center gap-2 sm:flex">
              {PRIORITIES.map((p) => (
                <span
                  key={p.key}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                  style={{ backgroundColor: `${p.color}1a`, color: p.color }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.label} {byPriority[p.key].length}
                </span>
              ))}
            </div>

            {grouping === "space" ? (
              <div className="grid items-start gap-4 lg:grid-cols-2">
                {shownSpaces.map((s) => (
                  <SpacePanel key={s.id} space={s} tasks={scoped.filter((t) => t.space_id === s.id)} />
                ))}
                {shownSpaces.length === 0 && <EmptyNote>בחר לפחות מרחב אחד למעלה.</EmptyNote>}
              </div>
            ) : (
              <div className="grid items-start gap-4 lg:grid-cols-2">
                {PRIORITIES.map((p) => (
                  <PriorityPanel key={p.key} priority={p.key} tasks={[...byPriority[p.key]].sort(byDue)} spaceById={spaceById} />
                ))}
                {coveredAll.length > 0 && (
                  <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-surface py-1 shadow-soft">
                    <CoveredGroup
                      tasks={coveredAll}
                      render={(t) => <TaskRow key={t.id} task={t} space={spaceById.get(t.space_id)} showSpace />}
                    />
                  </section>
                )}
              </div>
            )}
          </section>

          {/* combined calendar */}
          <section className="mb-8 hidden sm:block">
            <div className="mb-3 hidden items-center justify-between gap-3 sm:flex">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CalendarDays size={18} className="text-slate-400" />
                יומן
              </h2>
              <Link href="/calendar" className="text-sm font-medium text-primary hover:underline">
                פתיחה במסך מלא
              </Link>
            </div>
            {shownSpaces.length === 0 ? (
              <EmptyNote>בחר לפחות מרחב אחד למעלה כדי לראות אותו ביומן.</EmptyNote>
            ) : (
              // dnd-kit generates ids that differ between server and client, so render after hydration
              mounted && <CalendarView spaces={shownSpaces} />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function NextUpCard({
  task,
  now,
  space,
  onDone,
  onOpen,
}: {
  task: Task;
  /** from the day plan (by the clock) rather than the general focus order */
  now?: boolean;
  space?: Space;
  onDone: () => void;
  onOpen: () => void;
}) {
  const { today } = useData();
  const color = space?.color ?? "#6366f1";
  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-soft sm:p-6"
      style={{ backgroundImage: `linear-gradient(135deg, ${color}1c, transparent 55%)` }}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-bold" style={{ color }}>
        <Target size={15} />
        {now ? `עכשיו${task.due_time ? ` · ${task.due_time}` : ""}` : "הדבר הבא"}
        {space && (
          <span className="rounded-full px-2 py-0.5 text-white" style={{ backgroundColor: color }}>
            {space.name}
          </span>
        )}
      </div>
      <button onClick={onOpen} className="mb-2 block text-start text-xl font-bold leading-snug hover:underline sm:text-2xl">
        {task.title}
      </button>
      {task.description && <p className="mb-2 line-clamp-2 text-sm leading-relaxed text-muted">{task.description}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <PriorityBadge priority={task.priority} />
        <DueLabel task={task} today={today} />
        <TaskExtras task={task} />
      </div>
      {task.checklist.length > 0 && (
        <div className="mb-4 max-w-sm">
          <ChecklistProgressBar items={task.checklist} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!isMoment(task) && (
          <Link
            href={`/focus?task=${task.id}&start=15`}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white shadow-soft transition hover:brightness-110"
            style={{ backgroundColor: color }}
          >
            <Play size={15} />
            15 דקות עכשיו
          </Link>
        )}
        <button
          onClick={onDone}
          className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-bold text-emerald-600 transition hover:bg-emerald-50"
        >
          <Check size={15} />
          סיימתי
        </button>
      </div>
    </section>
  );
}

function TodayCard({ done, left, streak }: { done: number; left: number; streak: number }) {
  const total = done + left;
  const value = total ? done / total : 1;
  return (
    <section className="flex items-center gap-3 rounded-3xl border border-line bg-surface px-4 py-3 shadow-soft sm:gap-4 sm:p-5">
      <span className="sm:hidden">
        <ProgressRing value={value} size={52} stroke={6} color={left === 0 ? "#22c55e" : "var(--primary)"}>
          <span className="text-xs font-bold tabular-nums">{total ? `${Math.round(value * 100)}%` : "✓"}</span>
        </ProgressRing>
      </span>
      <span className="hidden sm:block">
        <ProgressRing value={value} size={76} stroke={8} color={left === 0 ? "#22c55e" : "var(--primary)"}>
          <span className="text-lg font-bold tabular-nums">{total ? `${Math.round(value * 100)}%` : "✓"}</span>
        </ProgressRing>
      </span>
      <div className="min-w-0">
        <div className="text-sm font-bold">היום שלך</div>
        <div className="mt-0.5 text-sm text-muted sm:mt-1">
          {left === 0 ? (done ? "סגרת הכול להיום! 🎉" : "אין משימות להיום") : `נשארו ${left} ${left === 1 ? "משימה" : "משימות"} להיום`}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          {done > 0 && <span>נסגרו היום: {done}</span>}
          {streak >= 2 && (
            <span className="font-bold text-orange-500" title="ימים ברצף שסגרת לפחות משימה אחת">
              🔥 {streak} ימים ברצף
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function PhoneTabButton({
  active,
  onClick,
  label,
  count,
  alert,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  alert?: boolean;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition",
        active ? "bg-ink text-surface shadow-soft" : "text-slate-500 active:bg-slate-100",
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "min-w-5 rounded-full px-1.5 text-xs leading-5",
            alert ? "bg-red-600 text-white" : active ? "bg-white/20" : "bg-slate-100 text-muted",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * One line per space: a weekly progress bar (closed this week vs still open) and, on tap, the open tasks that are
 * not on today's list, each with "להיום". A space with nothing open gets a trophy.
 */
function CategoryBoard({
  spaces,
  open,
  scoped,
  today,
  weekStart,
}: {
  spaces: Space[];
  open: Task[];
  scoped: Task[];
  today: string;
  weekStart: string;
}) {
  const [expanded, setExpanded] = useLocalChoice<string>("category-board-open", "", ["", ...spaces.map((s) => String(s.id))]);
  const rows = spaces.map((s) => {
    const mine = open.filter((t) => t.space_id === s.id);
    // overdue and today's are already in the day plan; waiting ones can't be done now
    const more = mine.filter((t) => (!t.due_date || t.due_date > today) && t.status !== "on_hold").sort(byImportance);
    const done = scoped.filter(
      (t) => t.space_id === s.id && t.status === "done" && t.completed_at && todayISO(new Date(t.completed_at)) >= weekStart,
    ).length;
    return { s, more, left: mine.length, done };
  });
  const doneWeek = rows.reduce((n, r) => n + r.done, 0);
  if (!spaces.length) return null;
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-soft" data-board>
      <header className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
        <h2 className="font-bold">כל המשימות לפי קטגוריה</h2>
        {doneWeek > 0 && <span className="text-xs font-bold text-emerald-600">השבוע סגרת {doneWeek} ⭐</span>}
      </header>
      <p className="px-4 pb-2 text-xs text-muted">גם מה שלא מופיע בהיום. אפשר לסגור או להעביר להיום.</p>
      {rows.map(({ s, more, left, done }) => {
        const isOpen = expanded === String(s.id);
        const pct = done + left ? Math.round((done / (done + left)) * 100) : 100;
        return (
          <div key={s.id} className="border-t border-line">
            <button
              onClick={() => setExpanded(isOpen ? "" : String(s.id))}
              className="flex w-full items-center gap-3 px-4 py-3 text-start"
              aria-expanded={isOpen}
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-bold">{s.name}</span>
                  <span className="text-xs font-bold text-muted">
                    {left === 0 ? "הכול סגור 🏆" : more.length ? `עוד ${more.length} שלא להיום` : `${left} בהיום`}
                  </span>
                </span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                </span>
              </span>
              {more.length > 0 && <ChevronDown size={17} className={cn("shrink-0 text-muted transition", isOpen && "rotate-180")} />}
            </button>
            {isOpen && more.length > 0 && (
              <div className="px-1.5 pb-2">
                {more.map((t) => (
                  <TaskRow key={t.id} task={t} showPriority toToday />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-surface py-10 text-center text-sm text-muted">{children}</p>
  );
}

function GroupingTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
        active ? "bg-ink text-surface shadow-soft" : "text-slate-500 hover:bg-slate-100",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: "bad" | "warn" | "good" }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3.5 text-center shadow-soft">
      <div
        className={cn(
          "text-3xl font-bold leading-none",
          tone === "bad" && "text-red-600",
          tone === "warn" && "text-amber-600",
          tone === "good" && "text-emerald-600",
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-xs font-medium text-muted">{label}</div>
    </div>
  );
}

function PanelShell({
  color,
  header,
  children,
  footer,
  className,
}: {
  color: string;
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-line bg-surface shadow-soft", className)}>
      <div className="h-1.5" style={{ backgroundColor: color }} />
      <header className="flex items-center justify-between gap-3 px-4 pb-1 pt-3">{header}</header>
      <div className="px-1.5 pb-2">{children}</div>
      {footer && <footer className="border-t border-line px-4 py-2 text-xs text-muted">{footer}</footer>}
    </section>
  );
}

function SpacePanel({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { today, series, isTodo } = useData();
  const open = tasks.filter((t) => isTodo(t)).sort(byImportance);
  // repeating tasks already done for this round are folded away under one green line
  const covered = tasks.filter((t) => series.get(t.id)?.covered).sort(byDue);
  const overdue = open.filter((t) => t.due_date && t.due_date < today).length;
  const done = tasks.filter((t) => t.status === "done").length;
  const notDone = tasks.filter((t) => t.status === "not_done").length;
  return (
    <PanelShell
      color={space.color}
      header={
        <>
          <Link href={`/space/${space.id}`} className="flex items-center gap-2 text-base font-bold hover:underline">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: space.color }} />
            {space.name}
          </Link>
          <span className="flex items-center gap-2 text-xs">
            {overdue > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-600">{overdue} באיחור</span>}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">{open.length} פתוחות</span>
          </span>
        </>
      }
      footer={
        done || notDone ? (
          <span>
            {done > 0 && <>הושלמו {done}</>}
            {done > 0 && notDone > 0 && " · "}
            {notDone > 0 && <>לא בוצעו {notDone}</>}
          </span>
        ) : undefined
      }
    >
      {open.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">אין משימות פתוחות 🎉</p>
      ) : (
        open.map((t) => <TaskRow key={t.id} task={t} showPriority />)
      )}
      <CoveredGroup tasks={covered} render={(t) => <TaskRow key={t.id} task={t} />} />
    </PanelShell>
  );
}

function PriorityPanel({ priority, tasks, spaceById }: { priority: Priority; tasks: Task[]; spaceById: Map<number, Space> }) {
  const p = PRIORITY_MAP[priority];
  return (
    <PanelShell
      color={p.color}
      header={
        <>
          <span className="flex items-center gap-2 text-base font-bold" style={{ color: p.color }}>
            <Flag size={16} />
            {p.label}
          </span>
          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: `${p.color}1a`, color: p.color }}>
            {tasks.length}
          </span>
        </>
      }
    >
      {tasks.length === 0 ? (
        <p className="py-5 text-center text-sm text-muted">אין משימות בעדיפות הזו</p>
      ) : (
        tasks.map((t) => <TaskRow key={t.id} task={t} space={spaceById.get(t.space_id)} showSpace />)
      )}
    </PanelShell>
  );
}
