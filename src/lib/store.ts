import "server-only";
import { ensureSchema, sql } from "./db";
import { addDays, diffDays, isHHMM, isISO, todayISO, utcToZoned, zonedToUtcISO } from "./dates";
import { PRIORITY_KEYS, STATUS_KEYS, VIEW_KEYS, isClosed } from "./constants";
import { isRecurrence, nextDueDate, sanitizeChecklist } from "./recurrence";
import type { ChecklistItem, Priority, Recurrence, Settings, Space, Status, Task, ViewType } from "./types";

const TASK_COLS = `id, space_id, title, description, priority, status,
  to_char(due_date, 'YYYY-MM-DD') as due_date, to_char(due_time, 'HH24:MI') as due_time,
  status_note, checklist, recurrence, recurrence_n, is_event, position, created_at, completed_at`;

function mapTask(r: Record<string, unknown>): Task {
  return {
    id: r.id as number,
    space_id: r.space_id as number,
    title: r.title as string,
    description: (r.description as string) ?? "",
    priority: r.priority as Priority,
    status: r.status as Status,
    due_date: (r.due_date as string | null) ?? null,
    due_time: (r.due_time as string | null) ?? null,
    status_note: (r.status_note as string | null) ?? "",
    checklist: sanitizeChecklist(r.checklist),
    recurrence: isRecurrence(r.recurrence) ? r.recurrence : "none",
    recurrence_n: r.recurrence_n == null ? null : Number(r.recurrence_n),
    is_event: r.is_event === true,
    position: Number(r.position),
    created_at: new Date(r.created_at as string).toISOString(),
    completed_at: r.completed_at ? new Date(r.completed_at as string).toISOString() : null,
  };
}

function mapSpace(r: Record<string, unknown>): Space {
  return {
    id: r.id as number,
    name: r.name as string,
    color: r.color as string,
    view: r.view as ViewType,
    position: Number(r.position),
  };
}

export async function listSpaces(): Promise<Space[]> {
  await ensureSchema();
  const rows = await sql()`select id, name, color, view, position from ts_spaces order by position, id`;
  return rows.map(mapSpace);
}

export async function listTasks(spaceIds?: number[]): Promise<Task[]> {
  await ensureSchema();
  const db = sql();
  const rows =
    spaceIds === undefined
      ? await db.unsafe(`select ${TASK_COLS} from ts_tasks order by position, id`)
      : spaceIds.length === 0
        ? []
        : await db.unsafe(
            `select ${TASK_COLS} from ts_tasks where space_id = any($1::int[]) order by position, id`,
            [spaceIds],
          );
  return rows.map(mapTask);
}

export async function getTask(id: number): Promise<Task | null> {
  await ensureSchema();
  const rows = await sql().unsafe(`select ${TASK_COLS} from ts_tasks where id = $1`, [id]);
  return rows[0] ? mapTask(rows[0]) : null;
}

/* ------------------------------ spaces ------------------------------ */

export async function createSpace(input: { name: string; color?: string; view?: string }): Promise<Space> {
  await ensureSchema();
  const db = sql();
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("שם המרחב חסר");
  const view = VIEW_KEYS.includes(input.view as ViewType) ? (input.view as ViewType) : "todo";
  const color = /^#[0-9a-fA-F]{6}$/.test(input.color ?? "") ? input.color! : "#3b82f6";
  const [{ max }] = await db`select coalesce(max(position), 0)::float as max from ts_spaces`;
  const [row] = await db`
    insert into ts_spaces (name, color, view, position)
    values (${name}, ${color}, ${view}, ${Number(max) + 1})
    returning id, name, color, view, position`;
  return mapSpace(row);
}

