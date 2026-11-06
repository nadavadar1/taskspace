"use client";

import { Hand, X } from "lucide-react";
import { useLocalChoice } from "./ui";

const STATES = ["show", "hidden"] as const;

/** A one-time hint about the gestures. Closed once, it stays closed on this device. */
export function GestureTip() {
  const [state, setState] = useLocalChoice<(typeof STATES)[number]>("tip-gestures-v1", "show", STATES);
  if (state === "hidden") return null;
  return (
    <div className="anim-fade mb-4 flex items-start gap-3 rounded-2xl border border-indigo-200 bg-primary-soft px-4 py-3 text-sm text-primary" role="note">
      <Hand size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 leading-relaxed">
        <b>טיפ:</b> גוררים משימה <b>ימינה ✓</b> כדי לסיים, <b>שמאלה 🗑</b> כדי למחוק. <b>לחיצה ארוכה</b> פותחת פעולות מהירות (לדחות למחר, עדיפות, מרחב).
        <span className="hidden sm:inline"> במחשב: קליק ימני.</span>
      </div>
      <button
        onClick={() => setState("hidden")}
        className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-indigo-100"
        aria-label="הבנתי, לסגור את הטיפ"
      >
        <X size={16} />
      </button>
    </div>
  );
}
