import { splitPaste } from "./day-plan";
import type { Space, Task } from "./types";

/**
 * One long message ("תוסיף לי משימות בצבא: אריג - ... / קריה - ... / לבדוק לאמא ...") → separate tasks,
 * each with the space it most likely belongs to. Plain rules in the browser: free and instant.
 * Space order: the heading it sits under ("משימות לצבא:") → the space named in the line ("לצבא") →
 * the space whose existing tasks share the most words with it → null (the sheet's fallback).
 */
export interface Piece {
  title: string;
  description: string;
  space_id: number | null;
}

const LETTERS = /[^֐-׿a-zA-Z0-9]+/;
const norm = (s: string) => s.replace(/["'׳״`]/g, "").trim().toLowerCase();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// shortcut: a fixed list of everyday verbs/fillers that say nothing about the topic; extend it if sorting misfires
const COMMON = new Set(
  "לבדוק להכין לשלוח לעשות לדבר לסיים להתקשר לקבוע לעבור למלא לשאול להמשיך לשלם לקנות לכתוב לצלם להעלות לתאם לסדר לראות לחשוב להגיש לדאוג המשך עדכון בדיקה צריך אפשר שאני אני לגבי האם מה איך את של עם על כל עוד גם יום היום מחר מחרתיים ראשון שני שלישי רביעי חמישי שישי שבת שבוע הבא בשעה ערב הערב בוקר".split(" "),
);

/** The topic words of a title; each comes with its form without a one-letter prefix, so "בקריה" meets "קריה". */
function words(text: string): string[][] {
  return norm(text)
    .split(LETTERS)
    .map((w) => (w.length > 3 && /^[והבלמשכ]/.test(w) ? [w, w.slice(1)] : [w]))
    .filter((forms) => forms[0].length >= 3 && !forms.some((f) => COMMON.has(f)));
}

/** The space this text names in so many words: "בצבא", "לימודים", "אינסטגרם אישי". */
function namedSpace(text: string, spaces: Space[]): number | null {
  const t = ` ${norm(text)} `;
  const hit = spaces.find((s) => new RegExp(`[\\s,.:(\\-](?:[והבלמש]|מה|וב|ול)?-?${esc(norm(s.name))}(?=[\\s,.:)!?\\-])`).test(t));
  return hit?.id ?? null;
}

/** "Learns" from the tasks already filed: a word seen in only one space counts 1, in two spaces ½, and so on. */
function learnedSpace(title: string, spaces: Space[], tasks: Task[]): number | null {
  const vocab = new Map<number, Set<string>>(spaces.map((s) => [s.id, new Set(words(s.name).flat())]));
  for (const t of tasks) {
    const v = vocab.get(t.space_id);
    if (v) for (const w of words(t.title).flat()) v.add(w);
  }
  const score = new Map<number, number>();
  for (const forms of words(title)) {
    const ids = [...vocab].filter(([, v]) => forms.some((w) => v.has(w))).map(([id]) => id);
    for (const id of ids) score.set(id, (score.get(id) ?? 0) + 1 / ids.length);
  }
  const [best, second] = [...score].sort((a, b) => b[1] - a[1]);
  return best && best[1] >= 1 && best[1] > (second?.[1] ?? 0) ? best[0] : null;
}

export function sortMessage(text: string, spaces: Space[], tasks: Task[]): Piece[] {
  const names = spaces.map((s) => esc(norm(s.name))).join("|") || "$^";
  // "תוסיף לצבא משימה נוספת -", "מעולה בנוסף תוסיף 2 משימות לצבא :": the asking part, not the task
  const ask = new RegExp(
    `^(?:(?:מעולה|בנוסף|וגם|גם|אז|ו?עוד\\s+דבר)[,\\s]+)*ו?(?:תוסיף|תרשום|תכניס|להוסיף|תוסיפו)(?:\\s+(?:לי|עוד|גם|\\d+|משימה|משימות|נוספת|נוספות|חדשה|חדשות|(?:[לב]|של)-?\\s?(?:${names})))*\\s*[-:–,]?\\s*`,
  );

  // " / " and inline numbering ("1 - להכין ... 2- להכין") also separate tasks
  let t = text.replace(/\s+\/\s+/g, "\n");
  const numbered = /(^|\s)\d{1,2}\s*[-–.)]\s*(?=[֐-׿])/gm;
  if ((t.match(numbered) ?? []).length >= 2) t = t.replace(numbered, "\n");

  let context: number | null = null;
  const out: Piece[] = [];
  for (const line of splitPaste(t)) {
    let title = line.title;
    const named = namedSpace(title, spaces);
    // "משימות לצבא: X": the heading sets the space for this line and the ones after it
    const colon = title.indexOf(":");
    if (colon > 0 && /משימ|תוסיף|תרשום/.test(title.slice(0, colon))) {
      context = namedSpace(title.slice(0, colon), spaces) ?? context;
      title = title.slice(colon + 1);
    }
    title = title.replace(ask, "").replace(/^[\s,.\-–:]+|[\s,\-–:]+$/g, "").trim();
    if (title.length < 2) continue;
    out.push({
      title,
      description: line.description,
      // the heading beats a space name inside the line: "קריה - המשך עבודה על..." under "משימות בצבא:" stays צבא
      space_id: context ?? named ?? learnedSpace(title, spaces, tasks),
    });
  }
  return out;
}
