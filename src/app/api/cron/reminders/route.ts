import { NextResponse } from "next/server";
import { claimDueReminders } from "@/lib/reminders";
import { broadcastPush } from "@/lib/push";
import { claimTimedCheckins, claimTimedNudges, getTask } from "@/lib/store";

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
  // The poller calls every minute, but touching the database that often keeps the free Neon compute
  // awake 24/7 and burns the monthly quota (it ran out on 21.11.2026). So only every 15th minute does
  // any work; reminders and timed-task nudges look a quarter-hour ahead to make up for it.
  if (new Date().getUTCMinutes() % 15 !== 0 && !new URL(req.url).searchParams.has("now")) {
    return NextResponse.json({ skipped: "off-minute" });
  }
  try {
    // Claims (and advances/disables) every due reminder atomically, so only the caller that
    // actually claimed a reminder goes on to push-notify for it.
    const due = await claimDueReminders(new Date(Date.now() + 14 * 60_000)); // a little early beats 15 minutes late
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
    // a task with a time pushes a few minutes before it, without having to set a reminder by hand
    const nudges = await claimTimedNudges(15);
    for (const t of nudges) {
      const result = await broadcastPush({
        title: `⏰ ${t.due_time} · ${t.title}`,
        body: t.description ? t.description.slice(0, 160) : "עוד כמה דקות. אפשר להתחיל.",
        url: "/",
        tag: `nudge-${t.id}`,
      });
      sent += result.sent;
    }
    // and asks "בוצע?" a little after the time, one push for all of them
    const asks = await claimTimedCheckins();
    if (asks.length) {
      const one = asks.length === 1;
      const result = await broadcastPush({
        title: one ? `👀 שים לב · ${asks[0].due_time}` : `👀 שים לב · ${asks.length} משימות`,
        body: one ? `${asks[0].title}. בוצע?` : `${asks.map((a) => `${a.due_time} ${a.title}`).join(" · ").slice(0, 150)}. בוצעו?`,
        url: "/",
        tag: "checkin",
      });
      sent += result.sent;
    }
    return NextResponse.json({ checked: due.length, nudged: nudges.length, asked: asks.length, sent });
  } catch (e) {
    console.error("[cron/reminders]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
