"use client";

import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { useData } from "./DataProvider";
import { Modal } from "./ui";

/**
 * The lock-screen image of today's plan: a preview, the private link, and how to make the iPhone
 * set it as the wallpaper every morning (Shortcuts → Automation). Free: no app or service needed.
 */
export function WallpaperSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useData();
  const [url, setUrl] = useState<string | null>(null);
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    if (!open || url) return;
    fetch("/api/wallpaper/link")
      .then((r) => r.json())
      .then((d: { url?: string }) => setUrl(d.url ?? null))
      .catch(() => toast("לא הצלחתי ליצור את הקישור"));
  }, [open, url, toast]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast("הקישור הועתק ✓", { tone: "success" });
    } catch {
      toast("ההעתקה לא עבדה. לחיצה ארוכה על הקישור ו'העתק'");
    }
  }

  async function rotate() {
    if (!confirm("ליצור קישור חדש? הקישור הישן יפסיק לעבוד, וצריך להדביק את החדש בקיצור.")) return;
    const r = await fetch("/api/wallpaper/link", { method: "POST" });
    const d = (await r.json()) as { url?: string };
    if (d.url) {
      setUrl(d.url);
      toast("נוצר קישור חדש");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="תוכנית היום על מסך הנעילה">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-muted">
          תמונה שמתעדכנת לבד עם &quot;הכי חשוב היום&quot; והמשימות לפי שעות. האייפון יחליף אותה כל בוקר, וכל פעם שמרימים את
          הטלפון רואים מה עכשיו.
        </p>

        {url && (
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a live, private image */}
            <img
              src={`${url}&t=${stamp}`}
              alt="תצוגה מקדימה של מסך הנעילה"
              className="h-56 w-auto shrink-0 rounded-2xl border border-line shadow-soft"
            />
            <div className="flex min-w-0 flex-col gap-2">
              <button onClick={copy} className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">
                <Copy size={16} />
                העתקת הקישור
              </button>
              <button onClick={() => setStamp(Date.now())} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-slate-600">
                רענון התצוגה
              </button>
              <p className="break-all text-[11px] leading-snug text-muted">{url}</p>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed">
          <div className="mb-2 font-bold">הגדרה חד־פעמית באייפון (2 דקות)</div>
          <ol className="list-decimal space-y-1.5 ps-5">
            <li>לוחצים למעלה על &quot;העתקת הקישור&quot;.</li>
            <li>
              פותחים את האפליקציה <b>קיצורים</b> (Shortcuts), ולמטה בוחרים <b>אוטומציה</b>.
            </li>
            <li>
              לוחצים <b>+</b> ← <b>שעה ביום</b> ← בוחרים <b>07:00</b>, <b>יומי</b>, ו<b>להריץ מייד</b> ← <b>הבא</b>.
            </li>
            <li>
              מוסיפים פעולה: מחפשים <b>קבלת תוכן מ-URL</b> (Get Contents of URL), ומדביקים במקום ה-URL את הקישור.
            </li>
            <li>
              מוסיפים פעולה שנייה: <b>קביעת תמונת רקע</b> (Set Wallpaper) ← בוחרים <b>מסך נעילה</b>, ובפעולה פותחים את החץ
              ומכבים <b>הצג תצוגה מקדימה</b>.
            </li>
            <li>
              <b>סיום</b>. רוצים שיתעדכן גם בצהריים? עוד אוטומציה זהה ל-13:00.
            </li>
          </ol>
          <p className="mt-2 text-xs text-muted">
            בפעם הראשונה האייפון עשוי לבקש לבחור תמונת רקע שאפשר להחליף. בוחרים את זו שהקיצור יצר.
          </p>
        </div>

        <button onClick={rotate} className="flex items-center gap-1.5 text-xs font-bold text-muted">
          <RefreshCw size={13} />
          הקישור דלף? ליצור קישור חדש
        </button>
      </div>
    </Modal>
  );
}
