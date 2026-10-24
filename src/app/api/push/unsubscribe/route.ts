import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { removePushSubscription } from "@/lib/reminders";

export const POST = guarded(async (req) => {
  const body = await readJson(req);
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  if (endpoint) await removePushSubscription(endpoint);
  return NextResponse.json({ ok: true });
});
