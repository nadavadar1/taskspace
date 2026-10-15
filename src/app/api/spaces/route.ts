import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { createSpace } from "@/lib/store";

export const POST = guarded(async (req) => {
  const body = await readJson(req);
  const space = await createSpace({
    name: String(body.name ?? ""),
    color: typeof body.color === "string" ? body.color : undefined,
    view: typeof body.view === "string" ? body.view : undefined,
  });
  return NextResponse.json({ space });
});
