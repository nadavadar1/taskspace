"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Copy } from "lucide-react";
import { useData } from "./DataProvider";
import { Modal } from "./ui";

/** Subscribing the iPhone's Calendar to the app: one tap on webcal://, or the manual steps as a fallback. */
export function CalendarSyncSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useData();
  const [link, setLink] = useState<{ url: string; webcal: string } | null>(null);

  useEffect(() => {
    if (!open || link) return;
    fetch("/api/calendar/link")
      .then((r) => r.json())
      .then((d: { url?: string; webcal?: string }) => d.url && d.webcal && setLink({ url: d.url, webcal: d.webcal }))
      .catch(() => toast("לא הצלחתי ליצור את הקישור"));
  }, [open, link, toast]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast("הקישור הועתק ✓", { tone: "success" });
    } catch {
      toast("ההעתקה לא עבדה. לחיצה ארוכה על הקישור ו'העתק'");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="היומן של מרחב באייפון">
      <div className="space-y-4 text-sm leading-relaxed">
        <p className="text-muted">
          כל מה שיש לו שעה (פאדל, דיון, ההכנות) וכל אירוע יופיעו ביומן של האייפון, ליד הלו״ז הרגיל. מוסיפים ומשנים כאן
          באפליקציה, והאייפון מתעדכן לבד בערך פעם בשעה.
        </p>
        {link && (
          <div className="flex flex-col gap-2">
            <a
              href={link.webcal}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-white"
            >
              <CalendarPlus size={18} />
              הוספה ליומן באייפון
            </a>
            <button onClick={copy} className="flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 font-bold text-slate-600">
              <Copy size={16} />
              העתקת הקישור
            </button>
          </div>
        )}
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="mb-2 font-bold">אם הכפתור לא פתח את היומן</div>
          <ol className="list-decimal space-y-1.5 ps-5">
            <li>לוחצים &quot;העתקת הקישור&quot;.</li>
            <li>
              פותחים <b>הגדרות</b> ← <b>אפליקציות</b> ← <b>לוח שנה</b> ← <b>חשבונות לוח שנה</b> ← <b>הוספת חשבון</b> ← <b>אחר</b>.
            </li>
            <li>
              בוחרים <b>הוספת לוח שנה מנוי</b>, מדביקים את הקישור ולוחצים <b>הבא</b> ← <b>שמור</b>.
            </li>
          </ol>
          <p className="mt-2 text-xs text-muted">
            ההתראות מגיעות מהאפליקציה (הפעמון 🔔), לא מהיומן. היומן הוא לקריאה: מה שמוסיפים ביומן של האייפון לא נכנס
            לאפליקציה.
          </p>
        </div>
      </div>
    </Modal>
  );
}
