"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "./ui";
import { newChecklistId } from "@/lib/recurrence";
import type { ChecklistItem } from "@/lib/types";

export function StepCheck({ done, onToggle, size = 20 }: { done: boolean; onToggle: () => void; size?: number }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border-2 transition hover:scale-110",
        done ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-surface",
      )}
      style={{ width: size, height: size }}
      aria-label={done ? "ביטול סימון הצעד" : "סימון הצעד כבוצע"}
      aria-pressed={done}
    >
      {done && (
        <svg className="anim-check" width={size * 0.6} height={size * 0.6} viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export function ChecklistProgressBar({ items }: { items: ChecklistItem[] }) {
  if (!items.length) return null;
  const done = items.filter((i) => i.done).length;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${(done / items.length) * 100}%` }}
        />
      </div>
      <span className="text-xs font-bold text-muted">
        {done}/{items.length}
      </span>
    </div>
  );
}

/** Edits a task's small steps: tick, rename, remove, add (Enter adds the next one right away). */
export function ChecklistEditor({
  items,
  onChange,
  large,
  fixedText,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  large?: boolean;
  /** Steps can be ticked, added and removed but not renamed (each change is saved right away). */
  fixedText?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: newChecklistId(), text: text.slice(0, 200), done: false }]);
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      {items.length > 0 && <ChecklistProgressBar items={items} />}
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id} className={cn("group flex items-center gap-2.5 rounded-xl px-1.5", large ? "py-2" : "py-1")}>
            <StepCheck
              done={it.done}
              size={large ? 24 : 20}
              onToggle={() => onChange(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
            />
            {fixedText ? (
              <span
                onClick={() => onChange(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
                className={cn("min-w-0 flex-1 cursor-pointer", large ? "text-base" : "text-sm", it.done && "text-muted line-through")}
              >
                {it.text}
              </span>
            ) : (
            <input
              value={it.text}
              onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, text: e.target.value.slice(0, 200) } : x)))}
              onBlur={(e) => !e.target.value.trim() && onChange(items.filter((x) => x.id !== it.id))}
              className={cn(
                "min-w-0 flex-1 bg-transparent outline-none",
                large ? "text-base" : "text-sm",
                it.done && "text-muted line-through",
              )}
              aria-label="צעד"
            />
            )}
            <button
              type="button"
              onClick={() => onChange(items.filter((x) => x.id !== it.id))}
              className="rounded-lg p-1 text-slate-400 opacity-60 transition hover:bg-slate-100 hover:text-red-600 group-hover:opacity-100"
              aria-label="מחיקת הצעד"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-2.5 py-1.5 focus-within:border-primary">
        <Plus size={15} className="shrink-0 text-slate-400" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.stopPropagation();
              add();
            }
          }}
          onBlur={add}
          placeholder={items.length ? "עוד צעד..." : "לפרק לצעדים קטנים (Enter מוסיף)"}
          className="min-w-0 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-slate-400"
          aria-label="צעד חדש"
          data-step-input
        />
      </div>
    </div>
  );
}
