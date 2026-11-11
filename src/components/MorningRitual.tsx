"use client";

import { useState } from "react";
import { ArrowLeft, Check, Sun, Trash2 } from "lucide-react";
import { useData } from "./DataProvider";
import { Modal, cn, useMounted } from "./ui";
import { addDays, nowHHMM } from "@/lib/dates";
import { byClock } from "@/lib/day-plan";
import type { Task } from "@/lib/types";

const KEY = "ritual-day";
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** Opens by itself on the first visit of a morning (05:00–14:00), once a day. */
export function useMorningRitual(): [boolean, (open: boolean) => void] {
  const mounted = useMounted();
  const { today } = useData();
  const [state, setState] = useState<"auto" | "open" | "closed">("auto");
  const hm = mounted ? nowHHMM() : "";
  const auto = mounted && state === "auto" && read() !== today && hm >= "05:00" && hm < "14:00";
  return [
    state === "open" || auto,
    (open) => {
      if (!open)
        try {
          localStorage.setItem(KEY, today);
        } catch {
          /* it may open again on the next visit */
        }
      setState(open ? "open" : "closed");
    },
  ];
}

/**
 * A one-minute morning plan, three short steps: sort what is left from before (done / today / tomorrow /
 * delete), trim today to something doable, and write the one thing that matters most.
 */
export function MorningRitual({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tasks, isTodo, today, patchTask, deleteWithUndo, settings, setDayNote } = useData();
  const [step, setStep] = useState(0);
  const [note, setNote] = useState(() => (settings.day_note?.date === today ? settings.day_note.text : ""));
  const mine = tasks.filter((t) => isTodo(t) && t.status !== "on_hold");
  const leftovers = mine.filter((t) => t.due_date && t.due_date < today);
  const todays = mine.filter((t) => t.due_date === today).sort(byClock);
  const steps = [leftovers.length ? "leftovers" : null, "today", "note"].filter(Boolean) as string[];
  const current = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;

  function finish() {
    if (note.trim() !== (settings.day_note?.date === today ? settings.day_note.text : "")) setDayNote(note);
    setStep(0);
    onClose();
  }

  const suggestions = todays.filter((t) => t.priority === "urgent" || t.priority === "high").slice(0, 3);

  return (
    <Modal
      open={open}
      onClose={finish}
      title={
        <span className="flex items-center gap-2">
          <Sun size={20} className="text-amber-500" />
          בוקר טוב! דקה לתכנן את היום
        </span>
      }
      footer={
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <span key={s} className={cn("h-2 w-2 rounded-full", i <= step ? "bg-primary" : "bg-slate-200")} />
            ))}
          </span>
          <button
            onClick={() => (last ? finish() : setStep((s) => s + 1))}
            className="ms-auto flex items-center gap-1.5 rounded-2xl bg-primary px-6 py-3 text-base font-bold text-white shadow-soft active:scale-95"
          >
            {last ? "יאללה, מתחילים 💪" : "הלאה"}
            {!last && <ArrowLeft size={18} />}
          </button>
        </div>
      }
    >
      {current === "leftovers" && (
        <div data-ritual-step="leftovers">
          <h3 className="text-lg font-bold">מה נשאר מימים קודמים?</h3>
          <p className="mb-3 text-sm text-muted">לכל אחת לחיצה אחת: עשיתי, היום, מחר, או למחוק.</p>
          {leftovers.length === 0 ? (
            <p className="rounded-2xl bg-emerald-50 py-6 text-center font-bold text-emerald-700">הכול מסודר ✓</p>
          ) : (
            <ul className="space-y-2">
              {leftovers.map((t) => (
                <li key={t.id} className="rounded-2xl border border-line p-3">
                  <div className="mb-2 font-medium leading-snug">{t.title}</div>
                  <div className="grid grid-cols-4 gap-1.5 text-xs font-bold">
                    <Choice className="bg-emerald-50 text-emerald-700" onClick={() => void patchTask(t.id, { status: "done" })}>
                      <Check size={15} /> עשיתי
                    </Choice>
                    <Choice className="bg-primary-soft text-primary" onClick={() => void patchTask(t.id, { due_date: today })}>
                      היום
                    </Choice>
                    <Choice className="bg-slate-100 text-slate-700" onClick={() => void patchTask(t.id, { due_date: addDays(today, 1) })}>
                      מחר
                    </Choice>
                    <Choice className="bg-red-50 text-red-600" onClick={() => deleteWithUndo(t.id)}>
                      <Trash2 size={14} /> למחוק
                    </Choice>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {current === "today" && (
        <div data-ritual-step="today">
          <h3 className="text-lg font-bold">
            {todays.length === 0 ? "אין עדיין משימות להיום" : todays.length === 1 ? "משימה אחת להיום" : `${todays.length} משימות להיום`}
          </h3>
          <p className="mb-3 text-sm text-muted">
            {todays.length > 7
              ? "זה הרבה ליום אחד. מה אפשר להעביר למחר? עדיף יום קטן שסוגרים מיום גדול שנתקעים בו."
              : "נראה ריאלי? משהו שלא יקרה היום, מעבירים למחר."}
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {todays.map((t) => (
              <TodayLine key={t.id} task={t} onLater={() => void patchTask(t.id, { due_date: addDays(today, 1) })} />
            ))}
          </ul>
        </div>
      )}

      {current === "note" && (
        <div data-ritual-step="note">
          <h3 className="text-lg font-bold">מה הדבר הכי חשוב היום?</h3>
          <p className="mb-3 text-sm text-muted">שורה אחת. אם רק זה יקרה היום, היום הצליח.</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="למשל: להגיש את WEB עד הערב"
            className="w-full resize-none rounded-2xl border border-amber-200 bg-amber-50/60 p-3 text-[15px] outline-none focus:border-amber-400"
          />
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setNote(t.title)}
                  className="rounded-full border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-800 active:bg-amber-50"
                >
                  {t.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function TodayLine({ task, onLater }: { task: Task; onLater: () => void }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span className="w-11 shrink-0 text-sm font-bold tabular-nums text-primary">{task.due_time ?? ""}</span>
      <span className="min-w-0 flex-1 text-[15px] leading-snug">{task.title}</span>
      <button onClick={onLater} className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 active:scale-95">
        למחר
      </button>
    </li>
  );
}

function Choice({ className, onClick, children }: { className: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("flex items-center justify-center gap-1 rounded-xl py-2.5 active:scale-95", className)}>
      {children}
    </button>
  );
}
