"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CalendarDays, KanbanSquare, ListChecks, Pencil, Plus } from "lucide-react";
import { useData } from "./DataProvider";
import { KanbanView } from "./KanbanView";
import { TodoView } from "./TodoView";
import { CalendarView } from "./CalendarView";
import { cn, useMounted } from "./ui";
import { VIEWS } from "@/lib/constants";
import type { ViewType } from "@/lib/types";

const ICONS: Record<ViewType, React.ReactNode> = {
  kanban: <KanbanSquare size={16} />,
  todo: <ListChecks size={16} />,
  calendar: <CalendarDays size={16} />,
};

export function SpaceView({ id }: { id: number }) {
  const { spaces, tasks, patchSpace, openNewTask, openSpaceDialog } = useData();
  const space = spaces.find((s) => s.id === id);
  const mounted = useMounted();
  const calendarSpaces = useMemo(() => (space ? [space] : []), [space]);

  if (!space) {
    return (
      <div className="mx-auto mt-20 max-w-sm rounded-2xl border border-line bg-surface p-8 text-center">
        <p className="mb-4 font-medium">המרחב לא נמצא</p>
        <Link href="/" className="text-primary hover:underline">
          חזרה לדשבורד
        </Link>
      </div>
    );
  }

  const open = tasks.filter((t) => t.space_id === space.id && t.status !== "done").length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-9 w-2 rounded-full" style={{ backgroundColor: space.color }} />
          <div>
            <h1 className="text-2xl font-bold leading-tight">{space.name}</h1>
            <p className="text-sm text-muted">{open === 0 ? "אין משימות פתוחות" : `${open} משימות פתוחות`}</p>
          </div>
          <button
            onClick={() => openSpaceDialog({ mode: "edit", id: space.id })}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-ink"
            aria-label="עריכת מרחב"
          >
            <Pencil size={16} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-line bg-surface p-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => space.view !== v.key && patchSpace(space.id, { view: v.key })}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  space.view === v.key ? "text-white shadow-sm" : "text-slate-500 hover:bg-slate-100",
                )}
                style={space.view === v.key ? { backgroundColor: space.color } : undefined}
                title={v.description}
              >
                {ICONS[v.key]}
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => openNewTask({ space_id: space.id })}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-110"
            style={{ backgroundColor: space.color }}
          >
            <Plus size={16} />
            משימה חדשה
          </button>
        </div>
      </div>

      {/* dnd-kit generates ids that differ between server and client, so render the views after mount */}
      {mounted && (
        <div key={space.view} className="anim-fade">
          {space.view === "kanban" && <KanbanView space={space} />}
          {space.view === "todo" && <TodoView space={space} />}
          {space.view === "calendar" && <CalendarView spaces={calendarSpaces} />}
        </div>
      )}
    </div>
  );
}
