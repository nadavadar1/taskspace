"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ClipboardList, Hourglass, Moon, Pencil, Plus, Star, Sun, Trophy } from "lucide-react";
import { useData } from "./DataProvider";
import { TaskRow } from "./TaskRow";
import { cn, useMounted } from "./ui";
import { addDays, nowHHMM } from "@/lib/dates";
import { completionStreak } from "@/lib/focus";
import type { DayPlan } from "@/lib/day-plan";
import type { Space, Task } from "@/lib/types";

/** The current Israel time, ticking every minute; "" before hydration so server and client agree. */
export function useNowHM(): string {
  const mounted = useMounted();
  const [now, setNow] = useState(() => nowHHMM());
  useEffect(() => {
    const t = setInterval(() => setNow(nowHHMM()), 60_000);
    return () => clearInterval(t);
  }, []);
  return mounted ? now : "";
}

/**
 * "My day" (the home screen's first tab): the one line that matters most, what is left from before (one
 * card, not a red wall), the day by the clock, then tomorrow / this week / later / no date folded away.
 */
export function TodayPlan({
  plan,
  spaceById,
  multi,
  onPlan,
}: {
  plan: DayPlan;
  spaceById: Map<number, Space>;
  multi: boolean;
  /** opens the one-minute morning plan */
  onPlan: () => void;
}) {
  const { today, patchTask, toast, openPaste, openNewTask } = useData();
  const nowHM = useNowHM();
  const row = (t: Task, clock = false) => (
    <TaskRow key={t.id} task={t} space={spaceById.get(t.space_id)} showSpace={multi} clock={clock} />
  );

  /** move many at once; "ביטול" puts every old date back */
  function moveAll(list: Task[], to: string, message: string) {
    const moved = list.map((t) => ({ id: t.id, was: t.due_date }));
    for (const m of moved) void patchTask(m.id, { due_date: to });
    toast(message, {
      action: { label: "ביטול", run: () => moved.forEach((m) => void patchTask(m.id, { due_date: m.was })) },
    });
  }
  const count = (n: number) => (n === 1 ? "משימה אחת" : `${n} משימות`);

  const todayOpen = plan.blocks.flatMap((b) => b.tasks).filter((t) => t.status !== "done");
  const hasToday = plan.blocks.some((b) => b.tasks.length);
  const evening = nowHM >= "19:00" && todayOpen.length > 0;

  return (
    <div className="space-y-3 sm:space-y-4">
      <DayNote />

      {plan.overdue.length > 0 && (
        <Leftovers
          tasks={plan.overdue}
          render={(t) => row(t)}
          onToday={() => moveAll(plan.overdue, today, `${count(plan.overdue.length)} עברו להיום`)}
          onTomorrow={() => moveAll(plan.overdue, addDays(today, 1), `${count(plan.overdue.length)} עברו למחר`)}
        />
      )}

      {evening && (
        <section className="flex flex-wrap items-center gap-3 rounded-3xl border border-indigo-200 bg-primary-soft p-4">
          <Moon size={22} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="font-bold">סוגרים את היום</div>
            <div className="text-sm text-muted">
              {plan.doneToday ? `סגרת היום ${plan.doneToday}. ` : ""}
              {todayOpen.length === 1 ? "נשארה משימה אחת." : `נשארו ${todayOpen.length}.`} זה בסדר, מעבירים למחר.
            </div>
          </div>
          <button
            onClick={() => moveAll(todayOpen, addDays(today, 1), `${count(todayOpen.length)} עברו למחר. לילה טוב 🌙`)}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white shadow-soft active:scale-95"
          >
            להעביר למחר
          </button>
        </section>
      )}

      {/* the day by the clock */}
      <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-soft">
        <header className="flex items-center justify-between gap-2 px-4 pb-1 pt-3.5">
          <h2 className="text-base font-bold">תוכנית היום</h2>
          <button
            onClick={onPlan}
            className="ms-auto flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 active:scale-95"
          >
            <Sun size={14} />
            לתכנן
          </button>
          <button
            onClick={() => openPaste()}
            className="flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary active:scale-95"
          >
            <ClipboardList size={14} />
            הדבקה / הכתבה
          </button>
        </header>
        {!hasToday ? (
          <div className="px-4 pb-5 pt-3 text-center">
            <p className="text-sm text-muted">אין עדיין משימות להיום.</p>
            <button
              onClick={() => openNewTask({ due_date: today })}
              className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-primary"
            >
              <Plus size={15} />
              משימה להיום
            </button>
          </div>
        ) : (
          <div className="pb-2">
            {plan.blocks
              .filter((b) => b.tasks.length)
              .map((b) => {
                const isNow = nowHM !== "" && b.key === plan.nowBlock;
                const left = b.tasks.filter((t) => t.status !== "done").length;
                return (
                  <div key={b.key} className="mt-1" data-block={b.key}>
                    <div className="flex items-center gap-2 px-4 pb-0.5 pt-2 text-xs font-bold text-muted">
                      <span className={cn(isNow && "text-primary")}>{b.label}</span>
                      <span className="font-medium">{b.range}</span>
                      {isNow && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-white">עכשיו</span>}
                      <span className="ms-auto font-medium">{left ? `${left} נשארו` : "✓ הכול בוצע"}</span>
                    </div>
                    <div className="px-1.5">{b.tasks.map((t) => row(t, true))}</div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {plan.waiting.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-purple-200 bg-surface shadow-soft" data-waiting>
          <header className="flex items-center gap-2 px-4 pb-1 pt-3">
            <Hourglass size={16} className="text-purple-600" />
            <span className="font-bold">מחכה לתשובה</span>
            <span className="rounded-full bg-purple-50 px-2 text-xs font-bold leading-5 text-purple-700">{plan.waiting.length}</span>
          </header>
          <p className="px-4 text-xs text-muted">לא תלוי בך כרגע. בתאריך של כל אחת: לבדוק אם ענו, ואם לא, לשלוח תזכורת.</p>
          <div className="px-1.5 pb-2">
            {plan.waiting.map((t) => row(t))}
          </div>
        </section>
      )}

      {plan.done.length > 0 && <DoneToday tasks={plan.done} />}

      <Horizon title="מחר" tasks={plan.tomorrow} render={(t) => row(t)} defaultOpen />
      <Horizon title="עד סוף השבוע" tasks={plan.week} render={(t) => row(t)} />
      <Horizon title="בהמשך" tasks={plan.later} render={(t) => row(t)} />
      <Horizon title="מתי שיהיה (בלי תאריך)" tasks={plan.someday} render={(t) => row(t)} />
    </div>
  );
}

/** One short line, written by the user (or by Claude when planning the day): what matters most today. */
function DayNote() {
  const { settings, today, setDayNote } = useData();
  const note = settings.day_note?.date === today ? settings.day_note.text : "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);

  if (editing)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setDayNote(draft);
          setEditing(false);
        }}
        className="rounded-3xl border border-amber-300 bg-amber-50 p-3"
      >
        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-amber-700">
          <Star size={14} />
          מה הכי חשוב היום?
        </label>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="למשל: לא לדחות את עמית. הריל חשוב, אבל לא ייקח את כל היום."
          className="w-full resize-none rounded-xl border border-amber-200 bg-surface p-2.5 text-[15px] outline-none focus:border-amber-400"
        />
        <div className="mt-2 flex gap-2">
          <button className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white">שמירה</button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-xl px-3 py-2 text-sm font-medium text-amber-700">
            ביטול
          </button>
        </div>
      </form>
    );

  if (!note)
    return (
      <button
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-amber-300 px-4 py-2.5 text-sm font-bold text-amber-700 active:bg-amber-50"
      >
        <Star size={16} />
        מה הכי חשוב היום? (שורה אחת)
      </button>
    );

  return (
    <button
      onClick={() => {
        setDraft(note);
        setEditing(true);
      }}
      className="block w-full rounded-3xl border border-amber-200 bg-gradient-to-l from-amber-50 to-orange-50 p-4 text-start shadow-soft"
      data-day-note
    >
      <span className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-700">
        <Star size={14} className="fill-amber-400 text-amber-500" />
        הכי חשוב היום
        <Pencil size={12} className="ms-auto opacity-60" />
      </span>
      <span className="block whitespace-pre-line text-[15px] font-medium leading-relaxed text-amber-950">{note}</span>
    </button>
  );
}

function Leftovers({
  tasks,
  render,
  onToday,
  onTomorrow,
}: {
  tasks: Task[];
  render: (t: Task) => React.ReactNode;
  onToday: () => void;
  onTomorrow: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-3xl border border-orange-200 bg-orange-50/70 p-4" data-leftovers>
      <div className="font-bold">
        {tasks.length === 1 ? "משימה אחת נשארה מימים קודמים" : `${tasks.length} משימות נשארו מימים קודמים`}
      </div>
      <p className="mt-0.5 text-sm text-muted">לא נורא. מה שכבר עשית, מסמנים. את השאר מעבירים.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 rounded-xl bg-surface px-3.5 py-2 text-sm font-bold shadow-soft active:scale-95">
          {open ? "לסגור" : "לעבור עליהן"}
          <ChevronDown size={15} className={cn("transition", open && "rotate-180")} />
        </button>
        <button onClick={onToday} className="rounded-xl bg-orange-500 px-3.5 py-2 text-sm font-bold text-white active:scale-95">
          הכול להיום
        </button>
        <button onClick={onTomorrow} className="rounded-xl border border-orange-300 px-3.5 py-2 text-sm font-bold text-orange-700 active:scale-95">
          הכול למחר
        </button>
      </div>
      {open && <div className="-mx-2 mt-2 rounded-2xl bg-surface p-1">{tasks.map(render)}</div>}
    </section>
  );
}

function Horizon({
  title,
  tasks,
  render,
  defaultOpen,
}: {
  title: string;
  tasks: Task[];
  render: (t: Task) => React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  if (!tasks.length) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft" data-horizon={title}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-start" aria-expanded={open}>
        <span className="font-bold">{title}</span>
        <span className="rounded-full bg-slate-100 px-2 text-xs font-bold leading-5 text-slate-600">{tasks.length}</span>
        <ChevronDown size={17} className={cn("ms-auto text-muted transition", open && "rotate-180")} />
      </button>
      {open && <div className="px-1.5 pb-2">{tasks.map(render)}</div>}
    </section>
  );
}

/** The day's wins, so progress is something you see (and the streak, when there is one). */
function DoneToday({ tasks }: { tasks: Task[] }) {
  const { tasks: all, today } = useData();
  const [open, setOpen] = useState(false);
  const streak = completionStreak(all, today);
  const n = tasks.length;
  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-l from-emerald-50 to-teal-50 shadow-soft" data-done-today>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-start" aria-expanded={open}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-soft">
          <Trophy size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-emerald-900">
            {n === 1 ? "עשית היום משימה אחת" : `עשית היום ${n} משימות`} {n >= 10 ? "🏆" : n >= 5 ? "🚀" : n >= 3 ? "🔥" : "👏"}
          </span>
          {streak >= 2 && <span className="block text-xs font-bold text-orange-600">{streak} ימים ברצף שאתה סוגר משימות</span>}
        </span>
        <ChevronDown size={17} className={cn("text-emerald-700 transition", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="space-y-1 px-4 pb-3">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-2 text-sm text-emerald-950">
              <span className="mt-0.5 text-emerald-500">✓</span>
              <span className="min-w-0">{t.title}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
