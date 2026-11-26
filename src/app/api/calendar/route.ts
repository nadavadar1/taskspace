import { timingSafeEqual } from "node:crypto";
import { addDays, todayISO, zonedToUtcISO } from "@/lib/dates";
import { listSpaces, listTasks, wallpaperKey } from "@/lib/store";
import type { Task } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The app's calendar as an .ics feed, for "Add Subscribed Calendar" on the iPhone (read-only, the phone refreshes it).
 * Timed tasks become timed entries, dated events become all-day ones. Same private key as the lock-screen image.
 */
function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d+/, "");
// shortcut: folds by characters, not octets (Hebrew is 2 bytes each, so 37 chars stays under 75); fine for iOS/Google
const fold = (line: string) => line.match(/.{1,37}/gu)!.join("\r\n ");

function minutesAfter(time: string, n: number): string {
  const [h, m] = time.split(":").map(Number);
  const t = Math.min(h * 60 + m + n, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function vevent(t: Task, space: string): string[] {
  const title = `${t.status === "done" ? "✓ " : ""}${t.title}`;
  const lines = ["BEGIN:VEVENT", `UID:task-${t.id}@taskspace`, `DTSTAMP:${stamp(new Date().toISOString())}`];
  if (t.due_time) {
    lines.push(`DTSTART:${stamp(zonedToUtcISO(t.due_date!, t.due_time))}`);
    lines.push(`DTEND:${stamp(zonedToUtcISO(t.due_date!, t.end_time ?? minutesAfter(t.due_time, 30)))}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${t.due_date!.replace(/-/g, "")}`);
    lines.push(`DTEND;VALUE=DATE:${addDays(t.due_date!, 1).replace(/-/g, "")}`);
  }
  lines.push(`SUMMARY:${esc(title)}`, `CATEGORIES:${esc(space)}`);
  if (t.description) lines.push(`DESCRIPTION:${esc(t.description)}`);
  lines.push("END:VEVENT");
  return lines;
}

export async function GET(req: Request) {
  const given = new URL(req.url).searchParams.get("key") ?? "";
  const key = await wallpaperKey("read");
  if (!key || !same(given, key)) return new Response("not found", { status: 404 });

  const today = todayISO();
  const from = addDays(today, -30);
  const to = addDays(today, 180);
  const [tasks, spaces] = await Promise.all([listTasks(), listSpaces()]);
  const names = new Map(spaces.map((s) => [s.id, s.name]));
  const shown = tasks.filter(
    (t) => t.due_date && t.due_date >= from && t.due_date <= to && (t.due_time || t.is_event) && t.status !== "not_done",
  );

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//taskspace//he",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:מרחב",
    "X-WR-TIMEZONE:Asia/Jerusalem",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...shown.flatMap((t) => vevent(t, names.get(t.space_id) ?? "")),
    "END:VCALENDAR",
  ];
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" },
  });
}
