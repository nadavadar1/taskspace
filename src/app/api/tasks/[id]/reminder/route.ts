import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { isClosed } from "@/lib/constants";
import { isHHMM, isISO, zonedToUtcISO } from "@/lib/dates";
import { REPEAT_KINDS, taskDeadlineUTC } from "@/lib/reminder-utils";
import { removeTaskReminder, upsertTaskReminder } from "@/lib/reminders";
import { getTask } from "@/lib/store";
import type { RepeatKind } from "@/lib/types";

type Ctx = RouteContext<"/api/tasks/[id]/reminder">;

/**
 * Creates (or replaces) the task's reminder.
 * Body: { date: "YYYY-MM-DD", time: "HH:MM" (Israel time), repeat?: RepeatKind, repeat_n?: number }
 */
export const POST = guarded<Ctx>(async (req, ctx) => {
  const id = Number((await ctx.params).id);
  const task = await getTask(id);
  if (!task) return NextResponse.json({ error: "המשימה לא נמצאה" }, { status: 404 });
  if (isClosed(task.status)) {
    return NextResponse.json({ error: "משימה סגורה (הושלמה או לא בוצעה) לא יכולה לקבל תזכורת" }, { status: 400 });
  }

  const body = await readJson(req);
  if (!isISO(body.date) || !isHHMM(body.time)) {
    return NextResponse.json({ error: "צריך תאריך ושעה לתזכורת" }, { status: 400 });
  }
  const repeat = (typeof body.repeat === "string" ? body.repeat : "none") as RepeatKind;
  if (!REPEAT_KINDS.includes(repeat)) {
    return NextResponse.json({ error: "תדירות לא מוכרת" }, { status: 400 });
  }
  const repeatN = Number(body.repeat_n);
  if (repeat === "every_n_days" && !(Number.isInteger(repeatN) && repeatN > 0)) {
    return NextResponse.json({ error: "צריך מספר ימים חיובי" }, { status: 400 });
  }

  const remindAt = zonedToUtcISO(body.date, body.time);
  const deadline = taskDeadlineUTC(task);
  if (repeat !== "none" && deadline && new Date(remindAt) > new Date(deadline)) {
    return NextResponse.json({ error: "התזכורת החוזרת מתחילה אחרי תאריך היעד של המשימה" }, { status: 400 });
  }

  const reminder = await upsertTaskReminder(task.id, task.title, {
    remind_at: remindAt,
    repeat,
    repeat_n: repeat === "every_n_days" ? repeatN : null,
  });
  return NextResponse.json({ reminder });
});

/** Removes the task's reminder. */
export const DELETE = guarded<Ctx>(async (_req, ctx) => {
  const id = Number((await ctx.params).id);
  const removedId = await removeTaskReminder(id);
  return NextResponse.json({ ok: true, id: removedId });
});
