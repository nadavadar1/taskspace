import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { runAgent } from "@/lib/agent";
import type { AgentScope } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const POST = guarded(async (req) => {
  const body = await readJson(req);
  const rawHistory = Array.isArray(body.messages) ? (body.messages as Record<string, unknown>[]) : [];
  const history = rawHistory
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 4000) }));
  if (!history.length || history[history.length - 1].role !== "user") {
    return NextResponse.json({ error: "אין הודעה לשליחה" }, { status: 400 });
  }
  const s = body.scope as { type?: string; spaceId?: number } | undefined;
  const scope: AgentScope =
    s?.type === "space" && Number.isInteger(s.spaceId) ? { type: "space", spaceId: s.spaceId! } : { type: "all" };

  try {
    return NextResponse.json(await runAgent({ history, scope }));
  } catch (e) {
    console.error("[agent]", e);
    const status = (e as { status?: number }).status;
    return NextResponse.json({
      reply: "",
      actions: [],
      mutated: false,
      error:
        status === 429
          ? "בחשבון OpenAI אין כרגע יתרה. צריך להוסיף קרדיט ב-platform.openai.com/settings/organization/billing."
          : "לא הצלחתי להתחבר לסוכן כרגע. נסה שוב בעוד רגע.",
    });
  }
});
