"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, ChevronDown, Pause, Pencil, Play, RotateCcw, SkipForward, Target } from "lucide-react";
import { useData } from "./DataProvider";
import { ChecklistEditor } from "./Checklist";
import { DueLabel, TaskExtras } from "./TaskCard";
import { PriorityBadge, ProgressRing, StatusIcon, cn, useMounted } from "./ui";
import { focusQueue } from "@/lib/focus";
import type { Task } from "@/lib/types";

const PRESETS = [5, 15, 25, 45];
const TIMER_KEY = "focus-timer";

interface TimerState {
  taskId: number | null;
  minutes: number;
  /** epoch ms when it ends, while running */
  endAt: number | null;
  /** ms left, while paused */
  left: number | null;
}

function loadTimer(): TimerState {
  try {
    const v = JSON.parse(localStorage.getItem(TIMER_KEY) ?? "null");
    if (v && typeof v.minutes === "number") return v as TimerState;
  } catch {
    /* blocked storage */
  }
  return { taskId: null, minutes: 25, endAt: null, left: null };
}

function saveTimer(t: TimerState) {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(t));
  } catch {
    /* the timer just won't survive a reload */
  }
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((at) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.22);
    });
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* no sound available */
  }
}

export function FocusView() {
  // the timer lives in localStorage, so render after mount (no server/client mismatch)
  const mounted = useMounted();
  if (!mounted) return <div className="min-h-[60vh]" />;
  return <FocusInner />;
}

