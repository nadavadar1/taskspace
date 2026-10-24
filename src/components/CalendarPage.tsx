"use client";

import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { useData } from "./DataProvider";
import { CalendarView } from "./CalendarView";
import { cn, useMounted } from "./ui";

/**
 * One calendar for everything: every space together, each in its own colour.
 * The chips only hide spaces on this page (they are not saved, unlike the dashboard's picker).
 */
export function CalendarPage() {
  const { spaces, openNewTask } = useData();
  const mounted = useMounted();
  const [hidden, setHidden] = useState<number[]>([]);

  const shown = useMemo(() => spaces.filter((s) => !hidden.includes(s.id)), [spaces, hidden]);

  function toggle(id: number) {
    setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">יומן</h1>
          <p className="text-sm text-muted">כל המרחבים ביחד, כל אחד בצבע שלו</p>
        </div>
        <button
          onClick={() => openNewTask()}
          disabled={!spaces.length}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-600 disabled:opacity-50"
        >
          <Plus size={16} />
          משימה חדשה
        </button>
      </div>

      {spaces.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="me-1 text-sm font-medium text-slate-500">מציג:</span>
          {spaces.map((s) => {
            const on = !hidden.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                  on ? "text-white" : "border-line bg-surface text-slate-500 hover:bg-slate-50",
                )}
                style={on ? { backgroundColor: s.color, borderColor: s.color } : undefined}
              >
                {on ? <Check size={14} /> : <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />}
                {s.name}
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-surface py-10 text-center text-sm text-muted">
          {spaces.length ? "בחר לפחות מרחב אחד כדי לראות אותו ביומן." : "אין עדיין מרחבים. צור את הראשון מהסרגל למעלה."}
        </p>
      ) : (
        // dnd-kit generates ids that differ between server and client, so render after hydration
        mounted && <CalendarView spaces={shown} />
      )}
    </div>
  );
}
