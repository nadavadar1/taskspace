"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, CalendarClock, CalendarDays, Check, KanbanSquare, ListChecks, Plus, Sparkles, Zap } from "lucide-react";
import { useData } from "./DataProvider";
import { TaskCard } from "./TaskCard";
import { CalendarView } from "./CalendarView";
import { cn, useMounted } from "./ui";
import { PRIORITY_MAP, isClosed } from "@/lib/constants";
import { formatLong, startOfWeek, todayISO } from "@/lib/dates";
import type { Task, ViewType } from "@/lib/types";

const VIEW_ICON: Record<ViewType, React.ReactNode> = {
  kanban: <KanbanSquare size={14} />,
  todo: <ListChecks size={14} />,
  calendar: <CalendarDays size={14} />,
};

function greeting(): string {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" }).format(new Date()),
  );
  if (h < 5) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 18) return "צהריים טובים";
  return "ערב טוב";
}

export function DashboardView() {
  const { spaces, tasks, settings, setDashboardSpaces, today, openNewTask, openSpaceDialog, askAgent } = useData();

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
  // the combined calendar follows the same space picker as everything else on the dashboard
  const calendarSpaces = useMemo(() => spaces.filter((s) => selected.includes(s.id)), [spaces, selected]);

  const scoped = useMemo(() => tasks.filter((t) => selected.includes(t.space_id)), [tasks, selected]);
  const open = useMemo(() => scoped.filter((t) => !isClosed(t.status)), [scoped]);

  const groups = useMemo(() => {
    const rank = (t: Task) => PRIORITY_MAP[t.priority].rank;
    const sort = (a: Task, b: Task) =>
      rank(a) - rank(b) || (a.due_date ?? "9").localeCompare(b.due_date ?? "9") || a.id - b.id;
    const overdue = open.filter((t) => t.due_date && t.due_date < today).sort(sort);
    const todayList = open.filter((t) => t.due_date === today).sort(sort);
    const seen = new Set([...overdue, ...todayList].map((t) => t.id));
    const urgent = open.filter((t) => t.priority === "urgent" && !seen.has(t.id)).sort(sort);
    return { overdue, today: todayList, urgent };
  }, [open, today]);

  const weekStart = startOfWeek(today);
  const spaceStats = (spaceId: number) => {
    const st = tasks.filter((t) => t.space_id === spaceId);
    const o = st.filter((t) => !isClosed(t.status));
    return {
      open: o.length,
      overdue: o.filter((t) => t.due_date && t.due_date < today).length,
      doneWeek: st.filter(
        (t) => t.status === "done" && t.completed_at && todayISO(new Date(t.completed_at)) >= weekStart,
      ).length,
    };
  };

  const nothingImportant = !groups.overdue.length && !groups.today.length && !groups.urgent.length;

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
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-600 disabled:opacity-50"
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
          {/* space picker */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="me-1 text-sm font-medium text-slate-500">מציג:</span>
            <button
              onClick={() => setDashboardSpaces(null)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                allSelected ? "border-slate-900 bg-slate-900 text-white" : "border-line bg-surface text-slate-600 hover:bg-slate-50",
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

          {/* important tasks */}
          <div className="mb-8 grid gap-4 lg:grid-cols-3">
            <ImportantColumn
              title="באיחור"
              icon={<AlertTriangle size={16} />}
              color="#dc2626"
              tasks={groups.overdue}
              empty="אין משימות באיחור 👏"
            />
            <ImportantColumn
              title="להיום"
              icon={<CalendarClock size={16} />}
              color="#d97706"
              tasks={groups.today}
              empty="אין משימות להיום"
            />
            <ImportantColumn
              title="דחוף"
              icon={<Zap size={16} />}
              color="#7c3aed"
              tasks={groups.urgent}
              empty="אין משימות דחופות"
            />
          </div>
          {nothingImportant && open.length > 0 && (
            <p className="-mt-4 mb-8 text-center text-sm text-muted">
              אין כרגע משהו שבוער. יש {open.length} משימות פתוחות בשאר המרחבים שנבחרו.
            </p>
          )}

          {/* combined calendar */}
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">יומן</h2>
              <Link href="/calendar" className="text-sm font-medium text-primary hover:underline">
                פתיחה במסך מלא
              </Link>
            </div>
            {calendarSpaces.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-surface py-10 text-center text-sm text-muted">
                בחר לפחות מרחב אחד למעלה כדי לראות אותו ביומן.
              </p>
            ) : (
              // dnd-kit generates ids that differ between server and client, so render after hydration
              mounted && <CalendarView spaces={calendarSpaces} />
            )}
          </section>

          {/* space cards */}
          <h2 className="mb-3 text-lg font-bold">המרחבים שלי</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((s) => {
              const st = spaceStats(s.id);
              return (
                <Link
                  key={s.id}
                  href={`/space/${s.id}`}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                    !selected.includes(s.id) && "opacity-60",
                  )}
                >
                  <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: s.color }} />
                  <div className="mb-4 mt-1 flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </div>
                    <span className="text-slate-400">{VIEW_ICON[s.view]}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat value={st.open} label="פתוחות" />
                    <Stat value={st.overdue} label="באיחור" danger={st.overdue > 0} />
                    <Stat value={st.doneWeek} label="נסגרו השבוע" good={st.doneWeek > 0} />
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ value, label, danger, good }: { value: number; label: string; danger?: boolean; good?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-1 py-2.5">
      <div className={cn("text-2xl font-bold leading-none", danger && "text-red-600", good && "text-emerald-600")}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] font-medium text-muted">{label}</div>
    </div>
  );
}

function ImportantColumn({
  title,
  icon,
  color,
  tasks,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  tasks: Task[];
  empty: string;
}) {
  const { spaces, today, openTask } = useData();
  return (
    <section className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
      <header className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-sm font-bold" style={{ color }}>
          {icon}
          {title}
        </div>
        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: `${color}1a`, color }}>
          {tasks.length}
        </span>
      </header>
      <div className="scroll-thin flex max-h-[420px] flex-col gap-2 overflow-y-auto">
        {tasks.length === 0 && <p className="py-6 text-center text-sm text-muted">{empty}</p>}
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            today={today}
            space={spaces.find((s) => s.id === t.space_id)}
            onClick={() => openTask(t.id)}
          />
        ))}
      </div>
    </section>
  );
}
