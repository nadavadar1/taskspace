import "server-only";
import { ensureSchema, sql } from "./db";
import { addDays } from "./dates";
import type { PushSubscriptionRecord, Reminder, RepeatKind } from "./types";

const REMINDER_COLS = `id, task_id, title, remind_at, repeat, repeat_n, last_sent_at, enabled, created_at`;
const REPEAT_KEYS: RepeatKind[] = ["none", "daily", "weekly", "every_n_days"];

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

function nextOccurrence(r: Reminder): string | null {
  const base = new Date(r.remind_at);
  switch (r.repeat) {
    case "daily":
      return new Date(base.getTime() + 24 * 3600_000).toISOString();
    case "weekly":
      return new Date(base.getTime() + 7 * 24 * 3600_000).toISOString();
    case "every_n_days": {
      const n = r.repeat_n && r.repeat_n > 0 ? r.repeat_n : 1;
      return new Date(base.getTime() + n * 24 * 3600_000).toISOString();
    }
    default:
      return null;
  }
}

/**
 * Atomically claims every reminder that is due and hasn't been sent yet, advancing repeating
 * ones to their next occurrence (computed from the *scheduled* time, not "now", so a late cron
 * tick doesn't drift the schedule) and disabling one-off ones. Runs inside `FOR UPDATE SKIP
 * LOCKED` so two overlapping cron ticks never claim — and send — the same reminder twice.
 * The caller should only push-notify for the reminders this function returns.
 */
export async function claimDueReminders(now: Date = new Date()): Promise<Reminder[]> {
  await ensureSchema();
  const db = sql();
  return db.begin(async (tx) => {
    const rows = await tx.unsafe(
      `select ${REMINDER_COLS} from ts_reminders
       where enabled and remind_at <= $1
         and (last_sent_at is null or last_sent_at < remind_at)
       order by remind_at
       for update skip locked`,
      [now.toISOString()],
    );
    const claimed = rows.map(mapReminder);
    for (const r of claimed) {
      const next = nextOccurrence(r);
      if (next) {
        await tx`update ts_reminders set last_sent_at = ${now.toISOString()}, remind_at = ${next} where id = ${r.id}`;
      } else {
        await tx`update ts_reminders set last_sent_at = ${now.toISOString()}, enabled = false where id = ${r.id}`;
      }
    }
    return claimed;
  });
}

/** Used only to preview a reminder's upcoming date in Israel time (debugging/agent replies). */
export function previewNextDates(remindAtISO: string, repeat: RepeatKind, repeatN: number | null, count: number): string[] {
  const out: string[] = [];
  let iso = remindAtISO;
  for (let i = 0; i < count; i++) {
    out.push(iso);
    const base = new Date(iso);
    if (repeat === "daily") iso = addDays(iso.slice(0, 10), 1) + iso.slice(10);
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
