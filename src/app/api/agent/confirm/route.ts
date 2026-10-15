import { NextResponse } from "next/server";
import { guarded, readJson } from "@/lib/api";
import { resolvePending } from "@/lib/agent";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const POST = guarded(async (req) => {
  const body = await readJson(req);
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "חסר מזהה" }, { status: 400 });
  try {
    return NextResponse.json(await resolvePending(id, body.approve === true));
  } catch (e) {
    console.error("[agent/confirm]", e);
    return NextResponse.json({
      reply: "",
      actions: [],
      mutated: false,
      error: "משהו השתבש בטיפול באישור. נסה שוב.",
    });
  }
});