export async function updateSpace(
  id: number,
  patch: { name?: string; color?: string; view?: string },
): Promise<Space | null> {
  await ensureSchema();
  const db = sql();
  const data: Record<string, string> = {};
  if (typeof patch.name === "string" && patch.name.trim()) data.name = patch.name.trim().slice(0, 60);
  if (typeof patch.color === "string" && /^#[0-9a-fA-F]{6}$/.test(patch.color)) data.color = patch.color;
  if (VIEW_KEYS.includes(patch.view as ViewType)) data.view = patch.view as string;
  const cols = Object.keys(data);
  if (cols.length) await db`update ts_spaces set ${db(data, ...cols)} where id = ${id}`;
  const rows = await db`select id, name, color, view, position from ts_spaces where id = ${id}`;
  return rows[0] ? mapSpace(rows[0]) : null;
}

export async function deleteSpace(id: number): Promise<void> {
  await ensureSchema();
  await sql()`delete from ts_spaces where id = ${id}`;
}

/* ------------------------------ tasks ------------------------------- */

export interface TaskInput {
  space_id: number;
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  due_date?: string | null;
  due_time?: string | null;
  status_note?: string;
  checklist?: unknown;
  recurrence?: string;
  recurrence_n?: number | null;
  is_event?: boolean;
  position?: number;
}

function cleanRecurrence(kind: unknown, n: unknown): { recurrence: Recurrence; recurrence_n: number | null } {
  const recurrence = isRecurrence(kind) ? kind : "none";
  const num = Number(n);
  const recurrence_n =
    recurrence === "every_n_days" ? (Number.isInteger(num) && num > 0 && num <= 365 ? num : 2) : null;
  return { recurrence, recurrence_n };
}

export async function createTask(input: TaskInput): Promise<Task> {
  await ensureSchema();
  const db = sql();
  const title = String(input.title ?? "").trim().slice(0, 300);
  if (!title) throw new Error("כותרת המשימה חסרה");
  const priority = PRIORITY_KEYS.includes(input.priority as Priority) ? input.priority! : "medium";
  const status = STATUS_KEYS.includes(input.status as Status) ? input.status! : "new";
  const rec = cleanRecurrence(input.recurrence, input.recurrence_n);
  // a recurring task always has a due date: the next copy is counted from it
  const due = isISO(input.due_date) ? input.due_date : rec.recurrence !== "none" ? todayISO() : null;
  const dueTime = due && isHHMM(input.due_time) ? input.due_time : null;
  const description = String(input.description ?? "").slice(0, 4000);
  const note = status === "not_done" ? String(input.status_note ?? "").trim().slice(0, 1000) : "";
  const checklist = sanitizeChecklist(input.checklist ?? []);
  let position = input.position;
  if (typeof position !== "number" || !Number.isFinite(position)) {
    const [{ max }] = await db`select coalesce(max(position), 0)::float as max from ts_tasks where space_id = ${input.space_id}`;
    position = Number(max) + 1;
  }
  const rows = await db.unsafe(
    `insert into ts_tasks (space_id, title, description, priority, status, due_date, due_time, position, status_note,
                           checklist, recurrence, recurrence_n, is_event, completed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13, ${status === "done" ? "now()" : "null"})
     returning ${TASK_COLS}`,
    [
      input.space_id,
      title,
      description,
      priority,
      status,
      due,
      dueTime,
      position,
      note,
      JSON.stringify(checklist),
      rec.recurrence,
      rec.recurrence_n,
      input.is_event === true,
    ] as never[],
  );
  return mapTask(rows[0]);
}

export interface TaskPatch {
  space_id?: number;
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  due_date?: string | null;
  due_time?: string | null;
  status_note?: string;
  checklist?: unknown;
  recurrence?: string;
  recurrence_n?: number | null;
  is_event?: boolean;
  position?: number;
}

export async function updateTask(id: number, patch: TaskPatch): Promise<Task | null> {
  return (await updateTaskFull(id, patch)).task;
}

type ReminderSnapshot = { remind_at: string; repeat: string; repeat_n: number | null };

/**
 * Applies a patch. When a recurring task becomes done, its next copy is created (with a new due date,
 * the steps un-ticked and the reminder moved along) and returned as `spawned`.
 */
export async function updateTaskFull(id: number, patch: TaskPatch): Promise<{ task: Task | null; spawned: Task | null }> {
  await ensureSchema();
  const db = sql();
  // Marking done is claimed atomically, so two clicks (or two devices) never create two next copies.
  let completedNow = false;
  let reminderBefore: ReminderSnapshot | null = null;
  if (patch.status === "done") {
    const rem = await db.unsafe(
      `select remind_at, repeat, repeat_n from ts_reminders where task_id = $1 and enabled order by id limit 1`,
      [id],
    );
    const claimed = await db.unsafe(
      `update ts_tasks set status = 'done', completed_at = coalesce(completed_at, now()), status_note = ''
        where id = $1 and status not in ('done', 'not_done') returning id`,
      [id],
    );
    completedNow = claimed.length > 0;
    if (rem[0]) {
      reminderBefore = {
        remind_at: new Date(rem[0].remind_at as string).toISOString(),
        repeat: rem[0].repeat as string,
        repeat_n: (rem[0].repeat_n as number | null) ?? null,
      };
    }
  }
  // The note says why a "not done" task wasn't done. It is optional: the user may add it later.
  let statusNote: string | undefined;
  if (patch.status === "not_done") {
    // keep the existing note unless a new one is given
    statusNote =
      typeof patch.status_note === "string" ? patch.status_note.trim() : ((await getTask(id))?.status_note ?? "");
    statusNote = statusNote.slice(0, 1000);
  } else if (STATUS_KEYS.includes(patch.status as Status)) {
    statusNote = ""; // moving to any other status drops the old note
  } else if (typeof patch.status_note === "string") {
    const current = await getTask(id);
    if (current?.status === "not_done") statusNote = patch.status_note.trim().slice(0, 1000);
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  const push = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (typeof patch.title === "string" && patch.title.trim()) push("title", patch.title.trim().slice(0, 300));
  if (typeof patch.description === "string") push("description", patch.description.slice(0, 4000));
  if (PRIORITY_KEYS.includes(patch.priority as Priority)) push("priority", patch.priority);
  if (patch.due_date === null || isISO(patch.due_date)) {
    if (patch.due_date !== undefined) push("due_date", patch.due_date);
    if (patch.due_date === null) push("due_time", null); // no date means no time either
  }
  if (patch.due_time === null || isHHMM(patch.due_time)) {
    if (patch.due_time !== undefined && patch.due_date !== null) push("due_time", patch.due_time);
  }
  if (typeof patch.space_id === "number") push("space_id", patch.space_id);
  if (typeof patch.position === "number" && Number.isFinite(patch.position)) push("position", patch.position);
  if (STATUS_KEYS.includes(patch.status as Status)) {
    push("status", patch.status);
    if (patch.status === "done") sets.push("completed_at = coalesce(completed_at, now())");
    else sets.push("completed_at = null");
  }
  if (statusNote !== undefined) push("status_note", statusNote);
  if (patch.checklist !== undefined) {
    vals.push(JSON.stringify(sanitizeChecklist(patch.checklist)));
    sets.push(`checklist = $${vals.length}::jsonb`);
  }
  if (typeof patch.is_event === "boolean") push("is_event", patch.is_event);
  if (isRecurrence(patch.recurrence)) {
    const rec = cleanRecurrence(patch.recurrence, patch.recurrence_n);
    push("recurrence", rec.recurrence);
    push("recurrence_n", rec.recurrence_n);
  }
  if (sets.length) {
    vals.push(id);
    await db.unsafe(`update ts_tasks set ${sets.join(", ")} where id = $${vals.length}`, vals as never[]);
  }
  // a closed task stops nagging: switch off its open reminders (re-opening the task doesn't bring them back)
  if (patch.status === "done" || patch.status === "not_done") {
    await db`update ts_reminders set enabled = false where task_id = ${id} and enabled`;
  }
  let task = await getTask(id);
  // an open recurring task always has a date (the next copy is counted from it)
  if (task && task.recurrence !== "none" && !task.due_date && !isClosed(task.status)) {
    await db`update ts_tasks set due_date = ${todayISO()} where id = ${id}`;
    task = await getTask(id);
  }
  let spawned: Task | null = null;
  if (task && completedNow && task.recurrence !== "none") {
    spawned = await spawnNext(task, reminderBefore);
  }
  return { task, spawned };
}

async function spawnNext(done: Task, reminder: ReminderSnapshot | null): Promise<Task> {
  const today = todayISO();
  const nextDue = nextDueDate(done.recurrence, done.recurrence_n, done.due_date, today)!;
  const next = await createTask({
    space_id: done.space_id,
    title: done.title,
    description: done.description,
    priority: done.priority,
    status: "new",
    due_date: nextDue,
    due_time: done.due_time,
    checklist: done.checklist.map((i: ChecklistItem) => ({ ...i, done: false })),
    recurrence: done.recurrence,
    recurrence_n: done.recurrence_n,
    is_event: done.is_event,
  });
  if (reminder) {
    // same time of day, and the same number of days before the due date as before
    const r = utcToZoned(reminder.remind_at);
    const daysBefore = done.due_date ? Math.max(0, diffDays(done.due_date, r.date)) : 0;
    let date = addDays(nextDue, -daysBefore);
    if (date < today) date = today;
    let remindAt = zonedToUtcISO(date, r.time);
    if (new Date(remindAt) <= new Date()) remindAt = zonedToUtcISO(nextDue, r.time);
    const repeatN = reminder.repeat === "every_n_days" ? reminder.repeat_n : null;
    await sql().unsafe(
      `insert into ts_reminders (task_id, title, remind_at, repeat, repeat_n) values ($1, $2, $3, $4, $5)`,
      [next.id, next.title.slice(0, 300), remindAt, reminder.repeat, repeatN] as never[],
    );
  }
  return next;
}

export async function deleteTask(id: number): Promise<void> {
  await ensureSchema();
  await sql()`delete from ts_tasks where id = ${id}`;
}

export async function deleteTasks(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  await ensureSchema();
  const rows = await sql().unsafe(`delete from ts_tasks where id = any($1::int[]) returning id`, [ids]);
  return rows.length;
}

/* ----------------------------- settings ----------------------------- */

export async function getSettings(): Promise<Settings> {
  await ensureSchema();
  const rows = await sql()`select key, value from ts_settings where key in ('dashboard_spaces', 'day_note')`;
  const read = (key: string): unknown => {
    let v = rows.find((r) => r.key === key)?.value;
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        v = null;
      }
    }
    return v;
  };
  const v = read("dashboard_spaces");
  const n = read("day_note") as { date?: unknown; text?: unknown } | null;
  return {
    dashboard_spaces: Array.isArray(v) ? (v as number[]) : null,
    day_note: n && isISO(n.date) && typeof n.text === "string" ? { date: n.date, text: n.text } : null,
  };
}

