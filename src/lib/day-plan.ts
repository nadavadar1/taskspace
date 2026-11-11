import { addDays, dayOfWeek } from "./dates";
import { PRIORITY_MAP } from "./constants";
import type { Task } from "./types";

/**
 * "My day": instead of every open task, the day as a plan by the clock (morning / noon / evening),
 * the one thing to do now, and the rest grouped by how soon (tomorrow / this week / later / no date).
 */
export type BlockKey = "morning" | "noon" | "evening" | "anytime";
export const BLOCKS: { key: BlockKey; label: string; range: string }[] = [
  { key: "morning", label: "בוקר", range: "עד 12:00" },
  { key: "noon", label: "צהריים", range: "12:00–17:00" },
  { key: "evening", label: "ערב", range: "מ-17:00" },
  { key: "anytime", label: "מתי שנוח היום", range: "בלי שעה" },
];

export function blockOf(time: string | null): BlockKey {
  if (!time) return "anytime";
  if (time < "12:00") return "morning";
  if (time < "17:00") return "noon";
  return "evening";
}

const rank = (t: Task) => PRIORITY_MAP[t.priority].rank;
/** by the clock, then importance; tasks without a time after the timed ones */
export const byClock = (a: Task, b: Task) =>
  (a.due_time ?? "99").localeCompare(b.due_time ?? "99") || rank(a) - rank(b) || a.id - b.id;
const byDate = (a: Task, b: Task) =>
  `${a.due_date ?? "9"} ${a.due_time ?? "99"}`.localeCompare(`${b.due_date ?? "9"} ${b.due_time ?? "99"}`) || rank(a) - rank(b);

export interface DayPlan {
  overdue: Task[];
  blocks: { key: BlockKey; label: string; range: string; tasks: Task[] }[];
  /** what to do now: the first open task of today by the clock (paused ones don't count) */
  now: Task | undefined;
  nowBlock: BlockKey;
  tomorrow: Task[];
  /** after tomorrow until Saturday */
  week: Task[];
  later: Task[];
  someday: Task[];
  /** paused = waiting for someone else's answer; kept apart, by follow-up date */
  waiting: Task[];
  doneToday: number;
  /** everything closed today, latest first: "what I did today" */
  done: Task[];
}

/**
 * @param open   the tasks still to do (no events, no repeating task already done for this round)
 * @param doneToday tasks closed today, shown struck through in their block so progress is visible
 */
export function planDay(all: Task[], doneToday: Task[], today: string, nowHM: string): DayPlan {
  const open = all.filter((t) => t.status !== "on_hold");
  const tomorrow = addDays(today, 1);
  const saturday = addDays(today, 6 - dayOfWeek(today));
  const todays = open.filter((t) => t.due_date === today).sort(byClock);
  const shown = [...todays, ...doneToday.filter((t) => t.due_date === today)].sort(byClock);
  const nowBlock = blockOf(nowHM);
  return {
    overdue: open.filter((t) => t.due_date && t.due_date < today).sort(byDate),
    blocks: BLOCKS.map((b) => ({ ...b, tasks: shown.filter((t) => blockOf(t.due_time) === b.key) })),
    now: todays[0],
    nowBlock,
    tomorrow: open.filter((t) => t.due_date === tomorrow).sort(byClock),
    week: open.filter((t) => t.due_date && t.due_date > tomorrow && t.due_date <= saturday).sort(byDate),
    later: open.filter((t) => t.due_date && t.due_date > saturday && t.due_date > tomorrow).sort(byDate),
    someday: open.filter((t) => !t.due_date).sort((a, b) => rank(a) - rank(b) || a.id - b.id),
    waiting: all.filter((t) => t.status === "on_hold").sort(byDate),
    doneToday: doneToday.length,
    done: [...doneToday].sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")),
  };
}

/**
 * Pasted or dictated text → task lines. Understands checklists ("[ ]", "☐", "-", "•", "1.") with an
 * explanation line under each item (as chat apps write them); without any markers, every line is a task.
 * Headings between groups ("דחוף להיום", "0/7") are dropped when the text uses markers.
 */
const MARK = /^\s*(?:[-*•▪◦–]\s*)?(?:\[\s?[xX✓ ]?\s?\]|☐|☑|✅|⬜|□|[-*•▪◦–]|\d{1,2}[.)])\s*/;
export function splitPaste(text: string): { title: string; description: string }[] {
  let lines = text.split(/\r?\n/).map((l) => l.trim());
  // dictation gives one long line with full stops: one sentence = one task
  if (lines.filter(Boolean).length === 1)
    lines = lines.join(" ").split(/(?<=[.!?])\s+/).map((l) => l.replace(/[.!?]+$/, "").trim());
  const marked = lines.some((l) => MARK.test(l) && l.replace(MARK, "").trim());
  const out: { title: string; description: string }[] = [];
  let gap = 0;
  for (const line of lines) {
    if (!line) {
      gap++;
      continue;
    }
    if (!marked) {
      out.push({ title: line, description: "" });
    } else if (MARK.test(line)) {
      const title = line.replace(MARK, "").trim();
      if (title) out.push({ title, description: "" });
    } else {
      // the first plain line right under an item explains it; anything else is a heading
      const last = out[out.length - 1];
      if (last && !last.description && gap <= 1 && !/^\d+\s*(\/|מתוך)\s*\d+$/.test(line)) last.description = line;
    }
    gap = 0;
  }
  return out.filter((t) => t.title.length > 1).slice(0, 60);
}
