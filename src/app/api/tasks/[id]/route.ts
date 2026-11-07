import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { deleteTask, updateTaskFull, type TaskPatch } from "@/lib/store";

type Ctx = RouteContext<"/api/tasks/[id]">;

export const PATCH = guarded<Ctx>(async (req, ctx) => {
  const id = Number((await ctx.params).id);
  const body = await readJson(req);
  const patch: TaskPatch = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.description === "string") patch.description = body.description;
  if (typeof body.priority === "string") patch.priority = body.priority;
  if (typeof body.status === "string") patch.status = body.status;
  if (body.due_date === null || typeof body.due_date === "string") patch.due_date = body.due_date;
  if (body.due_time === null || typeof body.due_time === "string") patch.due_time = body.due_time;
  if (typeof body.status_note === "string") patch.status_note = body.status_note;
  if (typeof body.space_id === "number") patch.space_id = body.space_id;
  if (typeof body.position === "number") patch.position = body.position;
  if (Array.isArray(body.checklist)) patch.checklist = body.checklist;
  if (typeof body.is_event === "boolean") patch.is_event = body.is_event;
  if (typeof body.recurrence === "string") patch.recurrence = body.recurrence;
  if (body.recurrence_n === null || typeof body.recurrence_n === "number") patch.recurrence_n = body.recurrence_n;
  const { task, spawned } = await updateTaskFull(id, patch);
  if (!task) return NextResponse.json({ error: "המשימה לא נמצאה" }, { status: 404 });
  return NextResponse.json({ task, spawned });
});

export const DELETE = guarded<Ctx>(async (_req, ctx) => {
  const id = Number((await ctx.params).id);
  await deleteTask(id);
  return NextResponse.json({ ok: true });
});
