import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { savePushSubscription } from "@/lib/reminders";

export const POST = guarded(async (req) => {
  const body = await readJson(req);
  const sub = body.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "subscription לא תקינה" }, { status: 400 });
  }
  await savePushSubscription({ endpoint, p256dh, auth });
  return NextResponse.json({ ok: true });
});
