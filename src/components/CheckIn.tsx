"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock, X } from "lucide-react";
import { useData } from "./DataProvider";
import { useNowHM } from "./TodayPlan";
import { cn } from "./ui";

const SEEN_KEY = "checkin-seen";

const mins = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

function plus(time: string, minutes: number): string {
  const t = Math.min(mins(time) + minutes, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * "👀 שים לב · 19:30 — בוצע?": once a timed task's time comes, a card floats above the bottom bar on every
 * page until it is answered (done / half an hour more / not done) or closed. One at a time, earliest first.
 */
export function CheckIn() {
  const { tasks, spaces, today, patchTask, openTask, isTodo } = useData();
  const now = useNowHM();
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount (no localStorage on the server)
      if (Array.isArray(v)) setSeen(v.filter((k) => typeof k === "string" && k.includes(today)));
    } catch {}
  }, [today]);

  const key = (t: { id: number; due_date: string | null; due_time: string | null }) => `${t.id} ${t.due_date} ${t.due_time}`;
  const due = useMemo(
    () =>
      now
        ? tasks
            .filter((t) => !t.is_event && t.due_date === today && t.due_time && t.due_time <= now && isTodo(t) && !seen.includes(key(t)))
            .sort((a, b) => (a.due_time ?? "").localeCompare(b.due_time ?? ""))
        : [],
    [tasks, today, now, isTodo, seen],
  );
  const t = due[0];
  if (!t) return null;
  const space = spaces.find((s) => s.id === t.space_id);
  const color = space?.color ?? "#6366f1";

  function close() {
    const next = [...seen, key(t)];
    setSeen(next);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch {}
  }

  return (
    <div
      key={t.id}
      role="alertdialog"
      aria-label={`שים לב: ${t.title}. בוצע?`}
      data-checkin
      className="anim-slide fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md overflow-hidden rounded-3xl border border-line bg-surface shadow-lift sm:bottom-6"
    >
      <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${color}, #8b5cf6)` }} />
      <div className="flex items-start gap-3 p-4 pb-3">
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ backgroundColor: `${color}1f` }}>
          <span className="anim-pulse-ring absolute inset-0 rounded-2xl" style={{ boxShadow: `0 0 0 2px ${color}55` }} />
          👀
        </span>
        <button type="button" onClick={() => openTask(t.id)} className="min-w-0 flex-1 text-start">
          <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
            <span className="rounded-full px-2 py-0.5 text-white" style={{ backgroundColor: color }}>
              שים לב · {t.due_time}
            </span>
            {due.length > 1 && <span className="text-muted">עוד {due.length - 1} מחכות</span>}
          </span>
          <span className="mt-1 line-clamp-2 block text-[17px] font-bold leading-snug">{t.title}</span>
          <span className="mt-0.5 block text-sm text-muted">האם בוצע?</span>
        </button>
        <button type="button" onClick={close} className="-me-1 -mt-1 rounded-full p-1.5 text-slate-400 active:bg-slate-100" aria-label="לסגור">
          <X size={18} />
        </button>
      </div>
      <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-2 px-4 pb-4">
        <Btn tone="go" onClick={() => patchTask(t.id, { status: "done" })}>
          <Check size={17} strokeWidth={3} /> בוצע
        </Btn>
        <Btn
          onClick={() => {
            const from = t.due_time!;
            const at = plus(now > from ? now : from, 30);
            // a slot keeps its length: 19:30 עד 20:00 moved to 20:10 ends at 20:40
            patchTask(t.id, { due_time: at, end_time: t.end_time ? plus(t.end_time, mins(at) - mins(from)) : null });
          }}
        >
          <Clock size={15} /> עוד 30 דק׳
        </Btn>
        <Btn onClick={() => patchTask(t.id, { status: "not_done" })}>לא בוצע</Btn>
      </div>
    </div>
  );
}

function Btn({ tone, onClick, children }: { tone?: "go"; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-bold transition active:scale-95",
        tone === "go" ? "bg-emerald-500 text-white shadow-soft" : "bg-slate-100 text-slate-700",
      )}
    >
      {children}
    </button>
  );
}
