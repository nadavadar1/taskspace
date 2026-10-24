import "server-only";
import type postgres from "postgres";
import { ensureSchema, sql } from "./db";
import { addDays, utcToZoned, zonedToUtcISO } from "./dates";
import { REPEAT_KINDS, taskDeadlineUTC } from "./reminder-utils";
import type { PushSubscriptionRecord, Reminder, RepeatKind } from "./types";

const REMINDER_COLS = `id, task_id, title, remind_at, repeat, repeat_n, last_sent_at, enabled, created_at`;
const REMINDER_COLS_R = REMINDER_COLS.split(",").map((c) => `r.${c.trim()}`).join(", ");
const REPEAT_KEYS = REPEAT_KINDS;

type Tx = postgres.TransactionSql;

function mapReminder(r: Record<string, unknown>): Reminder {
  return {
    id: r.id as number,
    task_id: (r.task_id as number | null) ?? null,
    title: r.title as string,
    remind_at: new Date(r.remind_at as string).toISOString(),
    repeat: r.repeat as RepeatKind,
    repeat_n: r.repeat_n === null || r.repeat_n === undefined ? null : Number(r.repeat_n),
    last_sent_at: r.last_sent_at ? new Date(r.last_sent_at as string).toISOString() : null,
    enabled: !!r.enabled,
    created_at: new Date(r.created_at as string).toISOString(),
  };
}

export interface ReminderInput {
  task_id?: number | null;
  title: string;
  remind_at: string; // ISO (UTC)
  repeat?: RepeatKind;
  repeat_n?: number | null;
}

export async function createReminder(input: ReminderInput): Promise<Reminder> {
  await ensureSchema();
  const db = sql();
  const title = String(input.title ?? "").trim().slice(0, 300);
  if (!title) throw new Error("כותרת התזכורת חסרה");
  const repeat = REPEAT_KEYS.includes(input.repeat as RepeatKind) ? (input.repeat as RepeatKind) : "none";
  const repeatN: number | null =
    repeat === "every_n_days" && Number.isInteger(input.repeat_n) && (input.repeat_n as number) > 0
      ? (input.repeat_n as number)
      : null;
  const taskId: number | null = Number.isInteger(input.task_id) ? (input.task_id as number) : null;
  const rows = await db.unsafe(
    `insert into ts_reminders (task_id, title, remind_at, repeat, repeat_n)
     values ($1,$2,$3,$4,$5)
     returning ${REMINDER_COLS}`,
    [taskId, title, input.remind_at, repeat, repeatN] as never[],
  );
  return mapReminder(rows[0]);
}

export async function listReminders(filter: { task_id?: number; enabled?: boolean } = {}): Promise<Reminder[]> {
  await ensureSchema();
  const db = sql();
  const conds: string[] = [];
  const vals: unknown[] = [];
  if (typeof filter.task_id === "number") {
    vals.push(filter.task_id);
    conds.push(`task_id = $${vals.length}`);
  }
  if (typeof filter.enabled === "boolean") {
    vals.push(filter.enabled);
    conds.push(`enabled = $${vals.length}`);
  }
  const where = conds.length ? `where ${conds.join(" and ")}` : "";
  const rows = await db.unsafe(`select ${REMINDER_COLS} from ts_reminders ${where} order by remind_at`, vals as never[]);
  return rows.map(mapReminder);
}

export async function listRemindersByIds(ids: number[]): Promise<Reminder[]> {
  if (!ids.length) return [];
  await ensureSchema();
  const rows = await sql().unsafe(`select ${REMINDER_COLS} from ts_reminders where id = any($1::int[])`, [ids]);
  return rows.map(mapReminder);
}

export async function deleteReminders(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  await ensureSchema();
  const rows = await sql().unsafe(`delete from ts_reminders where id = any($1::int[]) returning id`, [ids]);
  return rows.length;
}

