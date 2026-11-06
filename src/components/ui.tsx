"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { PRIORITY_MAP, STATUS_MAP } from "@/lib/constants";
import type { Priority, Status } from "@/lib/types";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

const noopSubscribe = () => () => {};

/**
 * A small per-device preference kept in localStorage (e.g. which dashboard view was last used).
 * The server and the first client render use `fallback`, so there is no hydration mismatch; storage can be blocked.
 */
export function useLocalChoice<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const event = `local-choice:${key}`;
  const subscribe = useCallback(
    (onChange: () => void) => {
      window.addEventListener("storage", onChange);
      window.addEventListener(event, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(event, onChange);
      };
    },
    [event],
  );
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        const v = localStorage.getItem(key);
        return (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(key, v);
      } catch {
        /* blocked storage: the choice just won't be remembered */
      }
      window.dispatchEvent(new Event(event));
    },
    [key, event],
  );
  return [value, set];
}

/** False during server rendering and hydration, true afterwards. Used for widgets whose generated ids differ between server and client (dnd-kit). */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          "anim-slide flex max-h-[94dvh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl sm:max-h-[92vh] sm:rounded-3xl",
          maxWidth,
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-center justify-between border-b border-line px-5 py-3 sm:py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition hover:bg-slate-100 hover:text-ink"
            aria-label="סגירה"
          >
            <X size={18} />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-3">{footer}</div>}
      </div>
    </div>
  );
}

export function PriorityBadge({ priority, small }: { priority: Priority; small?: boolean }) {
  const p = PRIORITY_MAP[priority];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full font-medium",
        small ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
      )}
      style={{ backgroundColor: `${p.color}1a`, color: p.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
      {p.label}
    </span>
  );
}

export function StatusIcon({ status, size = 16 }: { status: Status; size?: number }) {
  const color = STATUS_MAP[status].color;
  const common = { width: size, height: size, viewBox: "0 0 20 20", fill: "none", "aria-hidden": true } as const;
  switch (status) {
    case "done":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="9" fill={color} />
          <path d="M6 10.3l2.7 2.7L14 7.6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "in_progress":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="8.2" stroke={color} strokeWidth="2" />
          <path d="M10 1.8a8.2 8.2 0 0 1 0 16.4z" fill={color} />
        </svg>
      );
    case "on_hold":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="8.2" stroke={color} strokeWidth="2" />
          <path d="M8 6.8v6.4M12 6.8v6.4" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "not_done":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="8.2" stroke={color} strokeWidth="2" />
          <path d="M7 7l6 6M13 7l-6 6" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="8.2" stroke={color} strokeWidth="2" strokeDasharray="3 3" />
        </svg>
      );
  }
}

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_MAP[status];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: s.color }}>
      <StatusIcon status={status} size={14} />
      {s.label}
    </span>
  );
}

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: { id: number; message: string; tone?: "default" | "success"; action?: { label: string; run: () => void } }[];
  onDismiss: (id: number) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-24">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "anim-slide pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-lift",
            t.tone === "success" ? "bg-emerald-600 text-white" : "bg-ink text-surface",
          )}
        >
          {t.tone === "success" && (
            <svg className="anim-check shrink-0" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <circle cx="10" cy="10" r="9" fill="#ffffff33" />
              <path d="M6 10.3l2.7 2.7L14 7.6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                onDismiss(t.id);
              }}
              className="shrink-0 rounded-lg bg-white/20 px-2.5 py-1 text-xs font-bold transition hover:bg-white/30"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ theme ------------------------------ */

export type ThemeChoice = "auto" | "light" | "dark";
const THEMES: readonly ThemeChoice[] = ["auto", "light", "dark"];


export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, setTheme] = useLocalChoice<ThemeChoice>("theme", "auto", THEMES);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "auto") delete el.dataset.theme;
    else el.dataset.theme = theme;
  }, [theme]);
  return [theme, setTheme];
}

/* --------------------------- celebration --------------------------- */

const BURST_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#f97316"];

/** A short confetti burst. Renders nothing until `nonce` goes above zero; each new nonce starts a new burst. */
export function Celebration({ nonce }: { nonce: number }) {
  if (nonce === 0) return null;
  return <Burst key={nonce} seed={nonce} />;
}

function Burst({ seed }: { seed: number }) {
  // deterministic per burst (no Math.random in render)
  const bits = Array.from({ length: 22 }, (_, i) => {
    const a = ((i * 137.5 + seed * 47) % 360) * (Math.PI / 180);
    const dist = 120 + ((i * 53 + seed * 31) % 110);
    return {
      dx: Math.cos(a) * dist,
      dy: Math.sin(a) * dist - 60,
      rot: ((i * 97 + seed * 13) % 540) - 270,
      color: BURST_COLORS[(i + seed) % BURST_COLORS.length],
      delay: (i % 5) * 0.02,
    };
  });
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center" aria-hidden>
      <div className="relative">
        {bits.map((b, i) => (
          <span
            key={i}
            className="confetti-bit"
            style={
              {
                backgroundColor: b.color,
                animationDelay: `${b.delay}s`,
                "--dx": `${b.dx}px`,
                "--dy": `${b.dy}px`,
                "--rot": `${b.rot}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ misc ------------------------------- */

/** A progress ring (0..1). */
export function ProgressRing({
  value,
  size = 64,
  stroke = 7,
  color = "var(--primary)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted">
      {children}
    </kbd>
  );
}

/* ------------------------------ phone ------------------------------ */

const PHONE_QUERY = "(max-width: 639px)";
const subscribePhone = (cb: () => void) => {
  const m = window.matchMedia(PHONE_QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** True on a phone-sized screen. False while rendering on the server, so use it only in parts drawn after mount. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}

/** A sheet that slides up from the bottom on a phone (a centred card on a computer). */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="anim-slide w-full max-w-md rounded-t-3xl bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lift sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>
        {title && <div className="px-5 pb-1 pt-3 text-lg font-bold">{title}</div>}
        <div className="scroll-thin max-h-[75vh] overflow-y-auto px-3 pb-2 pt-1">{children}</div>
      </div>
    </div>
  );
}
