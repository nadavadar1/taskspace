"use client";

import { Check } from "lucide-react";
import { useData } from "./DataProvider";
import { cn } from "./ui";
import { addDays, relativeLabel, startOfWeek } from "@/lib/dates";
import { coveredLabel } from "@/lib/recurrence";
import type { Task } from "@/lib/types";

/** True when this repeating task's current round is already done (the open copy is the next one). */
export function useCovered(task: Task): boolean {
  const { series } = useData();
  return !!series.get(task.id)?.covered;
}

/** Green pill on a repeating task that was already done for this round: "✓ בוצע היום · הבא: מחר". */
export function CoveredPill({ task }: { task: Task }) {
  const { series, today } = useData();
  const info = series.get(task.id);
  if (!info?.covered) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
      <Check size={12} strokeWidth={3} />
      {coveredLabel(info, task.recurrence, today)}
      {task.due_date && <span className="font-medium text-emerald-700/80">· הבא: {relativeLabel(task.due_date, today)}</span>}
    </span>
  );
}

/**
 * The last few rounds at a glance: one dot per day (daily / every few days) or per week (weekly),
 * filled green when it was done. Oldest on the right, today on the left (reading order).
 */
export function HabitDots({ task }: { task: Task }) {
  const { series, today } = useData();
  const info = series.get(task.id);
  if (!info || task.recurrence === "none" || task.recurrence === "monthly") return null;
  const days = info.doneDays;

  let cells: { key: string; on: boolean; now: boolean; label: string }[];
  if (task.recurrence === "weekly") {
    const thisWeek = startOfWeek(today);
    cells = Array.from({ length: 5 }, (_, i) => {
      const start = addDays(thisWeek, -7 * (4 - i));
      const on = [...days].some((d) => d >= start && d < addDays(start, 7));
      return { key: start, on, now: i === 4, label: i === 4 ? "השבוע" : `לפני ${4 - i} שבועות` };
    });
  } else {
    cells = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, -(6 - i));
      return { key: d, on: days.has(d), now: d === today, label: relativeLabel(d, today) };
    });
  }
  const count = cells.filter((c) => c.on).length;
  return (
    <span
      className="inline-flex items-center gap-[3px]"
      title={task.recurrence === "weekly" ? `בוצע ב-${count} מתוך 5 השבועות האחרונים` : `בוצע ב-${count} מתוך 7 הימים האחרונים`}
      aria-label={task.recurrence === "weekly" ? `בוצע ${count} מתוך 5 שבועות` : `בוצע ${count} מתוך 7 ימים`}
    >
      {cells.map((c) => (
        <span
          key={c.key}
          className={cn(
            "h-[7px] w-[7px] rounded-full",
            c.on ? "bg-emerald-500" : "bg-slate-200",
            c.now && "ring-1 ring-emerald-500 ring-offset-1 ring-offset-surface",
          )}
        />
      ))}
    </span>
  );
}
