import { NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { wallpaperKey } from "@/lib/store";

/** The private link of the lock-screen image (created on first ask); POST makes a new one. */
export const GET = guarded(async (req) => {
  const key = await wallpaperKey("create");
  return NextResponse.json({ url: `${new URL(req.url).origin}/api/wallpaper?key=${key}` });
});

export const POST = guarded(async (req) => {
  const key = await wallpaperKey("rotate");
  return NextResponse.json({ url: `${new URL(req.url).origin}/api/wallpaper?key=${key}` });
});
