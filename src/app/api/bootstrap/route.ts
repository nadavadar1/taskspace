import { NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { getSettings, listSpaces, listTasks } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = guarded(async () => {
  const [spaces, tasks, settings] = await Promise.all([listSpaces(), listTasks(), getSettings()]);
  return NextResponse.json({ spaces, tasks, settings });
});
