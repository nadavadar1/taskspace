import { NextResponse } from "next/server";
import { listTasks } from "@/lib/store";
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
    const tasks = await listTasks();
    const open = tasks.filter((t) => t.status !== "done");
    const overdue = open.filter((t) => t.due_date && t.due_date < today).length;
    const dueToday = open.filter((t) => t.due_date === today).length;
    if (!overdue && !dueToday) {
      return NextResponse.json({ skipped: true, reason: "nothing due or overdue" });
    }
    const parts: string[] = [];
    if (overdue) parts.push(`${overdue} באיחור`);
    if (dueToday) parts.push(`${dueToday} להיום`);
    const result = await broadcastPush({
      title: "☀️ סיכום בוקר",
      body: parts.join(" · "),
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
