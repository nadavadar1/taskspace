"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, LayoutDashboard, Moon, Plus, Search, Sparkles, Sun, Target } from "lucide-react";
import { useData } from "./DataProvider";
import { DueLabel } from "./TaskCard";
import { Kbd, StatusIcon, cn, useTheme } from "./ui";
import { isClosed } from "@/lib/constants";
import { parseQuickTask } from "@/lib/quick-parse";

interface Item {
  key: string;
  group: string;
  icon: React.ReactNode;
  label: React.ReactNode;
  hint?: React.ReactNode;
  run: () => void;
}

function norm(s: string): string {
  return s.replace(/[֑-ׇ"'׳״]/g, "").toLowerCase();
}

/** Ctrl+K (or the search button): find any task, jump to a space, or add a task from what was typed. */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useData();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K" || e.key === "ל")) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  if (!paletteOpen) return null;
  return <Palette onClose={() => setPaletteOpen(false)} />;
}

function Palette({ onClose }: { onClose: () => void }) {
  const { tasks, spaces, today, openTask, addTask, askAgent, setQuickAddOpen, toast, isTodo } = useData();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [theme, setTheme] = useTheme();
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);
  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
      onClose();
    };
    const query = norm(q.trim());
    const out: Item[] = [];

    if (query) {
      const matches = tasks
        .filter((t) =>
          norm(`${t.title} ${t.description} ${t.checklist.map((i) => i.text).join(" ")} ${t.status_note}`).includes(query),
        )
        .sort((a, b) => Number(isClosed(a.status)) - Number(isClosed(b.status)) || (a.due_date ?? "9").localeCompare(b.due_date ?? "9"))
        .slice(0, 12);
      for (const t of matches) {
        const sp = spaceById.get(t.space_id);
        out.push({
          key: `t${t.id}`,
          group: "משימות",
          icon: <StatusIcon status={t.status} size={16} />,
          label: <span className={cn(isClosed(t.status) && "text-muted line-through")}>{t.title}</span>,
          hint: (
            <span className="flex items-center gap-2">
              <DueLabel task={t} today={today} />
              {sp && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: sp.color }} />
                  {sp.name}
                </span>
              )}
            </span>
          ),
          run: () => {
            onClose();
            openTask(t.id);
          },
        });
      }
    }

    for (const s of spaces) {
      if (query && !norm(s.name).includes(query)) continue;
      out.push({
        key: `s${s.id}`,
        group: "מרחבים",
        icon: <span className="block h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />,
        label: s.name,
        hint: `${tasks.filter((t) => t.space_id === s.id && isTodo(t)).length} פתוחות`,
        run: go(`/space/${s.id}`),
      });
    }

    if (query) {
      const parsed = parseQuickTask(q, { today, spaces });
      const target = spaces.find((s) => s.id === parsed.space_id) ?? spaces[0];
      if (target) {
        out.push({
          key: "add",
          group: "פעולות",
          icon: <Plus size={16} className="text-primary" />,
          label: (
            <span>
              הוספת משימה: <b>{parsed.title}</b>
            </span>
          ),
          hint: target.name,
          run: async () => {
            onClose();
            const t = await addTask({
              space_id: target.id,
              title: parsed.title,
              priority: parsed.priority ?? "medium",
              due_date: parsed.due_date,
              due_time: parsed.due_time,
              recurrence: parsed.recurrence,
              recurrence_n: parsed.recurrence_n,
            });
            if (t) toast(`נוספה ל${target.name}: ${t.title}`);
          },
        });
      }
      out.push({
        key: "ask",
        group: "פעולות",
        icon: <Sparkles size={16} className="text-violet-500" />,
        label: (
          <span>
            לשאול את הסוכן: <b>{q.trim()}</b>
          </span>
        ),
        hint: "משתמש ב-AI",
        run: () => {
          onClose();
          askAgent(q.trim());
        },
      });
    } else {
      out.push(
        { key: "new", group: "פעולות", icon: <Plus size={16} />, label: "משימה חדשה", run: () => { onClose(); setQuickAddOpen(true); } },
        { key: "focus", group: "פעולות", icon: <Target size={16} />, label: "מצב פוקוס: משימה אחת בכל פעם", run: go("/focus") },
        { key: "dash", group: "פעולות", icon: <LayoutDashboard size={16} />, label: "דשבורד", run: go("/") },
        { key: "cal", group: "פעולות", icon: <CalendarDays size={16} />, label: "יומן", run: go("/calendar") },
        {
          key: "theme",
          group: "פעולות",
          icon: theme === "dark" ? <Sun size={16} /> : <Moon size={16} />,
          label: theme === "dark" ? "מצב בהיר" : "מצב כהה",
          run: () => {
            setTheme(theme === "dark" ? "light" : "dark");
            onClose();
          },
        },
      );
    }
    return out;
  }, [q, tasks, spaces, today, spaceById, router, onClose, openTask, addTask, askAgent, setQuickAddOpen, toast, theme, setTheme, isTodo]);

  const safeActive = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${safeActive}"]`)?.scrollIntoView({ block: "nearest" });
  }, [safeActive]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((safeActive + 1) % Math.max(1, items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((safeActive - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      items[safeActive]?.run();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  let lastGroup = "";
  return (
    <div
      className="anim-fade fixed inset-0 z-[60] flex items-start justify-center bg-black/45 p-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-[2px] sm:pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="anim-pop w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-surface shadow-lift" role="dialog" aria-label="חיפוש">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search size={18} className="shrink-0 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="חיפוש משימה, מרחב או פעולה..."
            className="min-w-0 flex-1 bg-transparent py-1 text-base outline-none placeholder:text-slate-400"
            aria-label="חיפוש"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} className="scroll-thin max-h-[min(60vh,480px)] overflow-y-auto p-2">
          {items.length === 0 && <p className="py-8 text-center text-sm text-muted">לא נמצא כלום</p>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {header && <div className="px-3 pb-1 pt-2 text-[11px] font-bold text-muted">{header}</div>}
                <button
                  data-idx={i}
                  onMouseMove={() => i !== safeActive && setActive(i)}
                  onClick={() => it.run()}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm transition",
                    i === safeActive ? "bg-primary-soft" : "hover:bg-slate-50",
                  )}
                >
                  <span className="flex w-5 shrink-0 justify-center">{it.icon}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{it.label}</span>
                  {it.hint && <span className="shrink-0 text-xs text-muted">{it.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="hidden items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-muted sm:flex">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> מעבר
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> בחירה
          </span>
          <span className="ms-auto">
            <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> פותח מכל מקום
          </span>
        </div>
      </div>
    </div>
  );
}
