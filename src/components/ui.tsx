"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { PRIORITY_MAP, STATUS_MAP } from "@/lib/constants";
import type { Priority, Status } from "@/lib/types";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
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
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          "anim-pop flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl",
          maxWidth,
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
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
        {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
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

export function Toasts({ toasts }: { toasts: { id: number; message: string }[] }) {
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} className="anim-slide rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
          {t.message}
        </div>
      ))}
    </div>
  );
}
