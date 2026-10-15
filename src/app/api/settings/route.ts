import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { setDashboardSpaces } from "@/lib/store";

export const PUT = guarded(async (req) => {
  const body = await readJson(req);
  const ids = Array.isArray(body.dashboard_spaces) ? (body.dashboard_spaces as unknown[]).map(Number) : null;
  await setDashboardSpaces(ids);
  return NextResponse.json({ ok: true });
});
