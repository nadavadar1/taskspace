"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, CalendarClock, CalendarDays, Check, Flag, Layers, Play, Plus, Sparkles, Target, Zap } from "lucide-react";
import { useData } from "./DataProvider";
import { CalendarView } from "./CalendarView";
import { TaskRow } from "./TaskRow";
import { QuickAdd } from "./QuickAdd";
import { DueLabel, TaskExtras } from "./TaskCard";
import { ChecklistProgressBar } from "./Checklist";
import { PriorityBadge, ProgressRing, cn, useLocalChoice, useMounted } from "./ui";
import { focusQueue } from "@/lib/focus";
import { PRIORITIES, PRIORITY_MAP, isClosed } from "@/lib/constants";
import { formatLong, startOfWeek, todayISO } from "@/lib/dates";
import type { Priority, Space, Task } from "@/lib/types";

type Grouping = "space" | "priority";
const GROUPINGS: readonly Grouping[] = ["space", "priority"];

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
  const open = useMemo(() => scoped.filter((t) => !isClosed(t.status)), [scoped]);

  const attention = useMemo(() => {
    const overdue = open.filter((t) => t.due_date && t.due_date < today).sort(byImportance);
    const todayList = open.filter((t) => t.due_date === today).sort(byImportance);
    const seen = new Set([...overdue, ...todayList].map((t) => t.id));
    const urgent = open.filter((t) => t.priority === "urgent" && !seen.has(t.id)).sort(byDue);
    return { overdue, today: todayList, urgent };
  }, [open, today]);

  const weekStart = startOfWeek(today);
  const doneThisWeek = scoped.filter(
    (t) => t.status === "done" && t.completed_at && todayISO(new Date(t.completed_at)) >= weekStart,
  ).length;
  const nextUp = useMemo(() => focusQueue(open, today)[0], [open, today]);
  const closedToday = scoped.filter(
    (t) => t.status === "done" && t.completed_at && todayISO(new Date(t.completed_at)) === today,
  ).length;
  const leftToday = open.filter((t) => t.due_date && t.due_date <= today).length;
  const byPriority = useMemo(
    () => Object.fromEntries(PRIORITIES.map((p) => [p.key, open.filter((t) => t.priority === p.key)])) as Record<Priority, Task[]>,
    [open],
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{formatLong(today)}</p>
          <h1 className="text-2xl font-bold sm:text-3xl">{greeting()} 👋</h1>
        </div>
        <div className="flex items-center gap-2">
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
          {/* hero: the one next thing + today's progress */}
          <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            {nextUp ? (
              <NextUpCard
                task={nextUp}
                space={spaceById.get(nextUp.space_id)}
                onDone={() => patchTask(nextUp.id, { status: "done" })}
                onOpen={() => openTask(nextUp.id)}
              />
            ) : (
              <div className="flex items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-surface p-8 text-center text-muted">
                אין משימות פתוחות. כל הכבוד! 🎉
              </div>
            )}
            <TodayCard done={closedToday} left={leftToday} />
          </div>

          <div className="mb-6">
            <QuickAdd />
          </div>

          {/* space picker */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="me-1 text-sm font-medium text-slate-500">מציג:</span>
            <button
              onClick={() => setDashboardSpaces(null)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
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
                    "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
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

          {/* numbers */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={open.length} label="משימות פתוחות" />
            <Stat value={attention.overdue.length} label="באיחור" tone={attention.overdue.length ? "bad" : undefined} />
            <Stat value={attention.today.length} label="להיום" tone={attention.today.length ? "warn" : undefined} />
            <Stat value={doneThisWeek} label="נסגרו השבוע" tone={doneThisWeek ? "good" : undefined} />
          </div>

          {/* needs attention */}
          <div className="mb-8 grid gap-4 lg:grid-cols-3">
            <AttentionColumn title="באיחור" icon={<AlertTriangle size={16} />} color="#dc2626" tasks={attention.overdue} empty="אין משימות באיחור 👏" spaceById={spaceById} />
            <AttentionColumn title="להיום" icon={<CalendarClock size={16} />} color="#d97706" tasks={attention.today} empty="אין משימות להיום" spaceById={spaceById} />
            <AttentionColumn title="דחוף" icon={<Zap size={16} />} color="#7c3aed" tasks={attention.urgent} empty="אין משימות דחופות" spaceById={spaceById} />
          </div>

          {/* every open task */}
          <section className="mb-8">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">
                כל המשימות הפתוחות <span className="text-sm font-medium text-muted">({open.length})</span>
              </h2>
              <div className="flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="סידור המשימות">
                <GroupingTab active={grouping === "space"} onClick={() => setGrouping("space")} icon={<Layers size={15} />} label="לפי מרחב" />
                <GroupingTab active={grouping === "priority"} onClick={() => setGrouping("priority")} icon={<Flag size={15} />} label="לפי עדיפות" />
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2">
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
              </div>
            )}
          </section>

          {/* combined calendar */}
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-3">
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
  space,
  onDone,
  onOpen,
}: {
  task: Task;
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
        הדבר הבא
        {space && (
          <span className="rounded-full px-2 py-0.5 text-white" style={{ backgroundColor: color }}>
            {space.name}
          </span>
        )}
      </div>
      <button onClick={onOpen} className="mb-2 block text-start text-xl font-bold leading-snug hover:underline sm:text-2xl">
        {task.title}
      </button>
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
        <Link
          href={`/focus?task=${task.id}`}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white shadow-soft transition hover:brightness-110"
          style={{ backgroundColor: color }}
        >
          <Play size={15} />
          להתחיל עכשיו
        </Link>
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

function TodayCard({ done, left }: { done: number; left: number }) {
  const total = done + left;
  const value = total ? done / total : 1;
  return (
    <section className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-5 shadow-soft">
      <ProgressRing value={value} size={88} stroke={9} color={left === 0 ? "#22c55e" : "var(--primary)"}>
        <span className="text-lg font-bold tabular-nums">{total ? `${Math.round(value * 100)}%` : "✓"}</span>
      </ProgressRing>
      <div className="min-w-0">
        <div className="text-sm font-bold">היום שלך</div>
        <div className="mt-1 text-sm text-muted">
          {left === 0 ? (done ? "סגרת הכול להיום! 🎉" : "אין משימות להיום") : `נשארו ${left} ${left === 1 ? "משימה" : "משימות"} להיום`}
        </div>
        <div className="mt-0.5 text-xs text-muted">{done > 0 && `נסגרו היום: ${done}`}</div>
      </div>
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
}: {
  color: string;
  header: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
      <div className="h-1.5" style={{ backgroundColor: color }} />
      <header className="flex items-center justify-between gap-3 px-4 pb-1 pt-3">{header}</header>
      <div className="px-1.5 pb-2">{children}</div>
      {footer && <footer className="border-t border-line px-4 py-2 text-xs text-muted">{footer}</footer>}
    </section>
  );
}

function SpacePanel({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { today } = useData();
  const open = tasks.filter((t) => !isClosed(t.status)).sort(byImportance);
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

function AttentionColumn({
  title,
  icon,
  color,
  tasks,
  empty,
  spaceById,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  tasks: Task[];
  empty: string;
  spaceById: Map<number, Space>;
}) {
  return (
    <PanelShell
      color={color}
      header={
        <>
          <span className="flex items-center gap-2 text-sm font-bold" style={{ color }}>
            {icon}
            {title}
          </span>
          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: `${color}1a`, color }}>
            {tasks.length}
          </span>
        </>
      }
    >
      {tasks.length === 0 ? (
        <p className="py-5 text-center text-sm text-muted">{empty}</p>
      ) : (
        tasks.map((t) => <TaskRow key={t.id} task={t} space={spaceById.get(t.space_id)} showSpace showPriority />)
      )}
    </PanelShell>
  );
}
