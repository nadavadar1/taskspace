import "server-only";
import { NextResponse } from "next/server";
import { isAuthed } from "./auth";
import { ValidationError } from "./errors";

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: requires the session cookie and turns thrown errors into JSON. */
export function guarded<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    if (!(await isAuthed())) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ValidationError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      console.error("[api]", e);
      const message = e instanceof Error ? e.message : "שגיאה לא צפויה";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
