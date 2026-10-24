import "server-only";
import postgres from "postgres";
import { addDays, todayISO } from "./dates";

const g = globalThis as unknown as {
  __tsSql?: postgres.Sql;
  __tsReady?: Promise<void>;
};

export function sql(): postgres.Sql {
  if (!g.__tsSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /@(localhost|127\.0\.0\.1)/.test(url);
    g.__tsSql = postgres(url, {
      ssl: local ? false : "require",
      max: 3,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
  }
  return g.__tsSql;
}

async function init(): Promise<void> {
  const db = sql();
  await db`
    create table if not exists ts_spaces (
      id serial primary key,
      name text not null,
      color text not null default '#3b82f6',
      view text not null default 'todo',
      position double precision not null default 0,
      created_at timestamptz not null default now()
    )`;
  await db`
    create table if not exists ts_tasks (
      id serial primary key,
      space_id integer not null references ts_spaces(id) on delete cascade,
      title text not null,
      description text not null default '',
      priority text not null default 'medium',
      status text not null default 'new',
      due_date date,
      position double precision not null default 0,
      created_at timestamptz not null default now(),
      completed_at timestamptz
    )`;
  await db`alter table ts_tasks add column if not exists due_time time`;
  await db`alter table ts_tasks add column if not exists status_note text not null default ''`;
  await db`create index if not exists ts_tasks_space_idx on ts_tasks(space_id)`;
  await db`
    create table if not exists ts_settings (
      key text primary key,
      value jsonb not null
    )`;
  await db`
    create table if not exists ts_agent_pending (
      id text primary key,
      state jsonb not null,
      created_at timestamptz not null default now()
    )`;
  await db`
    create table if not exists ts_reminders (
      id serial primary key,
      task_id integer references ts_tasks(id) on delete cascade,
      title text not null,
      remind_at timestamptz not null,
      repeat text not null default 'none',
      repeat_n integer,
      last_sent_at timestamptz,
      enabled boolean not null default true,
      created_at timestamptz not null default now()
    )`;
  await db`create index if not exists ts_reminders_due_idx on ts_reminders(remind_at) where enabled`;
  await db`create index if not exists ts_reminders_task_idx on ts_reminders(task_id)`;
  await db`
    create table if not exists ts_push_subscriptions (
      id serial primary key,
      endpoint text not null unique,
      p256dh text not null,
      auth text not null,
      created_at timestamptz not null default now()
    )`;
  await seedIfEmpty();
}

/** Create tables (once per instance) and seed demo data on the very first run. */
export function ensureSchema(): Promise<void> {
  if (!g.__tsReady) {
    g.__tsReady = init().catch((e) => {
      g.__tsReady = undefined;
      throw e;
    });
  }
  return g.__tsReady;
}

async function seedIfEmpty(): Promise<void> {
  const db = sql();
  const claimed = await db`
    insert into ts_settings (key, value) values ('seeded', 'true'::jsonb)
    on conflict (key) do nothing returning key`;
  if (claimed.length === 0) return;
  const [{ count }] = await db`select count(*)::int as count from ts_spaces`;
  if (count > 0) return;

  const T = todayISO();
  const d = (n: number) => addDays(T, n);

  const spaces = [
    { name: "בית", color: "#10b981", view: "todo" },
    { name: "עבודה", color: "#3b82f6", view: "kanban" },
    { name: "לימודים", color: "#8b5cf6", view: "calendar" },
  ];
  const ids: number[] = [];
  for (let i = 0; i < spaces.length; i++) {
    const [row] = await db`
      insert into ts_spaces (name, color, view, position)
      values (${spaces[i].name}, ${spaces[i].color}, ${spaces[i].view}, ${i})
      returning id`;
    ids.push(row.id);
  }

  type Seed = [number, string, string, string, string, string | null, boolean];
  // [spaceIdx, title, priority, status, description, due, doneToday]
  const tasks: Seed[] = [
    [0, "לתאם טכנאי למזגן", "urgent", "new", "לפני שיתחיל החום", d(-1), false],
    [0, "לקנות חלב וביצים", "medium", "new", "", d(0), false],
    [0, "להתקשר לסבתא", "medium", "new", "לשאול מה שלומה ולתאם ביקור", d(1), false],
    [0, "לשלם ארנונה", "high", "new", "", d(4), false],
    [0, "לשלם חשבון חשמל", "high", "done", "", d(-2), true],

    [1, "להכין מצגת ללקוח", "urgent", "in_progress", "5 שקפים עם תוצאות הרבעון", d(0), false],
    [1, "לענות למיילים דחופים", "high", "new", "", d(-1), false],
    [1, "לשלוח הצעת מחיר לדנה", "high", "new", "", d(2), false],
    [1, "לעדכן את דוח המכירות החודשי", "medium", "on_hold", "מחכה לנתונים מהכספים", d(5), false],
    [1, "לקבוע פגישת צוות שבועית", "low", "done", "", d(-4), true],

    [2, "להגיש עבודה בסטטיסטיקה", "urgent", "in_progress", "", d(1), false],
    [2, "ללמוד לבחינה באלגברה", "high", "new", "פרקים 3 עד 6", d(7), false],
    [2, "לקרוא פרקים 4-5 בספר", "medium", "new", "", d(3), false],
    [2, "להירשם לקורס בחירה", "medium", "new", "ההרשמה נסגרת בקרוב", d(-2), false],
    [2, "לסכם את ההרצאה האחרונה", "low", "done", "", d(-3), true],
  ];
  const pos: Record<number, number> = {};
  for (const [si, title, priority, status, description, due, done] of tasks) {
    pos[si] = (pos[si] ?? 0) + 1;
    await db`
      insert into ts_tasks (space_id, title, description, priority, status, due_date, position, completed_at)
      values (${ids[si]}, ${title}, ${description}, ${priority}, ${status}, ${due}, ${pos[si]},
              ${done ? db`now() - interval '3 hours'` : null})`;
  }
}
