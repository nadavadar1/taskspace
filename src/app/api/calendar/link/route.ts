import { NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { wallpaperKey } from "@/lib/store";

/** The private calendar feed link (shares the lock-screen image's key). */
export const GET = guarded(async (req) => {
  const key = await wallpaperKey("create");
  const url = `${new URL(req.url).origin}/api/calendar?key=${key}`;
  return NextResponse.json({ url, webcal: url.replace(/^https?:/, "webcal:") });
});
