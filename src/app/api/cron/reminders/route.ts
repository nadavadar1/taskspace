import { NextResponse } from "next/server";
import { claimDueReminders } from "@/lib/reminders";
import { broadcastPush } from "@/lib/push";
import { getTask } from "@/lib/store";

// Polled every minute by an external free cron service (cron-job.org). Vercel's own free-tier
// cron only fires once a day, so this route is the real scheduler. It must not require a
// cookie-based login (the external poller can't hold one) — it's protected by a bearer secret
// instead, and it's safe to call repeatedly: a reminder is only ever sent once per occurrence.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

async function run(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    // Claims (and advances/disables) every due reminder atomically, so only the caller that
    // actually claimed a reminder goes on to push-notify for it.
    const due = await claimDueReminders();
    let sent = 0;
    for (const reminder of due) {
      let body: string | undefined;
      let url = "/";
      if (reminder.task_id) {
        const task = await getTask(reminder.task_id);
        if (task) {
          if (task.description) body = task.description.slice(0, 160);
          url = `/space/${task.space_id}`;
        }
      }
      const result = await broadcastPush({
        title: `⏰ ${reminder.title}`,
        body,
        url,
        tag: `reminder-${reminder.id}`,
      });
      sent += result.sent;
    }
    return NextResponse.json({ checked: due.length, sent });
  } catch (e) {
    console.error("[cron/reminders]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