/**
 * Moves a UTC instant by whole days while keeping the Israel wall-clock time, so a 09:00 reminder
 * stays at 09:00 when the clocks change (adding 24h would shift it by an hour).
 */
function addZonedDays(iso: string, days: number): string {
  const z = utcToZoned(iso);
  return zonedToUtcISO(addDays(z.date, days), z.time);
}

function nextOccurrence(r: Reminder): string | null {
  switch (r.repeat) {
    case "hourly":
      return new Date(new Date(r.remind_at).getTime() + 3600_000).toISOString();
    case "daily":
      return addZonedDays(r.remind_at, 1);
    case "weekly":
      return addZonedDays(r.remind_at, 7);
    case "every_n_days": {
      const n = r.repeat_n && r.repeat_n > 0 ? r.repeat_n : 1;
      return addZonedDays(r.remind_at, n);
    }
    default:
      return null;
  }
}

/**
 * The first occurrence after `now`, stepping from the *scheduled* time (not from "now") so the
 * schedule never drifts. Skipping past missed slots means a late cron tick sends one notification
 * instead of a burst of catch-up ones.
 */
function nextOccurrenceAfter(r: Reminder, now: Date): string | null {
  let cur = r;
  let next = nextOccurrence(cur);
  for (let i = 0; next && new Date(next) <= now && i < 10_000; i++) {
    cur = { ...cur, remind_at: next };
    next = nextOccurrence(cur);
  }
  return next;
}

/**
 * Atomically claims every reminder that is due and hasn't been sent yet, advancing repeating
 * ones to their next occurrence and disabling one-off ones. Runs inside `FOR UPDATE SKIP
 * LOCKED` so two overlapping cron ticks never claim — and send — the same reminder twice.
 * The caller should only push-notify for the reminders this function returns.
 *
 * A reminder linked to a task also stops when: the task is done, or (for repeating reminders)
 * the next occurrence would fall after the task's due date/time.
 */
export async function claimDueReminders(now: Date = new Date()): Promise<Reminder[]> {
  await ensureSchema();
  return sql().begin((tx) => claimWith(tx, now));
}

/** The claim logic on an open transaction. Exported so it can be exercised inside a transaction that is rolled back. */
export async function claimWith(tx: Tx, now: Date): Promise<Reminder[]> {
  // reminders of finished tasks never fire again
  await tx`update ts_reminders set enabled = false
           where enabled and task_id in (select id from ts_tasks where status = 'done')`;
  const rows = await tx.unsafe(
    `select ${REMINDER_COLS_R},
            to_char(t.due_date, 'YYYY-MM-DD') as t_due_date,
            to_char(t.due_time, 'HH24:MI') as t_due_time
     from ts_reminders r
     left join ts_tasks t on t.id = r.task_id
     where r.enabled and r.remind_at <= $1
       and (r.last_sent_at is null or r.last_sent_at < r.remind_at)
     order by r.remind_at
     for update of r skip locked`,
    [now.toISOString()],
  );
  const claimed: Reminder[] = [];
  for (const row of rows) {
    const r = mapReminder(row);
    const deadline = row.t_due_date
      ? taskDeadlineUTC({ due_date: row.t_due_date as string, due_time: (row.t_due_time as string | null) ?? null })
      : null;
    const repeating = r.repeat !== "none";
    // a repeating reminder that is already past the due date is dropped without sending
    if (repeating && deadline && new Date(r.remind_at) > new Date(deadline)) {
      await tx`update ts_reminders set enabled = false where id = ${r.id}`;
      continue;
    }
    let next = repeating ? nextOccurrenceAfter(r, now) : null;
    if (next && deadline && new Date(next) > new Date(deadline)) next = null;
    if (next) {
      await tx`update ts_reminders set last_sent_at = ${now.toISOString()}, remind_at = ${next} where id = ${r.id}`;
    } else {
      await tx`update ts_reminders set last_sent_at = ${now.toISOString()}, enabled = false where id = ${r.id}`;
    }
    claimed.push(r);
  }
  return claimed;
}

