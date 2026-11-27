"use client";

import { useData } from "./DataProvider";
import { StepCheck } from "./Checklist";
import { cn } from "./ui";
import type { Task } from "@/lib/types";

// shortcut: a routine is a task whose title says "רוטינה"; add a real flag if routines grow beyond morning/night
const isRoutine = (t: Task) => /רוטינ/.test(t.title);

/** The routine that fits the hour: the morning one until 15:00, the night one after; other routines always. */
export function routinesNow(open: Task[], today: string, nowHM: string): Task[] {
  const night = nowHM >= "15:00";
  return open.filter(
    (t) =>
      isRoutine(t) &&
      !!t.due_date &&
      t.due_date <= today &&
      (/בוקר/.test(t.title) ? !night : /לילה|ערב/.test(t.title) ? night : true),
  );
}

/** Top of "היום": the routine's steps, ready to tick. The last tick closes it until tomorrow. */
export function RoutineCard({ routines }: { routines: Task[] }) {
  const { patchTask, openTask } = useData();
  if (!routines.length) return null;
  return (
    <div className="mb-4 grid gap-3 sm:mb-5 lg:grid-cols-2" data-routines>
      {routines.map((t) => {
        const night = /לילה|ערב/.test(t.title);
        const steps = t.checklist;
        const done = steps.filter((s) => s.done).length;
        const toggle = (id: string) => {
          const checklist = steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s));
          patchTask(t.id, checklist.every((s) => s.done) ? { checklist, status: "done" } : { checklist });
        };
        return (
          <section key={t.id} className="overflow-hidden rounded-3xl border border-line bg-surface shadow-soft" aria-label={t.title}>
            <button
              type="button"
              onClick={() => openTask(t.id)}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-4 py-3 text-start text-white",
                night ? "bg-gradient-to-l from-indigo-600 to-violet-700" : "bg-gradient-to-l from-amber-400 to-orange-500",
              )}
            >
              <span className="text-base font-bold">{t.title}</span>
              {steps.length > 0 && (
                <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-bold">
                  {done}/{steps.length}
                </span>
              )}
            </button>
            <ul className="px-2 py-1.5">
              {steps.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <StepCheck done={s.done} size={24} onToggle={() => toggle(s.id)} />
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    className={cn("min-w-0 flex-1 text-start text-[15px]", s.done && "text-muted line-through")}
                  >
                    {s.text}
                  </button>
                </li>
              ))}
              {!steps.length && (
                <li className="px-2 py-2 text-sm text-muted">אין עדיין צעדים. לחיצה על הכותרת מוסיפה.</li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
