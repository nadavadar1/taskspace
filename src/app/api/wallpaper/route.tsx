import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { ImageResponse } from "next/og";
import { getSettings, listTasks, wallpaperKey } from "@/lib/store";
import { isOpenTask } from "@/lib/constants";
import { diffDays, formatLong, todayISO } from "@/lib/dates";
import { byClock } from "@/lib/day-plan";

/**
 * The lock-screen image: today's plan, drawn fresh on every request. An iPhone Shortcut automation
 * fetches it each morning and sets it as the wallpaper, so the plan is seen without opening anything.
 * No login (the Shortcut can't hold one): the long secret `key` in the link is the password.
 */
export const dynamic = "force-dynamic";

const W = 1170;
const H = 2532; // iPhone 12–16 (6.1"); other sizes are scaled to fit by iOS
const dir = join(process.cwd(), "src/app/api/wallpaper");

/**
 * The image engine (satori) has no right-to-left support: it lays every string out left to right.
 * So each line is handed over already in visual order: the runs are reversed, Hebrew runs letter by letter,
 * while numbers / Latin words (23:59, WEB) stay as they are. One line at a time, so wrapping is done by `wrap`.
 */
function visual(s: string): string {
  const runs = s.match(/[A-Za-z0-9][A-Za-z0-9:./'&+-]*[A-Za-z0-9]|[A-Za-z0-9]|[^A-Za-z0-9]+/g) ?? [];
  const mirror: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[" };
  return runs
    .reverse()
    .map((r) => (/^[A-Za-z0-9]/.test(r) ? r : [...r].reverse().map((c) => mirror[c] ?? c).join("")))
    .join("");
}

/** Splits by words into lines of at most `max` characters (logical order), up to `lines` lines. */
function wrap(s: string, max: number, lines = 1): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of s.trim().split(/\s+/)) {
    if (cur && (cur + " " + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = `${out[lines - 1].slice(0, max - 1)}…`;
  }
  return out.map((l) => (l.length > max ? `${l.slice(0, max - 1)}…` : l));
}
const he = (s: string, max = 999) => visual(wrap(s, max)[0] ?? "");

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: Request) {
  const given = new URL(req.url).searchParams.get("key") ?? "";
  const key = await wallpaperKey("read");
  if (!key || !same(given, key)) return new Response("not found", { status: 404 });

  const today = todayISO();
  const [tasks, settings, regular, bold] = await Promise.all([
    listTasks(),
    getSettings(),
    readFile(join(dir, "Heebo-500.woff")),
    readFile(join(dir, "Heebo-800.woff")),
  ]);
  const open = tasks.filter((t) => isOpenTask(t) && t.status !== "on_hold");
  const todays = open.filter((t) => t.due_date === today).sort(byClock);
  const leftovers = open.filter((t) => t.due_date && t.due_date < today).length;
  const doneToday = tasks.filter((t) => t.status === "done" && t.completed_at && todayISO(new Date(t.completed_at)) === today).length;
  const event = tasks
    .filter((t) => t.is_event && t.due_date && t.due_date >= today && diffDays(t.due_date, today) <= 14)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0];
  const note = settings.day_note?.date === today ? settings.day_note.text : "";
  const shown = todays.slice(0, note ? 6 : 8);
  const more = todays.length - shown.length;

  return new ImageResponse(
    (
      <div
        dir="rtl"
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          padding: "820px 70px 0", // the lock-screen clock sits above
          fontFamily: "Heebo",
          color: "white",
          background: "linear-gradient(165deg, #1e1b4b 0%, #4c1d95 42%, #9d174d 78%, #c2410c 100%)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 40, fontWeight: 500, opacity: 0.8, marginBottom: 26 }}>
          {he(formatLong(today))}
        </div>

        {note && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              background: "rgba(251, 191, 36, 0.18)",
              border: "3px solid rgba(251, 191, 36, 0.55)",
              borderRadius: 48,
              padding: "34px 44px",
              marginBottom: 34,
            }}
          >
            <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: "#fcd34d", marginBottom: 10 }}>{he("הכי חשוב היום")}</div>
            {wrap(note, 30, 4).map((line, i) => (
              <div key={i} style={{ display: "flex", fontSize: 50, fontWeight: 800, lineHeight: 1.35 }}>
                {visual(line)}
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: "rgba(255, 255, 255, 0.11)",
            border: "2px solid rgba(255, 255, 255, 0.18)",
            borderRadius: 48,
            padding: "30px 44px",
          }}
        >
          {shown.length === 0 ? (
            <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 48, fontWeight: 800, padding: "20px 0" }}>
              {he("אין משימות להיום. יום פנוי!")}
            </div>
          ) : (
            shown.map((t, i) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  padding: "22px 0",
                  borderTop: i ? "2px solid rgba(255,255,255,0.12)" : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 30,
                    height: 30,
                    borderRadius: 30,
                    border: "4px solid rgba(255,255,255,0.75)",
                    marginLeft: 26,
                    flexShrink: 0,
                  }}
                />
                <div style={{ display: "flex", flex: 1, justifyContent: "flex-end", fontSize: 46, fontWeight: 500, textAlign: "right" }}>
                  {he(t.title, 28)}
                </div>
                <div style={{ display: "flex", width: 150, fontSize: 42, fontWeight: 800, color: "#fcd34d", flexShrink: 0 }}>
                  {t.due_time ?? ""}
                </div>
              </div>
            ))
          )}
          {more > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 38, opacity: 0.75, paddingTop: 10 }}>
              {he(`ועוד ${more} באפליקציה`)}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "row-reverse", flexWrap: "wrap", gap: 18, marginTop: 30, fontSize: 36, fontWeight: 800 }}>
          {doneToday > 0 && <Pill bg="rgba(16,185,129,0.35)">{he(`סגרת היום ${doneToday}`)}</Pill>}
          {leftovers > 0 && <Pill bg="rgba(249,115,22,0.35)">{he(`${leftovers} מימים קודמים`)}</Pill>}
          {event && (
            <Pill bg="rgba(255,255,255,0.16)">
              {he(`${diffDays(event.due_date!, today) === 0 ? "היום" : `בעוד ${diffDays(event.due_date!, today)} ימים`}: ${event.title}`, 34)}
            </Pill>
          )}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Heebo", data: regular, weight: 500, style: "normal" },
        { name: "Heebo", data: bold, weight: 800, style: "normal" },
      ],
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function Pill({ bg, children }: { bg: string; children: React.ReactNode }) {
  return <div style={{ display: "flex", background: bg, borderRadius: 999, padding: "14px 30px" }}>{children}</div>;
}
