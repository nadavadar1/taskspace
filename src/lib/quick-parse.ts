import { addDays, dayOfWeek, isISO } from "./dates";
import type { Priority, Recurrence, Space } from "./types";

/**
 * Reads a one-line task in everyday Hebrew, e.g. "להתקשר לסופי מחר ב-10:00 #לימודים דחוף",
 * and pulls out the date, time, priority, space and repeat. Runs in the browser, so it costs nothing.
 * Whatever is not understood stays in the title.
 */
export interface QuickParse {
  title: string;
  due_date: string | null;
  due_time: string | null;
  priority: Priority | null;
  space_id: number | null;
  recurrence: Recurrence;
  recurrence_n: number | null;
}

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
// Hebrew letters are not \w, so word edges are spelled out: start or whitespace before, end/space/punctuation after
const S = "(^|\\s)";
const E = "(?=$|[\\s,.!?;:])";

/** The next date (after today) that falls on `dow` (0 = Sunday). */
function nextWeekday(today: string, dow: number, allowToday = false): string {
  let diff = (dow - dayOfWeek(today) + 7) % 7;
  if (diff === 0 && !allowToday) diff = 7;
  return addDays(today, diff);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function normalize(s: string): string {
  return s.replace(/["'׳״`]/g, "").trim().toLowerCase();
}

export function findSpace(word: string, spaces: Space[]): Space | undefined {
  const w = normalize(word);
  if (!w) return undefined;
  return (
    spaces.find((s) => normalize(s.name) === w) ??
    spaces.find((s) => normalize(s.name).startsWith(w)) ??
    spaces.find((s) => normalize(s.name).includes(w))
  );
}

export function parseQuickTask(input: string, opts: { today: string; spaces: Space[] }): QuickParse {
  const { today, spaces } = opts;
  let s = ` ${input.replace(/\s+/g, " ")} `;
  const out: QuickParse = {
    title: "",
    due_date: null,
    due_time: null,
    priority: null,
    space_id: null,
    recurrence: "none",
    recurrence_n: null,
  };

  /** Finds the first match, removes it from the text and returns its groups (group 1 is always the left edge). */
  function take(pattern: string, accept?: (m: RegExpMatchArray) => boolean): RegExpMatchArray | null {
    const re = new RegExp(pattern);
    const m = s.match(re);
    if (!m || m.index === undefined) return null;
    if (accept && !accept(m)) return null;
    s = s.slice(0, m.index) + (m[1] ?? "") + " " + s.slice(m.index + m[0].length);
    return m;
  }

  /** "12.11" / "3/1/27" as a real date (the next one, when the year is left out), or null for e.g. 31/02. */
  function toDate(m: RegExpMatchArray): string | null {
    const d = Number(m[2]);
    const mo = Number(m[3]);
    let y = m[4] ? Number(m[4]) : Number(today.slice(0, 4));
    if (y < 100) y += 2000;
    let iso = `${y}-${pad(mo)}-${pad(d)}`;
    if (!m[4] && iso < today) iso = `${y + 1}-${pad(mo)}-${pad(d)}`;
    return isISO(iso) && new Date(iso).toISOString().slice(0, 10) === iso ? iso : null;
  }

  // ---- space: #name
  const sp = s.match(/(^|\s)[#@]([^\s#@,.!?]+)/);
  if (sp) {
    const space = findSpace(sp[2], spaces);
    if (space) {
      out.space_id = space.id;
      take(`${S}[#@]${sp[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
    }
  }

  // ---- repeat
  let m: RegExpMatchArray | null;
  const dayAlt = DAYS.join("|");
  if ((m = take(`${S}כל\\s+יום\\s+(${dayAlt})${E}`))) {
    out.recurrence = "weekly";
    out.due_date = nextWeekday(today, DAYS.indexOf(m[2]), true);
  } else if ((m = take(`${S}כל\\s+(\\d{1,3})\\s+(?:ימים|יום)${E}`))) {
    const n = Number(m[2]);
    out.recurrence = n === 1 ? "daily" : n === 7 ? "weekly" : "every_n_days";
    out.recurrence_n = out.recurrence === "every_n_days" ? n : null;
  } else if (take(`${S}כל\\s+יומיים${E}`)) {
    out.recurrence = "every_n_days";
    out.recurrence_n = 2;
  } else if (take(`${S}כל\\s+(?:כמה\\s+ימים)${E}`)) {
    out.recurrence = "every_n_days";
    out.recurrence_n = 3;
  } else if (take(`${S}(?:כל\\s+יום|יומי|יומית)${E}`)) {
    out.recurrence = "daily";
  } else if (take(`${S}(?:כל\\s+שבוע|שבועי|שבועית)${E}`)) {
    out.recurrence = "weekly";
  } else if (take(`${S}(?:כל\\s+שבועיים)${E}`)) {
    out.recurrence = "every_n_days";
    out.recurrence_n = 14;
  } else if (take(`${S}(?:כל\\s+חודש|חודשי|חודשית)${E}`)) {
    out.recurrence = "monthly";
  }

  // ---- time: 18:00, ב-18:00, בשעה 9, בשעה 9:30
  if ((m = take(`${S}(?:בשעה\\s+|ב-?|ב\\s)?([01]?\\d|2[0-3]):([0-5]\\d)${E}`))) {
    out.due_time = `${pad(Number(m[2]))}:${m[3]}`;
  } else if ((m = take(`${S}בשעה\\s+([01]?\\d|2[0-3])${E}`))) {
    out.due_time = `${pad(Number(m[2]))}:00`;
  }

  // ---- date
  if (!out.due_date) {
    if ((m = take(`${S}(?:ב-?|עד\\s+ה?-?|ל-?)?(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?${E}`, (x) => toDate(x) !== null))) {
      out.due_date = toDate(m);
    } else if (take(`${S}(?:ל|עד\\s+)?מחרתיים${E}`)) out.due_date = addDays(today, 2);
    else if (take(`${S}(?:ל|עד\\s+)?מחר${E}`)) out.due_date = addDays(today, 1);
    else if (take(`${S}(?:ל|עד\\s+)?(?:היום|הערב|הלילה)${E}`)) out.due_date = today;
    else if ((m = take(`${S}(?:ב|תוך\\s+)?עוד\\s+(\\d{1,3})\\s+(?:ימים|יום)${E}`))) out.due_date = addDays(today, Number(m[2]));
    else if (take(`${S}(?:ב|תוך\\s+)?עוד\\s+יומיים${E}`)) out.due_date = addDays(today, 2);
    else if (take(`${S}(?:ב|תוך\\s+)?עוד\\s+שבועיים${E}`)) out.due_date = addDays(today, 14);
    else if (take(`${S}(?:ב|תוך\\s+)?עוד\\s+שבוע${E}`) || take(`${S}(?:ב|ל)?שבוע\\s+הבא${E}`)) out.due_date = addDays(today, 7);
    else if (take(`${S}(?:ב|ל|עד\\s+)?סוף\\s+השבוע${E}`)) out.due_date = nextWeekday(today, 5, true);
    else if ((m = take(`${S}(?:ב|ל|עד\\s+)?יום\\s+(${dayAlt})(?:\\s+הבא)?${E}`))) out.due_date = nextWeekday(today, DAYS.indexOf(m[2]));
    else if (take(`${S}(?:ב|ל|עד\\s+)שבת${E}`)) out.due_date = nextWeekday(today, 6);
  }

  // ---- priority ("לא דחוף" before "דחוף")
  if (take(`${S}(?:לא\\s+דחוף|לא\\s+חשוב|עדיפות\\s+נמוכה)${E}`)) out.priority = "low";
  else if (take(`${S}(?:דחוף|דחופה|בדחיפות|!!!)${E}`)) out.priority = "urgent";
  else if (take(`${S}(?:חשוב|חשובה|עדיפות\\s+גבוהה|!!)${E}`)) out.priority = "high";
  else if (take(`${S}עדיפות\\s+בינונית${E}`)) out.priority = "medium";

  // a repeating task needs a start date
  if (out.recurrence !== "none" && !out.due_date) out.due_date = today;
  // a time with no date means today
  if (out.due_time && !out.due_date) out.due_date = today;

  out.title = s
    .replace(/\s+/g, " ")
    .replace(/^[\s,.\-–:]+|[\s,\-–:]+$/g, "")
    .trim();
  if (!out.title) out.title = input.trim();
  return out;
}
