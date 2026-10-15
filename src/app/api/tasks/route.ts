import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { createTask } from "@/lib/store";

export const POST = guarded(async (req) => {
  const body = await readJson(req);
  const spaceId = Number(body.space_id);
  if (!Number.isInteger(spaceId)) return NextResponse.json({ error: "מרחב חסר" }, { status: 400 });
  const task = await createTask({
    space_id: spaceId,
    title: String(body.title ?? ""),
    description: typeof body.description === "string" ? body.description : "",
    priority: typeof body.priority === "string" ? body.priority : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
    due_date: typeof body.due_date === "string" ? body.due_date : null,
    position: typeof body.position === "number" ? body.position : undefined,
  });
  return NextResponse.json({ task });
});
