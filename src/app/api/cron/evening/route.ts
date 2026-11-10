import { NextResponse } from "next/server";
import { listTasks } from "@/lib/store";
import { isOpenTask } from "@/lib/constants";
import { todayISO } from "@/lib/dates";
import { broadcastPush } from "@/lib/push";

// Evening wrap-up (see vercel.json): what got done, and one tap in the app moves the rest to tomorrow.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const today = todayISO();
    const tasks = await listTasks();
    const done = tasks.filter((t) => t.status === "done" && t.completed_at && todayISO(new Date(t.completed_at)) === today).length;
    const left = tasks.filter((t) => isOpenTask(t) && t.due_date && t.due_date <= today).length;
    if (!done && !left) return NextResponse.json({ skipped: true });
    const result = await broadcastPush({
      title: done ? `🌙 סגרת היום ${done} ${done === 1 ? "משימה" : "משימות"}` : "🌙 סוגרים את היום",
      body: left ? `נשארו ${left}. נכנסים לרגע ומעבירים למחר בלחיצה אחת.` : "הכול סגור. לילה טוב!",
      url: "/",
      tag: "evening-wrapup",
    });
    return NextResponse.json({ sent: result.sent });
  } catch (e) {
    console.error("[cron/evening]", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
