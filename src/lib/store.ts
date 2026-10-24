import "server-only";
import { ensureSchema, sql } from "./db";
import { isHHMM, isISO } from "./dates";
import { PRIORITY_KEYS, STATUS_KEYS, VIEW_KEYS } from "./constants";
import type { Priority, Settings, Space, Status, Task, ViewType } from "./types";

const TASK_COLS = `id, space_id, title, description, priority, status,
  to_char(due_date, 'YYYY-MM-DD') as due_date, to_char(due_time, 'HH24:MI') as due_time,
  position, created_at, completed_at`;

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
  position?: number;
}

export async function createTask(input: TaskInput): Promise<Task> {
  await ensureSchema();
  const db = sql();
  const title = String(input.title ?? "").trim().slice(0, 300);
  if (!title) throw new Error("כותרת המשימה חסרה");
  const priority = PRIORITY_KEYS.includes(input.priority as Priority) ? input.priority! : "medium";
  const status = STATUS_KEYS.includes(input.status as Status) ? input.status! : "new";
  const due = isISO(input.due_date) ? input.due_date : null;
  const dueTime = due && isHHMM(input.due_time) ? input.due_time : null;
  const description = String(input.description ?? "").slice(0, 4000);
  let position = input.position;
  if (typeof position !== "number" || !Number.isFinite(position)) {
    const [{ max }] = await db`select coalesce(max(position), 0)::float as max from ts_tasks where space_id = ${input.space_id}`;
    position = Number(max) + 1;
  }
  const rows = await db.unsafe(
    `insert into ts_tasks (space_id, title, description, priority, status, due_date, due_time, position, completed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, ${status === "done" ? "now()" : "null"})
     returning ${TASK_COLS}`,
    [input.space_id, title, description, priority, status, due, dueTime, position],
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
  position?: number;
}

export async function updateTask(id: number, patch: TaskPatch): Promise<Task | null> {
  await ensureSchema();
  const db = sql();
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
  if (sets.length) {
    vals.push(id);
    await db.unsafe(`update ts_tasks set ${sets.join(", ")} where id = $${vals.length}`, vals as never[]);
  }
  return getTask(id);
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
  const rows = await sql()`select value from ts_settings where key = 'dashboard_spaces'`;
  let v = rows[0]?.value;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  return { dashboard_spaces: Array.isArray(v) ? (v as number[]) : null };
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