/** Enabled reminders only: what the app needs to show bells and to fill the task dialog. */
export async function listActiveReminders(): Promise<Reminder[]> {
  return listReminders({ enabled: true });
}

/** The reminder the task dialog edits: the oldest enabled one linked to the task. Mirrors `primaryReminder` on the client. */
async function primaryTaskReminderId(taskId: number): Promise<number | null> {
  const rows = await sql().unsafe(
    `select id from ts_reminders where task_id = $1 and enabled order by id limit 1`,
    [taskId],
  );
  return rows[0] ? (rows[0].id as number) : null;
}

/** Creates the task's reminder, or updates its existing one. Always re-arms it (clears last_sent_at). */
export async function upsertTaskReminder(
  taskId: number,
  title: string,
  input: { remind_at: string; repeat: RepeatKind; repeat_n?: number | null },
): Promise<Reminder> {
  await ensureSchema();
  const repeatN =
    input.repeat === "every_n_days" && Number.isInteger(input.repeat_n) && (input.repeat_n as number) > 0
      ? (input.repeat_n as number)
      : null;
  const existing = await primaryTaskReminderId(taskId);
  if (existing === null) {
    return createReminder({ task_id: taskId, title, remind_at: input.remind_at, repeat: input.repeat, repeat_n: repeatN });
  }
  const rows = await sql().unsafe(
    `update ts_reminders
       set title = $2, remind_at = $3, repeat = $4, repeat_n = $5, last_sent_at = null, enabled = true
     where id = $1
     returning ${REMINDER_COLS}`,
    [existing, title.slice(0, 300), input.remind_at, input.repeat, repeatN] as never[],
  );
  return mapReminder(rows[0]);
}

/** Deletes the task's primary reminder. Returns its id, or null when there was none. */
export async function removeTaskReminder(taskId: number): Promise<number | null> {
  await ensureSchema();
  const id = await primaryTaskReminderId(taskId);
  if (id === null) return null;
  await sql().unsafe(`delete from ts_reminders where id = $1`, [id]);
  return id;
}

/** Used only to preview a reminder's upcoming date in Israel time (debugging/agent replies). */
export function previewNextDates(remindAtISO: string, repeat: RepeatKind, repeatN: number | null, count: number): string[] {
  const out: string[] = [];
  let iso = remindAtISO;
  for (let i = 0; i < count; i++) {
    out.push(iso);
    const base = new Date(iso);
    if (repeat === "hourly") iso = new Date(base.getTime() + 3600_000).toISOString();
    else if (repeat === "daily") iso = addDays(iso.slice(0, 10), 1) + iso.slice(10);
    else if (repeat === "weekly") iso = new Date(base.getTime() + 7 * 24 * 3600_000).toISOString();
    else if (repeat === "every_n_days") iso = new Date(base.getTime() + (repeatN || 1) * 24 * 3600_000).toISOString();
    else break;
  }
  return out;
}

/* ------------------------------ push subscriptions ------------------------------ */

export async function savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
  await ensureSchema();
  await sql()`
    insert into ts_push_subscriptions (endpoint, p256dh, auth)
    values (${sub.endpoint}, ${sub.p256dh}, ${sub.auth})
    on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth`;
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await ensureSchema();
  await sql()`delete from ts_push_subscriptions where endpoint = ${endpoint}`;
}

export async function listPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  await ensureSchema();
  const rows = await sql()`select id, endpoint, p256dh, auth, created_at from ts_push_subscriptions`;
  return rows.map((r) => ({
    id: r.id as number,
    endpoint: r.endpoint as string,
    p256dh: r.p256dh as string,
    auth: r.auth as string,
    created_at: new Date(r.created_at as string).toISOString(),
  }));
}

export async function removePushSubscriptionById(id: number): Promise<void> {
  await ensureSchema();
  await sql()`delete from ts_push_subscriptions where id = ${id}`;
}
