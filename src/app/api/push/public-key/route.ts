import { NextResponse } from "next/server";
import { guarded } from "@/lib/api";

export const GET = guarded(async () => {
  const key = process.env.VAPID_PUBLIC_KEY || "";
  return NextResponse.json({ key });
});
