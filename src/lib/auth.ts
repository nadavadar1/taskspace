import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "ts_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || "";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", `taskspace:${secret()}`).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function passwordConfigured(): boolean {
  return !!process.env.APP_PASSWORD;
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

export async function startSession(): Promise<void> {
  const exp = String(Date.now() + MAX_AGE * 1000);
  const store = await cookies();
  store.set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function isAuthed(): Promise<boolean> {
  if (!secret()) return false;
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return false;
  const [exp, mac] = raw.split(".");
  if (!exp || !mac) return false;
  if (Number(exp) < Date.now()) return false;
  return safeEqual(mac, sign(exp));
}
