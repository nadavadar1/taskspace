import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { setDashboardSpaces, setDayNote } from "@/lib/store";
import { isISO } from "@/lib/dates";

export const PUT = guarded(async (req) => {
  const body = await readJson(req);
  if ("day_note" in body) {
    const n = body.day_note as { date?: unknown; text?: unknown } | null;
    await setDayNote(n && isISO(n.date) && typeof n.text === "string" ? { date: n.date, text: n.text } : null);
  }
  if ("dashboard_spaces" in body) {
    const ids = Array.isArray(body.dashboard_spaces) ? (body.dashboard_spaces as unknown[]).map(Number) : null;
    await setDashboardSpaces(ids);
  }
  return NextResponse.json({ ok: true });
});
