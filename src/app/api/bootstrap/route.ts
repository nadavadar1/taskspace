import { NextResponse } from "next/server";
import { guarded } from "@/lib/api";
import { listActiveReminders } from "@/lib/reminders";
import { getSettings, listSpaces, listTasks } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = guarded(async () => {
  const [spaces, tasks, settings, reminders] = await Promise.all([
    listSpaces(),
    listTasks(),
    getSettings(),
    listActiveReminders(),
  ]);
  return NextResponse.json({ spaces, tasks, settings, reminders });
});
