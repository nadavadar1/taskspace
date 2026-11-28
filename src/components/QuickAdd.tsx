"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarDays, Check, Clock, CornerDownLeft, Flag, Layers, Mic, Repeat, Sparkles, StickyNote, Wand2 } from "lucide-react";
import { useData } from "./DataProvider";
import { cn, useLocalChoice } from "./ui";
import { useNowHM } from "./TodayPlan";
import { PRIORITY_MAP } from "@/lib/constants";
import { formatShort, relativeLabel, shiftTime } from "@/lib/dates";
import { KIND_LABEL, planPrep } from "@/lib/event-prep";
import { parseQuickTask } from "@/lib/quick-parse";
import { recurrenceLabel } from "@/lib/recurrence";
import { newChecklistId } from "@/lib/recurrence";

const EXAMPLES = [
  "להתקשר לסופי מחר ב-10:00 #לימודים",
  "ניקיון הבית כל 3 ימים #בית",
  "להגיש עבודה ביום חמישי דחוף",
  "לקרוא 10 דקות כל יום ב-21:30",
];

type Recognizer = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

/**
 * One line, everyday Hebrew. The date, time, priority, #space and repeat are understood in the browser
 * (no AI, so it costs nothing) and shown as chips before saving.
 */
export function QuickAdd({
  spaceId,
  autoFocus,
  onAdded,
  compact,
}: {
  /** When set, new tasks go to this space unless the text says #another. */
  spaceId?: number;
  autoFocus?: boolean;
  onAdded?: () => void;
  compact?: boolean;
}) {
  const { spaces, today, addTask, openNewTask, toast } = useData();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const spaceIds = useMemo(() => spaces.map((s) => String(s.id)), [spaces]);
  const [lastSpace, setLastSpace] = useLocalChoice<string>("quick-add-space", spaceIds[0] ?? "", spaceIds);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseQuickTask(text, { today, spaces }), [text, today, spaces]);
  const nowHM = useNowHM();
  const plan = useMemo(
    () => (parsed.due_date && parsed.due_time ? planPrep(parsed.title, parsed.note, parsed.due_date, parsed.due_time, today, nowHM) : null),
    [parsed, today, nowHM],
  );
  // prep suggestions the user un-ticked (by title); cleared whenever the text changes
  const [off, setOff] = useState<string[]>([]);
  const prep = plan?.prep.filter((p) => !off.includes(p.title)) ?? [];

  const recRef = useRef<Recognizer | null>(null);
  const [listening, setListening] = useState(false);
  function dictate() {
    if (listening) return recRef.current?.stop();
    const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      inputRef.current?.focus();
      toast("לוחצים על המיקרופון במקלדת ומדברים");
      return;
    }
    const before = text.trim();
    const r = new SR();
    r.lang = "he-IL";
    r.interimResults = true;
    r.onresult = (e) => {
      const said = Array.from(e.results, (x) => x[0].transcript).join(" ");
      setText(before ? `${before} ${said}` : said);
      setOff([]);
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      if (e.error !== "no-speech" && e.error !== "aborted") toast("ההקלטה לא עבדה. אפשר ללחוץ על המיקרופון במקלדת");
    };
    recRef.current = r;
    setListening(true);
    r.start();
  }
  const fallbackSpace = spaceId ?? (Number(lastSpace) || spaces[0]?.id);
  const targetSpaceId = parsed.space_id ?? fallbackSpace;
  const target = spaces.find((s) => s.id === targetSpaceId);
  const has = text.trim().length > 0;

  async function submit() {
    if (!has || busy || !target) return;
    setBusy(true);
    const created = await addTask({
      space_id: target.id,
      title: parsed.title,
      priority: parsed.priority ?? "medium",
      due_date: parsed.due_date,
      due_time: parsed.due_time,
      end_time: parsed.end_time,
      leave_min: plan?.leave ?? null,
      checklist: (plan?.steps ?? []).map((text) => ({ id: newChecklistId(), text, done: false })),
      description: parsed.note,
      recurrence: parsed.recurrence,
      recurrence_n: parsed.recurrence_n,
    });
    if (created) {
      const when = `${formatShort(created.due_date ?? today)} ${created.due_time ?? ""}`.trim();
      for (const p of prep) {
        await addTask({
          space_id: target.id,
          title: p.title,
          priority: "high",
          due_date: p.due_date,
          due_time: p.due_time,
          description: `הכנה ל: ${created.title} (${when})`,
        });
      }
    }
    setBusy(false);
    if (created) {
      setText("");
      setOff([]);
      toast(prep.length ? `נוסף: ${created.title}, ועוד ${prep.length} הכנות` : `נוספה ל${target.name}: ${created.title}`);
      onAdded?.();
      inputRef.current?.focus();
    }
  }

  function moreOptions() {
    openNewTask({
      space_id: target?.id,
      title: has ? parsed.title : "",
      due_date: parsed.due_date,
      due_time: parsed.due_time,
      end_time: parsed.end_time,
      priority: parsed.priority ?? undefined,
      recurrence: parsed.recurrence,
      recurrence_n: parsed.recurrence_n,
    });
    setText("");
    onAdded?.();
  }

  const chips: { icon: React.ReactNode; label: string; color?: string }[] = [];
  if (has) {
    if (parsed.due_date)
      chips.push({ icon: <CalendarDays size={13} />, label: relativeLabel(parsed.due_date, today) });
    if (parsed.due_time)
      chips.push({ icon: <Clock size={13} />, label: parsed.end_time ? `${parsed.due_time} עד ${parsed.end_time}` : parsed.due_time });
    if (parsed.note) chips.push({ icon: <StickyNote size={13} />, label: "הערה" });
    if (parsed.priority)
      chips.push({ icon: <Flag size={13} />, label: PRIORITY_MAP[parsed.priority].label, color: PRIORITY_MAP[parsed.priority].color });
    if (parsed.recurrence !== "none")
      chips.push({ icon: <Repeat size={13} />, label: recurrenceLabel(parsed.recurrence, parsed.recurrence_n) });
  }

  return (
    <div className={cn("rounded-2xl border border-line bg-surface shadow-soft transition focus-within:border-primary focus-within:ring-4 focus-within:ring-indigo-100", compact ? "p-1.5" : "p-2")}>
      <div className="flex items-center gap-2">
        <span className="ms-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Wand2 size={16} />
        </span>
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOff([]);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={compact ? "מה צריך לעשות?" : `הוספה מהירה, למשל: "${EXAMPLES[0]}"`}
          aria-label="הוספה מהירה של משימה"
          data-quick-add
          className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={dictate}
          aria-label={listening ? "עצירת ההקלטה" : "הקלטה: לדבר במקום להקליד"}
          aria-pressed={listening}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition",
            listening ? "animate-pulse bg-red-500 text-white" : "text-slate-500 hover:bg-slate-100",
          )}
        >
          <Mic size={18} />
        </button>
        {has ? (
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-white transition hover:bg-indigo-600 disabled:opacity-60"
          >
            הוספה
            <CornerDownLeft size={14} className="hidden sm:block" />
          </button>
        ) : (
          <button
            onClick={moreOptions}
            className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100"
          >
            עוד אפשרויות
          </button>
        )}
      </div>

      {has && (
        <div className="anim-fade mt-1.5 flex flex-wrap items-center gap-1.5 px-1.5 pb-1">
          {/* where it goes: tap to change (unless the text says #space) */}
          {spaces.map((s) => {
            const on = s.id === targetSpaceId;
            if (parsed.space_id && !on) return null;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => !parsed.space_id && !spaceId && setLastSpace(String(s.id))}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition",
                  on ? "text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                  !!(parsed.space_id || spaceId) && !on && "hidden",
                )}
                style={on ? { backgroundColor: s.color } : undefined}
                title={parsed.space_id ? "נקבע לפי # בטקסט" : "לחיצה בוחרת מרחב"}
              >
                {on ? <Layers size={12} /> : <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />}
                {s.name}
              </button>
            );
          })}
          {chips.map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary"
              style={c.color ? { backgroundColor: `${c.color}1f`, color: c.color } : undefined}
            >
              {c.icon}
              {c.label}
            </span>
          ))}
          <span className="ms-auto hidden text-[11px] text-muted sm:inline">Enter לשמירה</span>
        </div>
      )}

      {has && plan && (plan.kind || plan.prep.length > 0) && (
        <div className="anim-fade mx-1.5 mb-1 mt-2 rounded-xl bg-slate-50 p-3 text-sm" data-prep>
          <div className="mb-1.5 font-bold">
            {plan.kind ? `${KIND_LABEL[plan.kind]} · ` : ""}
            {relativeLabel(parsed.due_date!, today)} {parsed.due_time}
            {parsed.end_time ? ` עד ${parsed.end_time}` : ""}
            {plan.leave && parsed.due_time && (
              <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                🚗 לצאת ב-{shiftTime(parsed.due_time, -plan.leave)}
              </span>
            )}
          </div>
          {plan.prep.length > 0 ? (
            <>
              <div className="mb-1 text-xs text-muted">הכנות שאני מציע (לחיצה מורידה):</div>
              <ul className="space-y-1.5">
                {plan.prep.map((p) => {
                  const on = !off.includes(p.title);
                  return (
                    <li key={p.title}>
                      <button
                        type="button"
                        onClick={() => setOff((o) => (on ? [...o, p.title] : o.filter((x) => x !== p.title)))}
                        className={cn("flex w-full items-start gap-2 text-start", !on && "opacity-40")}
                        aria-pressed={on}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            on ? "border-primary bg-primary text-white" : "border-slate-300",
                          )}
                        >
                          {on && <Check size={11} />}
                        </span>
                        <span className="min-w-0">
                          <span className={cn("font-medium", !on && "line-through")}>{p.title}</span>
                          <span className="text-xs text-muted">
                            {" · "}
                            {relativeLabel(p.due_date, today)}
                            {p.due_time ? ` ${p.due_time}` : ""}
                          </span>
                          <span className="block text-[11px] text-muted">{p.why}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : plan.steps.length > 0 ? (
            <div className="text-xs text-muted">לקחת: {plan.steps.join(", ")}. מופיע כצעדים במשימה.</div>
          ) : (
            <div className="text-xs text-muted">תקבל התראה רבע שעה לפני.</div>
          )}
        </div>
      )}

      {!has && !compact && (
        <p className="hidden items-center gap-1.5 px-2 pb-1 pt-1 text-[11px] text-muted sm:flex">
          <Sparkles size={12} className="shrink-0" />
          <span>
            מבין לבד: היום / מחר / יום חמישי / 12.11, שעה (18:00), דחוף / חשוב, ״כל 3 ימים״, ו-#מרחב
          </span>
        </p>
      )}
    </div>
  );
}
