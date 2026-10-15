import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { deleteSpace, updateSpace } from "@/lib/store";

type Ctx = RouteContext<"/api/spaces/[id]">;

export const PATCH = guarded<Ctx>(async (req, ctx) => {
  const id = Number((await ctx.params).id);
  const body = await readJson(req);
  const space = await updateSpace(id, {
    name: typeof body.name === "string" ? body.name : undefined,
    color: typeof body.color === "string" ? body.color : undefined,
    view: typeof body.view === "string" ? body.view : undefined,
  });
  if (!space) return NextResponse.json({ error: "המרחב לא נמצא" }, { status: 404 });
  return NextResponse.json({ space });
});

export const DELETE = guarded<Ctx>(async (_req, ctx) => {
  const id = Number((await ctx.params).id);
  await deleteSpace(id);
  return NextResponse.json({ ok: true });
});