export async function setDayNote(note: { date: string; text: string } | null): Promise<void> {
  await ensureSchema();
  const db = sql();
  if (!note || !note.text.trim()) {
    await db`delete from ts_settings where key = 'day_note'`;
    return;
  }
  const clean = { date: note.date, text: note.text.trim().slice(0, 400) };
  await db`
    insert into ts_settings (key, value) values ('day_note', ${db.json(clean)})
    on conflict (key) do update set value = excluded.value`;
}

/**
 * The user's university courses (full names), kept in settings under `study_courses`.
 * The agent uses them to file an assignment under the right course.
 */
export async function getStudyCourses(): Promise<string[]> {
  await ensureSchema();
  const rows = await sql()`select value from ts_settings where key = 'study_courses'`;
  let v = rows[0]?.value;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

export async function setDashboardSpaces(ids: number[] | null): Promise<void> {
  await ensureSchema();
  const db = sql();
  if (ids === null) {
    await db`delete from ts_settings where key = 'dashboard_spaces'`;
    return;
  }
  const clean = ids.filter((n) => Number.isInteger(n));
  await db`
    insert into ts_settings (key, value) values ('dashboard_spaces', ${db.json(clean)})
    on conflict (key) do update set value = excluded.value`;
}

/* ----------------------------- timed-task nudges ----------------------------- */

/**
 * Open tasks for today whose time comes within the next `ahead` minutes (or passed in the last two),
 * claimed atomically so each is pushed once. Tasks that have their own reminder are left to it.
 */
export async function claimTimedNudges(ahead = 10): Promise<Pick<Task, "id" | "title" | "description" | "space_id" | "due_time">[]> {
  await ensureSchema();
  const now = utcToZoned(new Date().toISOString());
  const at = (min: number) => {
    const [h, m] = now.time.split(":").map(Number);
    const t = Math.min(Math.max(h * 60 + m + min, 0), 23 * 60 + 59);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };
  const rows = await sql().unsafe(
    `update ts_tasks t set nudged_for = $1::text || ' ' || to_char(t.due_time, 'HH24:MI')
     where t.due_date = $4::date and t.due_time is not null
       and t.due_time between $2::time and $3::time
       and t.status not in ('done', 'not_done') and not t.is_event
       and t.nudged_for is distinct from ($1::text || ' ' || to_char(t.due_time, 'HH24:MI'))
       and not exists (select 1 from ts_reminders r where r.task_id = t.id and r.enabled)
     returning t.id, t.title, t.description, t.space_id, to_char(t.due_time, 'HH24:MI') as due_time`,
    [now.date, at(-2), at(ahead), now.date],
  );
  return rows.map((r) => ({
    id: r.id as number,
    title: r.title as string,
    description: (r.description as string) ?? "",
    space_id: r.space_id as number,
    due_time: r.due_time as string,
  }));
}

/* ----------------------------- lock-screen wallpaper key ----------------------------- */

/**
 * The secret in the wallpaper link (an iPhone Shortcut fetches the image without a login).
 * `create` makes one on first use; `rotate` replaces it so an old link stops working.
 */
export async function wallpaperKey(mode: "read" | "create" | "rotate" = "read"): Promise<string | null> {
  await ensureSchema();
  const db = sql();
  if (mode !== "rotate") {
    const rows = await db`select value from ts_settings where key = 'wallpaper_key'`;
    let v = rows[0]?.value;
    if (typeof v === "string" && v.startsWith('"')) v = JSON.parse(v);
    if (typeof v === "string" && v.length >= 32) return v;
    if (mode === "read") return null;
  }
  const key = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await db`
    insert into ts_settings (key, value) values ('wallpaper_key', ${db.json(key)})
    on conflict (key) do update set value = excluded.value`;
  return key;
}
