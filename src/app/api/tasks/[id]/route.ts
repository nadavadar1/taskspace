import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { deleteTask, updateTask, type TaskPatch } from "@/lib/store";

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
  if (typeof body.space_id === "number") patch.space_id = body.space_id;
  if (typeof body.position === "number") patch.position = body.position;
  const task = await updateTask(id, patch);
  if (!task) return NextResponse.json({ error: "המשימה לא נמצאה" }, { status: 404 });
  return NextResponse.json({ task });
});

export const DELETE = guarded<Ctx>(async (_req, ctx) => {
  const id = Number((await ctx.params).id);
  await deleteTask(id);
  return NextResponse.json({ ok: true });
});
