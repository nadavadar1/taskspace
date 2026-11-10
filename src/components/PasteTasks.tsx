"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, Clock, Mic } from "lucide-react";
import { useData } from "./DataProvider";
import { Modal, cn, useLocalChoice } from "./ui";
import { addDays, relativeLabel } from "@/lib/dates";
import { splitPaste } from "@/lib/day-plan";
import { parseQuickTask } from "@/lib/quick-parse";

/**
 * Paste a whole list (e.g. from a chat) or dictate with the keyboard's microphone: every line or sentence
 * becomes a task, with its date / time / #space understood in the browser (free, no AI). A preview with
 * ticks comes first, so nothing is added by surprise.
 */
export function PasteTasks() {
  const { pasteText, closePaste } = useData();
  if (pasteText === null) return null;
  return <PasteSheet initial={pasteText} onClose={closePaste} />;
}

type DefaultDay = "today" | "tomorrow" | "none";
const DAYS: readonly DefaultDay[] = ["today", "tomorrow", "none"];

function PasteSheet({ initial, onClose }: { initial: string; onClose: () => void }) {
  const { spaces, today, addTask, toast } = useData();
  const [text, setText] = useState(initial);
  const spaceIds = useMemo(() => spaces.map((s) => String(s.id)), [spaces]);
  const [spaceKey, setSpaceKey] = useLocalChoice<string>("quick-add-space", spaceIds[0] ?? "", spaceIds);
  const [day, setDay] = useLocalChoice<DefaultDay>("paste-default-day", "today", DAYS);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const fallbackSpace = Number(spaceKey) || spaces[0]?.id;
  const fallbackDate = day === "today" ? today : day === "tomorrow" ? addDays(today, 1) : null;

  const items = useMemo(
    () =>
      splitPaste(text).map((line) => {
        const p = parseQuickTask(line.title, { today, spaces });
        return {
          ...p,
          description: line.description,
          due_date: p.due_date ?? fallbackDate,
          space_id: p.space_id ?? fallbackSpace,
        };
      }),
    [text, today, spaces, fallbackDate, fallbackSpace],
  );
  const chosen = items.filter((_, i) => !skipped.has(i));

  async function addAll() {
    if (!chosen.length || busy) return;
    setBusy(true);
    let n = 0;
    for (const t of chosen) {
      const created = await addTask({
        space_id: t.space_id,
        title: t.title,
        description: t.description || undefined,
        priority: t.priority ?? "medium",
        due_date: t.due_date,
        due_time: t.due_time,
        recurrence: t.recurrence,
        recurrence_n: t.recurrence_n,
      });
      if (created) n++;
    }
    setBusy(false);
    toast(n === 1 ? "נוספה משימה אחת" : `נוספו ${n} משימות`, { tone: "success" });
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="הדבקת רשימה או הכתבה"
      footer={
        <button
          onClick={() => void addAll()}
          disabled={!chosen.length || busy}
          className="w-full rounded-2xl bg-primary py-3.5 text-base font-bold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "מוסיף…" : chosen.length ? `להוסיף ${chosen.length === 1 ? "משימה אחת" : `${chosen.length} משימות`}` : "אין עדיין משימות"}
        </button>
      }
    >
      <textarea
        autoFocus={!initial}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSkipped(new Set());
        }}
        rows={initial ? 4 : 6}
        placeholder={"שורה לכל משימה, למשל:\nלשלוח לאמא הודעה\nלקבוע פאדל ליום חמישי ב-20:00\nלשלם ארנונה מחר #בית"}
        aria-label="רשימת משימות"
        className="w-full resize-none rounded-2xl border border-line bg-surface p-3 text-[15px] leading-relaxed outline-none focus:border-primary focus:ring-4 focus:ring-indigo-100"
      />
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
        <Mic size={13} className="shrink-0 text-primary" />
        בנייד: לוחצים על המיקרופון במקלדת ומכתיבים. כל משפט הופך למשימה.
      </p>

      <div className="mt-3 space-y-2">
        <Row label="בלי תאריך בטקסט ←">
          {(
            [
              ["today", "היום"],
              ["tomorrow", "מחר"],
              ["none", "בלי תאריך"],
            ] as const
          ).map(([k, label]) => (
            <Chip key={k} on={day === k} onClick={() => setDay(k)}>
              {label}
            </Chip>
          ))}
        </Row>
        {spaces.length > 1 && (
          <Row label="מרחב ←">
            {spaces.map((s) => (
              <Chip key={s.id} on={fallbackSpace === s.id} color={s.color} onClick={() => setSpaceKey(String(s.id))}>
                {s.name}
              </Chip>
            ))}
          </Row>
        )}
      </div>

      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {items.map((t, i) => {
            const off = skipped.has(i);
            const space = spaces.find((s) => s.id === t.space_id);
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() =>
                    setSkipped((s) => {
                      const n = new Set(s);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                  className={cn("flex w-full items-start gap-3 px-3 py-2.5 text-start transition active:bg-slate-50", off && "opacity-45")}
                  aria-pressed={!off}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
                      off ? "border-slate-300" : "border-primary bg-primary text-white",
                    )}
                  >
                    {!off && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[15px] font-medium leading-snug", off && "line-through")}>{t.title}</span>
                    {t.description && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t.description}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-bold">
                      {space && (
                        <span className="inline-flex items-center gap-1 text-muted">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: space.color }} />
                          {space.name}
                        </span>
                      )}
                      {t.due_date && (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <CalendarDays size={12} />
                          {relativeLabel(t.due_date, today)}
                        </span>
                      )}
                      {t.due_time && (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <Clock size={12} />
                          {t.due_time}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 0 && <p className="mt-1.5 text-xs text-muted">לחיצה על משימה מוציאה אותה מהרשימה.</p>}
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-bold text-muted">{label}</span>
      {children}
    </div>
  );
}

function Chip({ on, color, onClick, children }: { on: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-bold transition active:scale-95",
        on ? "border-transparent text-white" : "border-line bg-surface text-slate-600",
      )}
      style={on ? { backgroundColor: color ?? "var(--primary)" } : undefined}
    >
      {children}
    </button>
  );
}
