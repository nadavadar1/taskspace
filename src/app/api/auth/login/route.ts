import { NextResponse } from "next/server";
import { checkPassword, passwordConfigured, startSession } from "@/lib/auth";
import { readJson } from "@/lib/api";

export async function POST(req: Request) {
  if (!passwordConfigured()) {
    return NextResponse.json({ error: "APP_PASSWORD לא הוגדר בשרת" }, { status: 500 });
  }
  const body = await readJson(req);
  const password = typeof body.password === "string" ? body.password : "";
  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "הסיסמה שגויה" }, { status: 401 });
  }
  await startSession();
  return NextResponse.json({ ok: true });
}