function FocusInner() {
  const { tasks, spaces, today, patchTask, openTask } = useData();
  const params = useSearchParams();
  const queue = useMemo(() => focusQueue(tasks, today), [tasks, today]);
  const [timer, setTimerState] = useState<TimerState>(loadTimer);
  const [skipped, setSkipped] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(() => {
    const fromUrl = Number(params.get("task"));
    return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : timer.taskId;
  });
  const [showPicker, setShowPicker] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);

  const setTimer = (t: TimerState) => {
    setTimerState(t);
    saveTimer(t);
  };

  const current: Task | undefined =
    (picked !== null ? queue.find((t) => t.id === picked) : undefined) ??
    queue.find((t) => !skipped.includes(t.id)) ??
    queue[0];
  const space = current ? spaces.find((s) => s.id === current.space_id) : undefined;
  const upNext = queue.filter((t) => t.id !== current?.id).slice(0, 8);

  const running = timer.endAt !== null;
  const totalMs = timer.minutes * 60_000;
  const leftMs = running ? Math.max(0, timer.endAt! - now) : (timer.left ?? totalMs);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (timer.endAt !== null && n >= timer.endAt) {
        setTimerState((cur) => {
          const next = { ...cur, endAt: null, left: null };
          saveTimer(next);
          return next;
        });
        setFinished(true);
        beep();
      }
    }, 250);
    return () => clearInterval(t);
  }, [running, timer.endAt]);

  useEffect(() => {
    if (!running) return;
    const prev = document.title;
    const mm = Math.floor(leftMs / 60000);
    const ss = Math.floor((leftMs % 60000) / 1000);
    document.title = `${mm}:${String(ss).padStart(2, "0")} · פוקוס`;
    return () => {
      document.title = prev;
    };
  }, [running, leftMs]);

  function start() {
    if (!current) return;
    setFinished(false);
    const left = timer.left ?? totalMs;
    setNow(Date.now());
    setTimer({ ...timer, taskId: current.id, endAt: Date.now() + left, left: null });
    if (current.status === "new") void patchTask(current.id, { status: "in_progress" });
  }
  function pause() {
    setTimer({ ...timer, endAt: null, left: leftMs });
  }
  function reset(minutes = timer.minutes) {
    setFinished(false);
    setTimer({ taskId: current?.id ?? null, minutes, endAt: null, left: null });
  }
  function next() {
    if (!current) return;
    setSkipped((s) => [...s, current.id]);
    setPicked(queue.find((t) => t.id !== current.id && !skipped.includes(t.id))?.id ?? null);
    setFinished(false);
  }
  function complete() {
    if (!current) return;
    const id = current.id;
    void patchTask(id, { status: "done" });
    setPicked(queue.find((t) => t.id !== id && !skipped.includes(t.id))?.id ?? null);
    reset();
  }

  if (!current) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-3xl border border-line bg-surface p-10 text-center shadow-soft">
        <div className="mb-3 text-5xl">🎉</div>
        <h1 className="mb-1 text-xl font-bold">אין משימות פתוחות</h1>
        <p className="mb-5 text-sm text-muted">הכול סגור. זמן טוב למנוחה.</p>
        <Link href="/" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white">
          חזרה לדשבורד
        </Link>
      </div>
    );
  }

  const mm = Math.floor(leftMs / 60000);
  const ss = Math.floor((leftMs % 60000) / 1000);
  const color = space?.color ?? "var(--primary)";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Target size={20} className="text-primary" />
          מצב פוקוס
        </h1>
        <span className="text-sm text-muted">משימה אחת בכל פעם · עוד {queue.length - 1} בתור</span>
      </div>

      {/* the one task */}
      <section className="anim-pop overflow-hidden rounded-3xl border border-line bg-surface shadow-lift" key={current.id}>
        <div className="h-2" style={{ backgroundColor: color }} />
        <div className="p-5 sm:p-7">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {space && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ backgroundColor: space.color }}>
                {space.name}
              </span>
            )}
            <PriorityBadge priority={current.priority} />
            <DueLabel task={current} today={today} />
            <TaskExtras task={current} />
            <button
              onClick={() => openTask(current.id)}
              className="ms-auto rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-ink"
              aria-label="עריכת המשימה"
            >
              <Pencil size={16} />
            </button>
          </div>

          <h2 className="mb-2 flex items-start gap-2.5 text-2xl font-bold leading-snug sm:text-3xl">
            <span className="mt-1.5 shrink-0">
              <StatusIcon status={current.status} size={22} />
            </span>
            {current.title}
          </h2>
          {current.description && <p className="mb-4 whitespace-pre-line text-[15px] text-slate-600">{current.description}</p>}

          <div className="mt-5 rounded-2xl bg-surface-2 p-3 sm:p-4">
            <div className="mb-2 text-sm font-bold text-slate-700">
              {current.checklist.length ? "הצעדים" : "תקוע? פרק לצעד ראשון קטן (5 דקות)"}
            </div>
            <ChecklistEditor
              large
              fixedText
              items={current.checklist}
              onChange={(items) => void patchTask(current.id, { checklist: items })}
            />
          </div>

          {/* timer */}
          <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <ProgressRing value={1 - leftMs / totalMs} size={112} stroke={9} color={color}>
              <div className="text-center">
                <div className="text-2xl font-bold tabular-nums" dir="ltr">
                  {mm}:{String(ss).padStart(2, "0")}
                </div>
                <div className="text-[11px] text-muted">{running ? "מתמקדים" : "דקות"}</div>
              </div>
            </ProgressRing>
            <div className="flex flex-1 flex-col items-center gap-3 sm:items-start">
              <div className="flex gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => reset(p)}
                    disabled={running}
                    className={cn(
                      "rounded-xl border px-3 py-1.5 text-sm font-bold transition disabled:opacity-40",
                      timer.minutes === p ? "border-primary bg-primary-soft text-primary" : "border-line text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {running ? (
                  <button onClick={pause} className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">
                    <Pause size={16} /> השהיה
                  </button>
                ) : (
                  <button
                    onClick={start}
                    className="anim-pulse-ring flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-bold text-white transition hover:brightness-110"
                    style={{ backgroundColor: color }}
                  >
                    <Play size={16} /> {timer.left ? "להמשיך" : `להתחיל ${timer.minutes} דקות`}
                  </button>
                )}
                {(running || timer.left) && (
                  <button onClick={() => reset()} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="איפוס הטיימר">
                    <RotateCcw size={16} />
                  </button>
                )}
              </div>
              {finished && (
                <p className="anim-fade rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                  הזמן נגמר! סיימת, או עוד סבב?
                </p>
              )}
            </div>
          </div>

          <div className="mt-7 grid grid-cols-2 gap-2.5">
            <button
              onClick={complete}
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white shadow-soft transition hover:bg-emerald-700"
            >
              <Check size={20} /> סיימתי
            </button>
            <button
              onClick={next}
              disabled={queue.length < 2}
              className="flex items-center justify-center gap-2 rounded-2xl border border-line py-3.5 text-base font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              <SkipForward size={18} /> לא עכשיו
            </button>
          </div>
        </div>
      </section>

      {/* pick another */}
      {upNext.length > 0 && (
        <section className="mt-5">
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="mb-2 flex items-center gap-1.5 px-1 text-sm font-bold text-muted"
          >
            <ChevronDown size={16} className={cn("transition", !showPicker && "-rotate-90")} />
            הבאות בתור
          </button>
          {showPicker && (
            <ul className="anim-fade rounded-2xl border border-line bg-surface p-1 shadow-soft">
              {upNext.map((t) => {
                const sp = spaces.find((s) => s.id === t.space_id);
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => {
                        setPicked(t.id);
                        setFinished(false);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start transition hover:bg-slate-50"
                    >
                      <StatusIcon status={t.status} size={15} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                      <DueLabel task={t} today={today} />
                      {sp && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sp.color }} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
