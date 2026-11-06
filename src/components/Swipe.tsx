"use client";

import { useRef, useState } from "react";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "./ui";

const THRESHOLD = 0.32; // share of the row's width that commits the swipe
const MIN_PX = 80;
const LONG_PRESS_MS = 480;

/**
 * Wraps a task row:
 * - drag it to the right → done (green), to the left → delete (red); a short drag springs back;
 * - long press (or right click) → onLongPress (the quick-actions sheet).
 * Vertical scrolling keeps working: the row only takes over once the finger clearly moves sideways.
 */
export function Swipeable({
  children,
  onDone,
  onDelete,
  onLongPress,
  done,
  className,
}: {
  children: React.ReactNode;
  onDone?: () => void;
  onDelete?: () => void;
  onLongPress?: () => void;
  /** The task is already done: the right swipe re-opens it. */
  done?: boolean;
  className?: string;
}) {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [width, setWidth] = useState(300);
  const ref = useRef<HTMLDivElement>(null);
  const g = useRef<{
    x: number;
    y: number;
    id: number;
    mode: "idle" | "swipe" | "scroll";
    width: number;
    suppressClick: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ x: 0, y: 0, id: -1, mode: "idle", width: 1, suppressClick: false, timer: null });

  function clearTimer() {
    if (g.current.timer) clearTimeout(g.current.timer);
    g.current.timer = null;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    // let buttons inside the row (tick, X) work normally
    if ((e.target as HTMLElement).closest("[data-no-swipe]")) return;
    g.current = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      mode: "idle",
      width: ref.current?.offsetWidth ?? 300,
      suppressClick: false,
      timer: null,
    };
    setWidth(g.current.width);
    if (onLongPress) {
      g.current.timer = setTimeout(() => {
        g.current.suppressClick = true;
        g.current.mode = "scroll"; // stop treating this touch as a swipe
        navigator.vibrate?.(15);
        onLongPress();
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = g.current;
    if (s.id !== e.pointerId || s.mode === "scroll") return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (s.mode === "idle") {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      clearTimer();
      if (Math.abs(mx) > Math.abs(my) * 1.3 && (onDone || onDelete)) {
        s.mode = "swipe";
        ref.current?.setPointerCapture(e.pointerId);
      } else {
        s.mode = "scroll";
        return;
      }
    }
    let v = mx;
    if (v > 0 && !onDone) v = v / 6;
    if (v < 0 && !onDelete) v = v / 6;
    setAnimating(false);
    setDx(v);
  }

  function finish(e: React.PointerEvent) {
    const s = g.current;
    if (s.id !== e.pointerId) return;
    clearTimer();
    if (s.mode !== "swipe") {
      s.id = -1;
      return;
    }
    s.suppressClick = true;
    s.id = -1;
    const limit = Math.max(MIN_PX, s.width * THRESHOLD);
    setAnimating(true);
    if (dx > limit && onDone) {
      setDx(s.width);
      setTimeout(() => {
        onDone();
        setAnimating(false);
        setDx(0);
      }, 180);
    } else if (dx < -limit && onDelete) {
      setDx(-s.width);
      setTimeout(() => {
        onDelete();
        setAnimating(false);
        setDx(0);
      }, 180);
    } else {
      setDx(0);
    }
  }

  const limitPx = Math.max(MIN_PX, width * THRESHOLD);
  const armed = Math.abs(dx) > limitPx;

  return (
    <div className={cn("relative overflow-hidden rounded-xl", className)}>
      {/* what the swipe will do, revealed behind the row */}
      {dx !== 0 && (
        <div
          className={cn(
            "absolute inset-0 flex items-center px-5 text-sm font-bold text-white transition-colors",
            dx > 0 ? "justify-start" : "justify-end",
            dx > 0 ? (armed ? "bg-emerald-500" : "bg-emerald-400/70") : armed ? "bg-red-600" : "bg-red-500/70",
          )}
          style={{ direction: "ltr" }}
          aria-hidden
        >
          {dx > 0 ? (
            <span className={cn("flex items-center gap-2 transition-transform", armed && "scale-110")}>
              {done ? <RotateCcw size={20} /> : <Check size={22} />}
              {done ? "לפתוח מחדש" : "בוצע"}
            </span>
          ) : (
            <span className={cn("flex items-center gap-2 transition-transform", armed && "scale-110")}>
              מחיקה
              <Trash2 size={20} />
            </span>
          )}
        </div>
      )}
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onContextMenu={(e) => {
          if (!onLongPress) return;
          e.preventDefault();
          clearTimer();
          onLongPress();
        }}
        onClickCapture={(e) => {
          if (g.current.suppressClick) {
            e.preventDefault();
            e.stopPropagation();
            g.current.suppressClick = false;
          }
        }}
        className="relative touch-pan-y select-none bg-surface [-webkit-touch-callout:none]"
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: animating ? "transform 0.18s ease-out" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
