import "server-only";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { ensureSchema, sql } from "./db";
import {
  addDays,
  diffDays,
  formatLong,
  HE_DAYS,
  isHHMM,
  isISO,
  nowHHMM,
  startOfWeek,
  todayISO,
  utcToZoned,
  zonedToUtcISO,
} from "./dates";
import { PRIORITY_KEYS, PRIORITY_MAP, STATUS_KEYS, STATUS_MAP } from "./constants";
import { createTask, deleteTasks, getStudyCourses, getTask, listSpaces, listTasks, updateTask } from "./store";
import { createReminder, deleteReminders, listReminders, listRemindersByIds } from "./reminders";
import type { AgentResponse, AgentScope, PendingInfo, Priority, RepeatKind, Space, Status, Task } from "./types";

type ChatMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

interface Ctx {
  allSpaces: Space[];
  scopeSpaces: Space[];
  single: Space | null;
  today: string;
  now: string; // HH:MM, Israel time
  courses: string[];
}

interface Out {
  actions: string[];
  mutated: boolean;
}

/* ------------------------------------------------------------------ */
/* Model + system prompt                                               */
/* ------------------------------------------------------------------ */

function modelName(): string {
  return (process.env.OPENAI_MODEL || "gpt-6-luna").replace(/^openai\//, "");
}

function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

function systemPrompt(ctx: Ctx): string {
  const dow = HE_DAYS[new Date(`${ctx.today}T12:00:00Z`).getUTCDay()];
  const scopeLine = ctx.single
    ? `הבחירה הנוכחית: מרחב אחד בלבד – "${ctx.single.name}". אתה רואה ופועל אך ורק על המשימות שלו.`
    : `הבחירה הנוכחית: כל המרחבים (${ctx.scopeSpaces.map((s) => `"${s.name}"`).join(", ") || "אין מרחבים"}).`;
  const coursesBlock = ctx.courses.length
    ? `
קורסים בלימודים (${ctx.courses.length}): ${ctx.courses.map((c) => `"${c}"`).join(", ")}.
כשהמשתמש מזכיר מטלה, הגשה, בוחן או מבחן של קורס (גם בשם קצר או באנגלית, למשל "קריפטו", "WEB", "סייבר"): התאם לקורס הקרוב ביותר ברשימה (אם יש ספק בין שני קורסים – שאל שאלה אחת). הוסף אותה עם add_tasks למרחב "לימודים" בכותרת בפורמט "<שם הקורס המלא> – <מה>" (למשל "חשבונאות – מטלה 3"), עם due_date לפי תאריך ההגשה. אם לא נאמר תאריך הגשה – שאל. עדיפות: urgent אם ההגשה בתוך יומיים, high אם בתוך שבוע, אחרת medium. בתיאור המשימה שים פרטים שנאמרו (אופן הגשה, ציון, הערות).
`
    : "";
  return `אתה "עוזר המשימות" – סוכן AI שמובנה בתוך מערכת אישית לניהול משימות. אתה עובד בעברית בלבד.

היום: יום ${dow}, ${ctx.today}. השעה עכשיו: ${ctx.now} (שעון ישראל). השבוע מתחיל ביום ראשון.
${scopeLine}

כללי עבודה:
1. תמיד תשתמש בכלים כדי לקרוא או לשנות משימות ותזכורות. לעולם אל תמציא משימות, מספרים או תאריכים.
2. לפני עדכון או מחיקה של משימה לפי שם – קרא קודם עם get_tasks כדי לקבל את המזהה (id).
3. אל תבקש אישור בעצמך. כשצריך (פעולה על יותר מ-3 משימות, מחיקת משימות או מחיקת תזכורת) המערכת מציגה למשתמש כפתורי אישור/ביטול. אתה פשוט קורא לכלי.
4. אם חסר פרט מהותי (למשל לאיזה מרחב להוסיף, כשנבחרו כל המרחבים, או שעה לא ברורה לתזכורת) – שאל שאלה קצרה אחת ותו לא.
5. תאריכים: המר ביטויים כמו "מחר", "יום חמישי הקרוב", "עד ה-10" לתאריך YYYY-MM-DD לפי היום שלמעלה. "עד ה-10" = ה-10 בחודש הקרוב שעוד לא עבר (החודש אם עוד לא עבר, אחרת החודש הבא).
6. עדיפות ברירת מחדל: medium. "דחוף" = urgent, "חשוב" = high.
7. אחרי כל פעולה – ענה במשפט או שניים: מה בוצע, עם מספרים. בלי חזרה על כל הפרטים.
8. בתשובות תשתמש בשמות בעברית (חדשה, בעבודה, בהשהייה, הושלמה; נמוכה, בינונית, גבוהה, דחוף) ולא בערכים באנגלית.
9. פורמט: טקסט פשוט. מותר **הדגשה** ורשימות שמתחילות ב"- ". בלי טבלאות ובלי כותרות.
10. תזכורות: ל"עוד X דקות/שעות" השתמש בפרמטר in_minutes (יחסי מהרגע הזה). לזמן מוחלט ("מחר ב-9", "ביום ראשון ב-14:00") קבע date (YYYY-MM-DD) ו-time (HH:MM) לפי התאריך והשעה שלמעלה. לתזכורת חוזרת ("כל ערב", "כל שבוע", "כל 3 ימים") השתמש בפרמטר repeat (daily/weekly/every_n_days) בקריאה אחת – אל תיצור כמה תזכורות בנפרד. אחרי קביעת תזכורת, ציין בקצרה את התאריך והשעה המדויקים שנקבעו (לפי שעון ישראל). אם מבקשים גם להוסיף משימה וגם להזכיר לפניה ("ותזכיר לי X דקות לפני") – קבע למשימה due_date+due_time והעבר ל-add_tasks גם reminder_minutes_before, בלי לקרוא בנוסף ל-add_reminder על אותה תזכורת.

${coursesBlock}
פנה למשתמש בלשון ניטרלית בלבד: שם פועל ("להתחיל בפתיחת המצגת") או ניסוח כללי. בלי לשון זכר או נקבה ("התחל" / "התחילי").

המשתמש מתמודד עם ADHD, לכן:
- תשובות קצרות וברורות. לא יותר מ-3 פריטים ברשימה, גם אם יש יותר (ציין "ועוד N").
- כשהמשתמש שואל מה חשוב, במה להתחיל או מבקש תכנון/סיכום – הצע צעד אחד קונקרטי להתחיל ממנו עכשיו, בניסוח של פעולה ("לפתוח את המצגת ולכתוב שקף ראשון"). אחרי פעולות פשוטות (הוספה, עדכון, מחיקה) אל תוסיף הצעת צעד, רק דווח מה בוצע.
- חגוג השלמות בקצרה. אל תאשים ואל תלחץ על איחורים – הצע לתזמן מחדש.
- כשמשימה גדולה או מעורפלת: הצע לפרק אותה ל-3 עד 5 צעדים קטנים (עד 10 דקות כל אחד), ואם המשתמש מבקש – הוסף אותם כמשימות עם add_tasks, בניסוח שמתחיל בפועל.
- לשאלות כמו "מה לעשות עכשיו" או "במה להתחיל" – השתמש ב-daily_briefing והמלץ על משימה אחת ראשונה, ואחריה עוד עד שתיים.`;
}

/* ------------------------------------------------------------------ */
/* Tool definitions                                                    */
/* ------------------------------------------------------------------ */

const filterProps = {
  space: { type: "string", description: "Space name. Optional; omit to use the whole current selection." },
  status: { type: "array", items: { type: "string", enum: STATUS_KEYS }, description: "Match any of these statuses." },
  priority: { type: "array", items: { type: "string", enum: PRIORITY_KEYS }, description: "Match any of these priorities." },
  due: {
    type: "string",
    enum: ["overdue", "today", "tomorrow", "this_week", "next_7_days", "none", "any"],
    description: "Due-date filter. overdue = before today and not done; none = no due date.",
  },
  search: { type: "string", description: "Text that must appear in the title." },
  include_done: { type: "boolean", description: "Include completed tasks. Default false unless status contains 'done'." },
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_tasks",
      description: "Read tasks inside the current selection. Use before updating/deleting by name.",
      parameters: {
        type: "object",
        properties: { ...filterProps, limit: { type: "integer", description: "Max results, default 50." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_tasks",
      description: "Add one or more tasks. 'space' is required when the selection is all spaces.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                space: { type: "string", description: "Space name" },
                priority: { type: "string", enum: PRIORITY_KEYS },
                status: { type: "string", enum: STATUS_KEYS },
                due_date: { type: "string", description: "YYYY-MM-DD" },
                due_time: { type: "string", description: "HH:MM, Israel time. Only meaningful together with due_date." },
                reminder_minutes_before: {
                  type: "integer",
                  description:
                    "If set (and due_date+due_time are set), also creates a one-off reminder this many minutes before the due date/time.",
                },
                description: { type: "string" },
              },
              required: ["title"],
            },
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_tasks",
      description:
        "Update existing tasks. Target them with task_ids OR a filter (an empty filter {} means all open tasks in the selection). Apply the same changes to every target.",
      parameters: {
        type: "object",
        properties: {
          task_ids: { type: "array", items: { type: "integer" } },
          filter: { type: "object", properties: filterProps },
          changes: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              status: { type: "string", enum: STATUS_KEYS },
              priority: { type: "string", enum: PRIORITY_KEYS },
              due_date: { type: ["string", "null"], description: "YYYY-MM-DD, or null to clear (also clears due_time)" },
              due_time: { type: ["string", "null"], description: "HH:MM, Israel time, or null to clear" },
              shift_days: { type: "integer", description: "Move the due date by N days (negative = earlier)" },
              space: { type: "string", description: "Move to this space (name)" },
            },
          },
        },
        required: ["changes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_tasks",
      description: "Delete tasks (by task_ids or filter). The user will be asked to confirm.",
      parameters: {
        type: "object",
        properties: {
          task_ids: { type: "array", items: { type: "integer" } },
          filter: { type: "object", properties: filterProps },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_tasks",
      description:
        "Statistics for the current selection: open/overdue/today/this-week counts, by status, priority and space, plus the top priorities.",
      parameters: { type: "object", properties: { space: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "daily_briefing",
      description:
        "ADHD-friendly daily summary: a short focus list (top 3 to do first), what is overdue, what is due today, what's coming up and quick wins. Use for 'what should I do now', 'daily summary', 'where do I start'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_reminder",
      description:
        "Create one reminder (optionally linked to a task, and optionally repeating). Resolve the exact fire time yourself: use in_minutes for 'in N minutes/hours' phrasing, or date+time for an absolute point ('tomorrow at 9', 'Sunday at 14:00').",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer", description: "Link this reminder to an existing task (use get_tasks to resolve the id by name first)." },
          title: { type: "string", description: "Required unless task_id is given, in which case it defaults to the task's title." },
          in_minutes: { type: "integer", description: "Fire this many minutes from right now. Use for relative phrasing like 'in two hours'." },
          date: { type: "string", description: "YYYY-MM-DD, Israel time. Use together with 'time' for an absolute date/time." },
          time: { type: "string", description: "HH:MM, Israel time. Required together with 'date'." },
          repeat: { type: "string", enum: ["none", "daily", "weekly", "every_n_days"], description: "Default none." },
          repeat_n: { type: "integer", description: "Required when repeat is every_n_days: repeat every N days." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_reminders",
      description: "List reminders, optionally only the ones linked to a given task.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "integer" },
          include_disabled: { type: "boolean", description: "Include one-off reminders already sent. Default false." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_reminder",
      description: "Delete one or more reminders by id. The user will be asked to confirm.",
      parameters: {
        type: "object",
        properties: {
          reminder_ids: { type: "array", items: { type: "integer" } },
        },
        required: ["reminder_ids"],
      },
    },
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

interface Filter {
  space?: string;
  status?: string[];
  priority?: string[];
  due?: string;
  search?: string;
  include_done?: boolean;
}

function norm(s: string): string {
  return s.replace(/["'״׳]/g, "").trim().toLowerCase();
}

function findSpace(name: string | undefined, ctx: Ctx): { space?: Space; error?: string } {
  const list = ctx.scopeSpaces;
  const names = list.map((s) => s.name).join(", ");
  if (!name || !name.trim()) {
    if (ctx.single) return { space: ctx.single };
    return { error: `Space is required. Ask the user which space. Available: ${names}` };
  }
  const q = norm(name);
  const variants = [q];
  if (/^[לבה]/.test(q) && q.length > 2) variants.push(q.slice(1));
  for (const v of variants) {
    const exact = list.find((s) => norm(s.name) === v);
    if (exact) return { space: exact };
  }
  for (const v of variants) {
    const part = list.filter((s) => norm(s.name).includes(v) || v.includes(norm(s.name)));
    if (part.length === 1) return { space: part[0] };
  }
  if (ctx.single) {
    return {
      error: `The current selection is only the space "${ctx.single.name}". The user can change the selection at the top of the chat.`,
    };
  }
  return { error: `No space matches "${name}". Available: ${names}` };
}

function applyFilter(tasks: Task[], f: Filter | undefined, ctx: Ctx): { tasks?: Task[]; error?: string } {
  const filter = f ?? {};
  let list = tasks;
  if (filter.space) {
    const r = findSpace(filter.space, ctx);
    if (r.error) return { error: r.error };
    list = list.filter((t) => t.space_id === r.space!.id);
  }
  const statuses = Array.isArray(filter.status) ? (filter.status.filter((s) => STATUS_KEYS.includes(s as Status))) : [];
  const priorities = Array.isArray(filter.priority)
    ? filter.priority.filter((p) => PRIORITY_KEYS.includes(p as Priority))
    : [];
  if (statuses.length) list = list.filter((t) => statuses.includes(t.status));
  else if (!filter.include_done) list = list.filter((t) => t.status !== "done");
  if (priorities.length) list = list.filter((t) => priorities.includes(t.priority));
  const today = ctx.today;
  const weekEnd = addDays(startOfWeek(today), 6);
  switch (filter.due) {
    case "overdue":
      list = list.filter((t) => t.due_date && t.due_date < today && t.status !== "done");
      break;
    case "today":
      list = list.filter((t) => t.due_date === today);
      break;
    case "tomorrow":
      list = list.filter((t) => t.due_date === addDays(today, 1));
      break;
    case "this_week":
      list = list.filter((t) => t.due_date && t.due_date >= today && t.due_date <= weekEnd);
      break;
    case "next_7_days":
      list = list.filter((t) => t.due_date && t.due_date >= today && t.due_date <= addDays(today, 7));
      break;
    case "none":
      list = list.filter((t) => !t.due_date);
      break;
  }
  if (filter.search && filter.search.trim()) {
    const q = norm(filter.search);
    list = list.filter((t) => norm(t.title).includes(q));
  }
  return { tasks: list };
}

function score(t: Task, today: string): number {
  if (t.status === "done") return -1;
  let s = 0;
  if (t.due_date) {
    const d = diffDays(t.due_date, today);
    if (d < 0) s += 100 + Math.min(30, -d);
    else if (d === 0) s += 80;
    else if (d === 1) s += 40;
    else if (d <= 3) s += 20;
  }
  if (t.priority === "urgent") s += 60;
  else if (t.priority === "high") s += 30;
  else if (t.priority === "medium") s += 10;
  if (t.status === "in_progress") s += 15;
  if (t.status === "on_hold") s -= 25;
  return s;
}

function compact(t: Task, ctx: Ctx) {
  const space = ctx.allSpaces.find((s) => s.id === t.space_id);
  return {
    id: t.id,
    title: t.title,
    space: space?.name ?? "",
    priority: PRIORITY_MAP[t.priority].label,
    status: STATUS_MAP[t.status].label,
    due_date: t.due_date,
    due_time: t.due_time,
    overdue: !!t.due_date && t.due_date < ctx.today && t.status !== "done",
  };
}

function sortTasks(list: Task[], ctx: Ctx): Task[] {
  return [...list].sort((a, b) => score(b, ctx.today) - score(a, ctx.today) || a.id - b.id);
}

/* ------------------------------------------------------------------ */
/* Tool preparation (resolve targets, decide whether to confirm)       */
/* ------------------------------------------------------------------ */

interface Prepared {
  args: Record<string, unknown>;
  error?: string;
  confirm?: { title: string; count: number; items: string[]; destructive: boolean };
}

function describeChanges(c: Record<string, unknown>): string {
  const bits: string[] = [];
  if (typeof c.status === "string" && STATUS_MAP[c.status as Status]) bits.push(`סטטוס ← ${STATUS_MAP[c.status as Status].label}`);
  if (typeof c.priority === "string" && PRIORITY_MAP[c.priority as Priority])
    bits.push(`עדיפות ← ${PRIORITY_MAP[c.priority as Priority].label}`);
  if (c.due_date === null) bits.push("הסרת תאריך יעד");
  else if (typeof c.due_date === "string") bits.push(`תאריך יעד ← ${c.due_date}`);
  if (typeof c.shift_days === "number") bits.push(`הזזת תאריך ב-${c.shift_days} ימים`);
  if (typeof c.title === "string") bits.push(`שם חדש: ${c.title}`);
  if (typeof c.space === "string") bits.push(`העברה למרחב ${c.space}`);
  return bits.join(", ");
}

function titlesPreview(tasks: { title: string }[]): string[] {
  const items = tasks.slice(0, 8).map((t) => t.title);
  if (tasks.length > 8) items.push(`ועוד ${tasks.length - 8}…`);
  return items;
}

async function resolveTargets(
  args: Record<string, unknown>,
  ctx: Ctx,
): Promise<{ tasks?: Task[]; error?: string }> {
  const all = await listTasks(ctx.scopeSpaces.map((s) => s.id));
  const ids = Array.isArray(args.task_ids) ? (args.task_ids as unknown[]).map(Number).filter(Number.isInteger) : [];
  if (ids.length) {
    const found = all.filter((t) => ids.includes(t.id));
    if (!found.length) return { error: "None of the given task_ids exist inside the current selection." };
    return { tasks: found };
  }
  if (args.filter && typeof args.filter === "object") return applyFilter(all, args.filter as Filter, ctx);
  return { error: "Provide task_ids or a filter (use {} for all open tasks in the selection)." };
}

async function prepare(name: string, raw: Record<string, unknown>, ctx: Ctx): Promise<Prepared> {
  if (name === "add_tasks") {
    const tasks = Array.isArray(raw.tasks) ? (raw.tasks as Record<string, unknown>[]) : [];
    if (!tasks.length) return { args: raw, error: "tasks is empty" };
    const titles = tasks.map((t) => ({ title: String(t.title ?? "") }));
    if (tasks.length > 3) {
      return {
        args: raw,
        confirm: { title: `להוסיף ${tasks.length} משימות?`, count: tasks.length, items: titlesPreview(titles), destructive: false },
      };
    }
    return { args: raw };
  }
  if (name === "update_tasks") {
    const changes = (raw.changes ?? {}) as Record<string, unknown>;
    if (!Object.keys(changes).length) return { args: raw, error: "changes is empty" };
    const r = await resolveTargets(raw, ctx);
    if (r.error) return { args: raw, error: r.error };
    const tasks = r.tasks!;
    if (!tasks.length) return { args: raw };
    const args = { ...raw, task_ids: tasks.map((t) => t.id), filter: undefined };
    if (tasks.length > 3) {
      const d = describeChanges(changes);
      return {
        args,
        confirm: {
          title: `לעדכן ${tasks.length} משימות${d ? ` (${d})` : ""}?`,
          count: tasks.length,
          items: titlesPreview(tasks),
          destructive: false,
        },
      };
    }
    return { args };
  }
  if (name === "delete_tasks") {
    const r = await resolveTargets(raw, ctx);
    if (r.error) return { args: raw, error: r.error };
    const tasks = r.tasks!;
    if (!tasks.length) return { args: raw };
    return {
      args: { task_ids: tasks.map((t) => t.id) },
      confirm: {
        title: tasks.length === 1 ? "למחוק משימה אחת?" : `למחוק ${tasks.length} משימות?`,
        count: tasks.length,
        items: titlesPreview(tasks),
        destructive: true,
      },
    };
  }
  if (name === "delete_reminder") {
    const ids = Array.isArray(raw.reminder_ids) ? (raw.reminder_ids as unknown[]).map(Number).filter(Number.isInteger) : [];
    if (!ids.length) return { args: raw, error: "reminder_ids is empty" };
    const reminders = await listRemindersByIds(ids);
    if (!reminders.length) return { args: raw, error: "None of the given reminder_ids exist." };
    return {
      args: { reminder_ids: reminders.map((r) => r.id) },
      confirm: {
        title: reminders.length === 1 ? "למחוק תזכורת אחת?" : `למחוק ${reminders.length} תזכורות?`,
        count: reminders.length,
        items: titlesPreview(reminders),
        destructive: true,
      },
    };
  }
  return { args: raw };
}

/* ------------------------------------------------------------------ */
/* Tool execution                                                      */
/* ------------------------------------------------------------------ */

async function execute(name: string, args: Record<string, unknown>, ctx: Ctx, out: Out): Promise<unknown> {
  switch (name) {
    case "get_tasks": {
      const all = await listTasks(ctx.scopeSpaces.map((s) => s.id));
      const r = applyFilter(all, args as Filter, ctx);
      if (r.error) return { error: r.error };
      const limit = Math.min(100, Math.max(1, Number(args.limit) || 50));
      const sorted = sortTasks(r.tasks!, ctx);
      return {
        count: sorted.length,
        truncated: sorted.length > limit,
        tasks: sorted.slice(0, limit).map((t) => compact(t, ctx)),
      };
    }

    case "add_tasks": {
      const list = Array.isArray(args.tasks) ? (args.tasks as Record<string, unknown>[]) : [];
      const created: ReturnType<typeof compact>[] = [];
      const errors: string[] = [];
      let remindersCreated = 0;
      for (const item of list) {
        const title = String(item.title ?? "").trim();
        if (!title) continue;
        const sp = findSpace(typeof item.space === "string" ? item.space : undefined, ctx);
        if (sp.error || !sp.space) {
          errors.push(`"${title}": ${sp.error}`);
          continue;
        }
        const dueDate = isISO(item.due_date) ? item.due_date : null;
        const dueTime = dueDate && isHHMM(item.due_time) ? item.due_time : null;
        const t = await createTask({
          space_id: sp.space.id,
          title,
          description: typeof item.description === "string" ? item.description : "",
          priority: typeof item.priority === "string" ? item.priority : "medium",
          status: typeof item.status === "string" ? item.status : "new",
          due_date: dueDate,
          due_time: dueTime,
        });
        created.push(compact(t, ctx));
        const minutesBefore = Number(item.reminder_minutes_before);
        if (t.due_date && t.due_time && Number.isFinite(minutesBefore) && minutesBefore >= 0) {
          const dueAt = zonedToUtcISO(t.due_date, t.due_time);
          const remindAt = new Date(new Date(dueAt).getTime() - minutesBefore * 60000).toISOString();
          await createReminder({ task_id: t.id, title: t.title, remind_at: remindAt });
          remindersCreated++;
        }
      }
      if (created.length) {
        out.mutated = true;
        out.actions.push(created.length === 1 ? "נוספה משימה אחת" : `נוספו ${created.length} משימות`);
      }
      if (remindersCreated) {
        out.actions.push(remindersCreated === 1 ? "נקבעה תזכורת אחת" : `נקבעו ${remindersCreated} תזכורות`);
      }
      return { added: created.length, tasks: created, errors };
    }

    case "update_tasks": {
      const changes = (args.changes ?? {}) as Record<string, unknown>;
      const r = await resolveTargets(args, ctx);
      if (r.error) return { error: r.error };
      let targetSpace: Space | undefined;
      if (typeof changes.space === "string" && changes.space) {
        const sp = findSpace(changes.space, ctx);
        if (sp.error) return { error: sp.error };
        targetSpace = sp.space;
      }
      if (changes.due_date !== undefined && changes.due_date !== null && !isISO(changes.due_date)) {
        return { error: "due_date must be YYYY-MM-DD or null" };
      }
      if (changes.due_time !== undefined && changes.due_time !== null && !isHHMM(changes.due_time)) {
        return { error: "due_time must be HH:MM or null" };
      }
      const updated: ReturnType<typeof compact>[] = [];
      for (const t of r.tasks!) {
        const patch: Record<string, unknown> = {};
        if (typeof changes.title === "string") patch.title = changes.title;
        if (typeof changes.description === "string") patch.description = changes.description;
        if (typeof changes.status === "string") patch.status = changes.status;
        if (typeof changes.priority === "string") patch.priority = changes.priority;
        if (changes.due_date !== undefined) patch.due_date = changes.due_date;
        else if (typeof changes.shift_days === "number") {
          patch.due_date = addDays(t.due_date ?? ctx.today, Math.trunc(changes.shift_days));
        }
        if (changes.due_time !== undefined) patch.due_time = changes.due_time;
        if (targetSpace) patch.space_id = targetSpace.id;
        const nt = await updateTask(t.id, patch);
        if (nt) updated.push(compact(nt, ctx));
      }
      if (updated.length) {
        out.mutated = true;
        out.actions.push(updated.length === 1 ? "עודכנה משימה אחת" : `עודכנו ${updated.length} משימות`);
      }
      return { updated: updated.length, tasks: updated.slice(0, 20) };
    }

    case "delete_tasks": {
      const r = await resolveTargets(args, ctx);
      if (r.error) return { error: r.error };
      const n = await deleteTasks(r.tasks!.map((t) => t.id));
      if (n) {
        out.mutated = true;
        out.actions.push(n === 1 ? "נמחקה משימה אחת" : `נמחקו ${n} משימות`);
      }
      return { deleted: n };
    }

    case "add_reminder": {
      let title = typeof args.title === "string" ? args.title.trim() : "";
      let taskId: number | null = null;
      if (Number.isInteger(args.task_id)) {
        const task = await getTask(Number(args.task_id));
        if (!task) return { error: `Task ${args.task_id} not found.` };
        taskId = task.id;
        if (!title) title = task.title;
      }
      if (!title) return { error: "title is required when task_id is not given" };

      let remindAt: string;
      if (Number.isInteger(args.in_minutes)) {
        remindAt = new Date(Date.now() + Number(args.in_minutes) * 60000).toISOString();
      } else if (isISO(args.date) && isHHMM(args.time)) {
        remindAt = zonedToUtcISO(args.date as string, args.time as string);
      } else {
        return { error: "Provide either in_minutes, or both date (YYYY-MM-DD) and time (HH:MM)." };
      }

      const repeat = (typeof args.repeat === "string" ? args.repeat : "none") as RepeatKind;
      if (!["none", "daily", "weekly", "every_n_days"].includes(repeat)) {
        return { error: "repeat must be none/daily/weekly/every_n_days" };
      }
      if (repeat === "every_n_days" && !(Number.isInteger(args.repeat_n) && Number(args.repeat_n) > 0)) {
        return { error: "repeat_n (a positive integer) is required when repeat is every_n_days" };
      }

      const r = await createReminder({
        task_id: taskId,
        title,
        remind_at: remindAt,
        repeat,
        repeat_n: repeat === "every_n_days" ? Number(args.repeat_n) : null,
      });
      out.mutated = true;
      const z = utcToZoned(r.remind_at);
      out.actions.push(`נקבעה תזכורת: ${formatLong(z.date)} בשעה ${z.time}`);
      return { reminder: { id: r.id, title: r.title, task_id: r.task_id, date: z.date, time: z.time, repeat: r.repeat, repeat_n: r.repeat_n } };
    }

    case "list_reminders": {
      const filter: { task_id?: number; enabled?: boolean } = {};
      if (Number.isInteger(args.task_id)) filter.task_id = Number(args.task_id);
      if (!args.include_disabled) filter.enabled = true;
      const reminders = await listReminders(filter);
      return {
        count: reminders.length,
        reminders: reminders.map((r) => {
          const z = utcToZoned(r.remind_at);
          return { id: r.id, title: r.title, task_id: r.task_id, date: z.date, time: z.time, repeat: r.repeat, repeat_n: r.repeat_n, enabled: r.enabled };
        }),
      };
    }

    case "delete_reminder": {
      const ids = Array.isArray(args.reminder_ids) ? (args.reminder_ids as unknown[]).map(Number).filter(Number.isInteger) : [];
      const n = await deleteReminders(ids);
      if (n) {
        out.mutated = true;
        out.actions.push(n === 1 ? "נמחקה תזכורת אחת" : `נמחקו ${n} תזכורות`);
      }
      return { deleted: n };
    }

    case "summarize_tasks": {
      let spaces = ctx.scopeSpaces;
      if (typeof args.space === "string" && args.space) {
        const sp = findSpace(args.space, ctx);
        if (sp.error) return { error: sp.error };
        spaces = [sp.space!];
      }
      const tasks = await listTasks(spaces.map((s) => s.id));
      return summarize(tasks, spaces, ctx);
    }

    case "daily_briefing": {
      const tasks = await listTasks(ctx.scopeSpaces.map((s) => s.id));
      return briefing(tasks, ctx);
    }

    default:
      return { error: `Unknown tool ${name}` };
  }
}

function summarize(tasks: Task[], spaces: Space[], ctx: Ctx) {
  const open = tasks.filter((t) => t.status !== "done");
  const weekStart = startOfWeek(ctx.today);
  const doneThisWeek = tasks.filter(
    (t) => t.status === "done" && t.completed_at && todayISO(new Date(t.completed_at)) >= weekStart,
  );
  const weekEnd = addDays(weekStart, 6);
  const count = <T,>(arr: T[], key: (x: T) => string) =>
    arr.reduce<Record<string, number>>((acc, x) => {
      const k = key(x);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  return {
    total_open: open.length,
    overdue: open.filter((t) => t.due_date && t.due_date < ctx.today).length,
    due_today: open.filter((t) => t.due_date === ctx.today).length,
    due_rest_of_week: open.filter((t) => t.due_date && t.due_date > ctx.today && t.due_date <= weekEnd).length,
    no_due_date: open.filter((t) => !t.due_date).length,
    done_this_week: doneThisWeek.length,
    by_status: count(tasks, (t) => STATUS_MAP[t.status].label),
    by_priority: count(open, (t) => PRIORITY_MAP[t.priority].label),
    by_space: spaces.map((s) => {
      const st = tasks.filter((t) => t.space_id === s.id);
      const so = st.filter((t) => t.status !== "done");
      return {
        space: s.name,
        open: so.length,
        overdue: so.filter((t) => t.due_date && t.due_date < ctx.today).length,
        done: st.length - so.length,
      };
    }),
    top_priorities: sortTasks(open, ctx).slice(0, 5).map((t) => compact(t, ctx)),
  };
}

function briefing(tasks: Task[], ctx: Ctx) {
  const open = tasks.filter((t) => t.status !== "done");
  const ranked = sortTasks(open, ctx);
  const weekStart = startOfWeek(ctx.today);
  const reason = (t: Task): string => {
    if (t.due_date && t.due_date < ctx.today) return "באיחור";
    if (t.due_date === ctx.today) return "להיום";
    if (t.priority === "urgent") return "דחוף";
    if (t.status === "in_progress") return "כבר התחלת אותה";
    return "עדיפות גבוהה";
  };
  const doneToday = tasks.filter(
    (t) => t.status === "done" && t.completed_at && todayISO(new Date(t.completed_at)) === ctx.today,
  );
  const doneWeek = tasks.filter(
    (t) => t.status === "done" && t.completed_at && todayISO(new Date(t.completed_at)) >= weekStart,
  );
  return {
    date: formatLong(ctx.today),
    counts: {
      open: open.length,
      overdue: open.filter((t) => t.due_date && t.due_date < ctx.today).length,
      due_today: open.filter((t) => t.due_date === ctx.today).length,
      done_today: doneToday.length,
      done_this_week: doneWeek.length,
    },
    focus_top3: ranked.slice(0, 3).map((t) => ({ ...compact(t, ctx), why: reason(t) })),
    overdue: sortTasks(open.filter((t) => t.due_date && t.due_date < ctx.today), ctx)
      .slice(0, 5)
      .map((t) => compact(t, ctx)),
    due_today: open.filter((t) => t.due_date === ctx.today).slice(0, 5).map((t) => compact(t, ctx)),
    coming_up: open
      .filter((t) => t.due_date && t.due_date > ctx.today && t.due_date <= addDays(ctx.today, 7))
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
      .slice(0, 5)
      .map((t) => compact(t, ctx)),
    quick_wins: open
      .filter((t) => t.priority === "low" || t.priority === "medium")
      .filter((t) => t.title.length <= 28)
      .slice(0, 3)
      .map((t) => compact(t, ctx)),
    celebrate: doneToday.slice(0, 3).map((t) => t.title),
  };
}

/* ------------------------------------------------------------------ */
/* The loop                                                            */
/* ------------------------------------------------------------------ */

interface PendingState {
  messages: ChatMsg[];
  calls: ToolCall[];
  scope: AgentScope;
}

async function buildCtx(scope: AgentScope): Promise<Ctx> {
  const [allSpaces, courses] = await Promise.all([listSpaces(), getStudyCourses()]);
  const single = scope.type === "space" ? (allSpaces.find((s) => s.id === scope.spaceId) ?? null) : null;
  return {
    allSpaces,
    single,
    scopeSpaces: single ? [single] : allSpaces,
    today: todayISO(),
    now: nowHHMM(),
    courses,
  };
}

function parseArgs(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

async function processCalls(
  messages: ChatMsg[],
  calls: ToolCall[],
  approvedFirst: boolean,
  ctx: Ctx,
  out: Out,
): Promise<{ pending?: { remaining: ToolCall[]; info: Omit<PendingInfo, "id"> } }> {
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const name = call.function.name;
    let args = parseArgs(call.function.arguments);
    let result: unknown;
    try {
      const prep = await prepare(name, args, ctx);
      args = prep.args;
      if (prep.error) {
        result = { error: prep.error };
      } else if (prep.confirm && !(i === 0 && approvedFirst)) {
        const remaining = calls.slice(i).map((c, k) =>
          k === 0 ? { ...c, function: { ...c.function, arguments: JSON.stringify(args) } } : c,
        );
        return { pending: { remaining, info: prep.confirm } };
      } else {
        result = await execute(name, args, ctx, out);
      }
    } catch (e) {
      console.error(`[agent] tool ${name} failed`, e);
      result = { error: "Tool failed unexpectedly" };
    }
    messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
  }
  return {};
}

async function drive(
  messages: ChatMsg[],
  pendingCalls: ToolCall[] | undefined,
  approvedFirst: boolean,
  ctx: Ctx,
  scope: AgentScope,
): Promise<AgentResponse> {
  const out: Out = { actions: [], mutated: false };
  const openai = client();
  let calls = pendingCalls;
  let approved = approvedFirst;

  for (let iter = 0; iter < 8; iter++) {
    if (calls?.length) {
      const r = await processCalls(messages, calls, approved, ctx, out);
      calls = undefined;
      approved = false;
      if (r.pending) {
        const id = randomUUID();
        const state: PendingState = { messages, calls: r.pending.remaining, scope };
        await sql()`insert into ts_agent_pending (id, state) values (${id}, ${sql().json(state as never)})`;
        await sql()`delete from ts_agent_pending where created_at < now() - interval '2 days'`;
        const info = r.pending.info;
        return {
          reply: info.destructive
            ? `${info.count === 1 ? "אני עומד למחוק משימה אחת" : `אני עומד למחוק ${info.count} משימות`}. לאשר?`
            : `הפעולה משפיעה על ${info.count} משימות. לאשר?`,
          actions: out.actions,
          mutated: out.mutated,
          pending: { id, ...info },
        };
      }
    }

    // gpt-6-luna rejects function tools on chat/completions unless reasoning is switched off
    const params = {
      model: modelName(),
      messages,
      tools: TOOLS as OpenAI.Chat.Completions.ChatCompletionTool[],
      reasoning_effort: process.env.OPENAI_REASONING_EFFORT || "none",
    };
    const completion = await openai.chat.completions.create(
      params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    );
    const msg = completion.choices[0]?.message;
    if (!msg) throw new Error("Empty completion");
    const toolCalls = (msg.tool_calls ?? []).filter((c) => c.type === "function") as unknown as ToolCall[];
    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    } as ChatMsg);

    if (toolCalls.length) {
      calls = toolCalls;
      continue;
    }
    const text = (msg.content ?? "").trim();
    return {
      reply: text || (out.actions.length ? `${out.actions.join(", ")}.` : "אין לי מה להוסיף."),
      actions: out.actions,
      mutated: out.mutated,
    };
  }
  return {
    reply: out.actions.length ? `${out.actions.join(", ")}.` : "לא הצלחתי להשלים את הבקשה, אפשר לנסח אותה שוב?",
    actions: out.actions,
    mutated: out.mutated,
  };
}

export async function runAgent(input: {
  history: { role: "user" | "assistant"; content: string }[];
  scope: AgentScope;
}): Promise<AgentResponse> {
  await ensureSchema();
  const ctx = await buildCtx(input.scope);
  const messages: ChatMsg[] = [
    { role: "system", content: systemPrompt(ctx) },
    ...input.history.slice(-20).map((m) => ({ role: m.role, content: m.content }) as ChatMsg),
  ];
  return drive(messages, undefined, false, ctx, input.scope);
}

export async function resolvePending(id: string, approve: boolean): Promise<AgentResponse> {
  await ensureSchema();
  const db = sql();
  const rows = await db`delete from ts_agent_pending where id = ${id} returning state`;
  if (!rows.length) {
    return { reply: "הבקשה הזו כבר טופלה או פגה. אפשר לבקש שוב.", actions: [], mutated: false };
  }
  const raw = rows[0].state as PendingState | string;
  const state: PendingState = typeof raw === "string" ? JSON.parse(raw) : raw;
  const ctx = await buildCtx(state.scope);
  const messages = state.messages;
  if (!approve) {
    for (const c of state.calls) {
      messages.push({
        role: "tool",
        tool_call_id: c.id,
        content: JSON.stringify({ cancelled: true, note: "The user declined. Nothing was changed." }),
      });
    }
    return drive(messages, undefined, false, ctx, state.scope);
  }
  return drive(messages, state.calls, true, ctx, state.scope);
}
