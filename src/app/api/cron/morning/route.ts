import { NextResponse } from "next/server";
import { getSettings, listTasks } from "@/lib/store";
import { byClock } from "@/lib/day-plan";
import { isOpenTask } from "@/lib/constants";
import { todayISO } from "@/lib/dates";
import { broadcastPush } from "@/lib/push";

// Optional daily morning summary (see vercel.json). Vercel injects Authorization: Bearer
// $CRON_SECRET automatically for its own Cron Jobs when CRON_SECRET is set, so this reuses
// the same secret as /api/cron/reminders instead of a separate one.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(req: Request): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const today = todayISO();
    const [tasks, settings] = await Promise.all([listTasks(), getSettings()]);
    const open = tasks.filter((t) => isOpenTask(t));
    const overdue = open.filter((t) => t.due_date && t.due_date < today).length;
    const todays = open.filter((t) => t.due_date === today).sort(byClock);
    if (!overdue && !todays.length) {
      return NextResponse.json({ skipped: true, reason: "nothing due or overdue" });
    }
    // the plan in a few lines: the note, the first three by the clock, and what is left
    const lines: string[] = [];
    if (settings.day_note?.date === today) lines.push(`⭐ ${settings.day_note.text}`);
    for (const t of todays.slice(0, 3)) lines.push(`${t.due_time ? `${t.due_time} ` : "• "}${t.title}`);
    if (todays.length > 3) lines.push(`ועוד ${todays.length - 3}`);
    if (overdue) lines.push(`${overdue} נשארו מימים קודמים`);
    const result = await broadcastPush({
      title: `☀️ בוקר טוב! ${todays.length ? `${todays.length} משימות להיום` : "תוכנית היום"}`,
      body: lines.join("\n"),
      url: "/",
      tag: "morning-briefing",
    });
    return NextResponse.json({ sent: result.sent });
  } catch (e) {
    console.error("[cron/morning]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
