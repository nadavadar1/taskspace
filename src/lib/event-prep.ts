import { addDays, dayOfWeek, diffDays } from "./dates";

/**
 * "פאדל ברמת גן היום 20-21:30" or "דיון בחמישי 14-16, נדרש להכין מצגת": what to get ready and when.
 * Plain rules by keyword, run in the browser: free, instant, and the user ticks off what they don't want.
 */
export type EventKind = "sport" | "meeting" | "exam" | "appointment" | "social";

export interface PrepTask {
  title: string;
  due_date: string;
  due_time: string | null;
  /** one short line: why this, why then */
  why: string;
}

const KINDS: [EventKind, RegExp][] = [
  ["sport", /פאדל|טניס|כדורגל|כדורסל|אימון|ריצה|שחי[יו]ה|חדר כושר|יוגה|פילאטיס/],
  ["exam", /מבחן|בחינה|בוחן/],
  ["meeting", /דיון|פגישה|ישיבה|ראיון|שיחת|זום|הרצאה|כנס|סדנה|הדרכה|מצגת/],
  ["appointment", /רופא|מרפאה|קופת חולים|מספרה|טיפול|שיניים|(^|\s)תור(\s|$)/],
  ["social", /יום הולדת|חתונה|ארוחת|מסיבה|הופעה|סרט|דייט/],
];

export const KIND_LABEL: Record<EventKind, string> = {
  sport: "ספורט",
  exam: "מבחן",
  meeting: "פגישה",
  appointment: "תור",
  social: "בילוי",
};

export function eventKind(text: string): EventKind | null {
  return KINDS.find(([, re]) => re.test(text))?.[0] ?? null;
}

function minus(time: string, minutes: number): string | null {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m - minutes;
  return t < 0 ? null : `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function gear(title: string): string {
  if (/פאדל|טניס/.test(title)) return "מחבט, כדורים, נעליים, מים ומגבת";
  if (/כדורגל/.test(title)) return "נעליים, גרביים ומים";
  if (/שחי[יו]ה/.test(title)) return "בגד ים, מגבת, משקפת וכפכפים";
  return "בגדים, נעליים, מים ומגבת";
}

/** Fri/Sat are the weekend here: a work session that lands on one moves back to Thursday. */
function weekday(date: string): string {
  const dow = dayOfWeek(date);
  return dow === 5 ? addDays(date, -1) : dow === 6 ? addDays(date, -2) : date;
}

/**
 * The prep tasks for an event at `date` `time`. `note` is what came after "נדרש / צריך" ("להכין מצגת סיכום שנה").
 * Anything that would already be in the past is left out.
 */
export function planPrep(
  title: string,
  note: string,
  date: string,
  time: string,
  today: string,
  nowHM: string,
): { kind: EventKind | null; prep: PrepTask[] } {
  const kind = eventKind(`${title} ${note}`);
  const name = title.split(/\s+/).slice(0, 5).join(" ");
  const days = diffDays(date, today);
  const prep: PrepTask[] = [];
  const at = (t: string, minutes: number, why: string) => {
    const tm = minus(time, minutes);
    if (tm) prep.push({ title: t, due_date: date, due_time: tm, why });
  };
  const on = (d: string, t: string, why: string, tm: string | null = null) => prep.push({ title: t, due_date: d, due_time: tm, why });

  // "להכין מצגת סיכום שנה" → a work plan for the thing, spread over the days left
  const make = note.match(/להכין\s+(?:את\s+)?(.+)/)?.[1]?.replace(/[.,]+$/, "").trim();
  if (make) {
    if (days >= 4) {
      const start = weekday(addDays(date, -4)) > today ? weekday(addDays(date, -4)) : addDays(today, 1);
      on(start, `להתחיל: ${make}`, "ממליץ להתחיל כאן: נשארים כמה ימים לעבודה בלי לחץ");
      const finish = addDays(date, -2);
      if (finish > start) on(finish, `לסיים: ${make}`, "יומיים לפני, כדי שיהיה מרווח לתיקונים");
      on(addDays(date, -1), `לעבור על ${make} ולהתאמן`, "יום לפני: חזרה אחרונה");
    } else if (days >= 2) {
      on(addDays(today, 1), `להכין: ${make}`, "אין הרבה זמן, אז מתחילים מחר");
      on(addDays(date, -1), `לעבור על ${make}`, "יום לפני: חזרה אחרונה");
    } else if (days === 1) {
      on(today, `להכין: ${make}`, "זה מחר, אז היום");
    } else if (days === 0) {
      at(`להכין: ${make}`, 180, "שלוש שעות לפני");
    }
  }

  if (kind === "sport") {
    at(`לאכול לפני ה${name}`, 90, "שעה וחצי לפני, כדי לא לשחק על בטן מלאה");
    at(`להכין ציוד: ${gear(title)}`, 60, "שעה לפני");
    at(`לצאת ל${name}`, 30, "חצי שעה לפני. אם הדרך ארוכה, להקדים");
  } else if (kind === "meeting") {
    if (days >= 1 && !make) on(addDays(date, -1), `להתכונן ל${name}`, "ערב לפני: מה המטרה ומה אני רוצה להגיד", "20:00");
    at(`לוודא שאני מוכן ל${name}`, 60, "שעה לפני: חומרים, קישור, מקום");
  } else if (kind === "exam") {
    if (days >= 6) on(weekday(addDays(date, -5)), `להתחיל ללמוד ל${name}`, "חמישה ימים לפני");
    if (days >= 2) on(addDays(date, -1), `חזרה אחרונה ל${name}`, "יום לפני");
    at(`לצאת ל${name}`, 45, "עם תעודה ומה שמותר להכניס");
  } else if (kind === "appointment") {
    at(`לצאת ל${name}`, 30, "חצי שעה לפני");
  } else if (kind === "social") {
    at(`להתארגן ל${name}`, 60, "שעה לפני");
  }

  return {
    kind,
    prep: prep.filter((p) => p.due_date > today || (p.due_date === today && (!p.due_time || p.due_time > nowHM))),
  };
}
