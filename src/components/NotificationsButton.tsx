"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { useData } from "./DataProvider";
import { cn } from "./ui";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "checking" | "unsupported" | "disabled" | "enabled" | "busy";

export function NotificationsButton() {
  const { toast } = useData();
  const [state, setState] = useState<State>("checking");
  const [isIOS] = useState(
    () => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window),
  );

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setState(sub && Notification.permission === "granted" ? "enabled" : "disabled");
      } catch {
        setState("unsupported");
      }
    })();
  }, []);

  async function enable() {
    setState("busy");
    try {
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setState("disabled");
          if (perm === "denied") toast("ההתראות נחסמו בדפדפן. אפשר לאפשר אותן בהגדרות האתר.");
          return;
        }
      }
      if (Notification.permission !== "granted") {
        setState("disabled");
        toast("ההתראות נחסמו בדפדפן. אפשר לאפשר אותן בהגדרות האתר.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const res = await fetch("/api/push/public-key");
        const { key } = (await res.json()) as { key: string };
        if (!key) {
          setState("disabled");
          toast("התראות עדיין לא מוגדרות בשרת (חסר VAPID_PUBLIC_KEY).");
          return;
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
      }
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      setState("enabled");
      toast("התראות הופעלו");
    } catch (e) {
      console.error("[push] enable failed", e);
      setState("disabled");
      toast("הפעלת ההתראות נכשלה");
    }
  }

  if (state === "unsupported") return null;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={state === "enabled" || state === "busy" ? undefined : enable}
        disabled={state === "busy" || state === "checking"}
        title={state === "enabled" ? "התראות פעילות" : "הפעלת התראות"}
        className={cn(
          "shrink-0 rounded-xl p-2 transition",
          state === "enabled" ? "text-emerald-600 hover:bg-emerald-50" : "text-slate-500 hover:bg-slate-100 hover:text-ink",
        )}
      >
        {state === "enabled" ? <BellRing size={17} /> : state === "busy" ? <BellOff size={17} /> : <Bell size={17} />}
      </button>
      {isIOS && state !== "enabled" && (
        <span className="hidden max-w-[11rem] text-[11px] leading-tight text-muted sm:inline">
          באייפון, התראות עובדות רק כשהאתר מותקן למסך הבית (iOS 16.4+)
        </span>
      )}
    </div>
  );
}
