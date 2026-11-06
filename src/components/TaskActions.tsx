"use client";

import { CalendarX2, Check, Pencil, RotateCcw, Target, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useData } from "./DataProvider";
import { Sheet, cn } from "./ui";
import { PRIORITIES, isClosed } from "@/lib/constants";
import { addDays, dayOfWeek, relativeLabel } from "@/lib/dates";

/** Long press (or right click) on a task: the common changes in one tap, without opening the full form. */
export function TaskActionsSheet() {
  const { actionsFor, closeActions, tasks, spaces, today, patchTask, deleteWithUndo, openTask, toast } = useData();
  const router = useRouter();
  const task = actionsFor !== null ? tasks.find((t) => t.id === actionsFor) : undefined;
  if (!task) return null;

  const done = task.status === "done";
  const toSunday = (7 - dayOfWeek(today)) % 7 || 7;
  const dates: { label: string; value: string | null }[] = [
    { label: "היום", value: today },
    { label: "מחר", value: addDays(today, 1) },
    { label: "בעוד יומיים", value: addDays(today, 2) },
    { label: "שבוע הבא", value: addDays(today, toSunday) },
    { label: "בעוד שבוע", value: addDays(today, 7) },
  ];

  function apply(patch: Parameters<typeof patchTask>[1], message?: string) {
    closeActions();
    void patchTask(task!.id, patch);
    if (message) toast(message);
  }

  return (
    <Sheet open onClose={closeActions} title={<span className="line-clamp-2 leading-snug">{task.title}</span>}>
      <div className="space-y-4 px-2 pb-2">
        <div className="grid grid-cols-3 gap-2">
          <BigAction
            icon={done ? <RotateCcw size={20} /> : <Check size={20} />}
            label={done ? "לפתוח מחדש" : "בוצע"}
            className="bg-emerald-50 text-emerald-700"
            onClick={() => apply({ status: done ? "new" : "done" })}
          />
          <BigAction
            icon={<Pencil size={19} />}
            label="עריכה"
            className="bg-slate-100 text-slate-700"
            onClick={() => {
              closeActions();
              openTask(task.id);
            }}
          />
          <BigAction
            icon={<Trash2 size={19} />}
            label="מחיקה"
            className="bg-red-50 text-red-600"
            onClick={() => deleteWithUndo(task.id)}
          />
        </div>

        {!isClosed(task.status) && (
          <button
            onClick={() => {
              closeActions();
              router.push(`/focus?task=${task.id}`);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-3 text-sm font-bold text-primary active:bg-slate-50"
          >
            <Target size={17} />
            להתמקד בה עכשיו
          </button>
        )}

        <Group label={`תאריך${task.due_date ? ` · עכשיו: ${relativeLabel(task.due_date, today)}` : ""}`}>
          {dates.map((d) => (
            <Chip
              key={d.label}
              on={task.due_date === d.value}
              onClick={() => apply({ due_date: d.value }, `נדחתה ל${d.label === "היום" ? "היום" : d.label}`)}
            >
              {d.label}
            </Chip>
          ))}
          {task.due_date && (
            <Chip on={false} onClick={() => apply({ due_date: null }, "התאריך הוסר")}>
              <CalendarX2 size={14} />
              ללא
            </Chip>
          )}
        </Group>

        <Group label="עדיפות">
          {PRIORITIES.map((p) => (
            <Chip key={p.key} on={task.priority === p.key} color={p.color} onClick={() => apply({ priority: p.key })}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: task.priority === p.key ? "#fff" : p.color }} />
              {p.label}
            </Chip>
          ))}
        </Group>

        {spaces.length > 1 && (
          <Group label="מרחב">
            {spaces.map((s) => (
              <Chip
                key={s.id}
                on={task.space_id === s.id}
                color={s.color}
                onClick={() => apply({ space_id: s.id }, `הועברה ל${s.name}`)}
              >
                {s.name}
              </Chip>
            ))}
          </Group>
        )}
      </div>
    </Sheet>
  );
}

function BigAction({
  icon,
  label,
  className,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  className: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={cn("flex flex-col items-center gap-1.5 rounded-2xl py-3.5 text-sm font-bold transition active:scale-95", className)}>
      {icon}
      {label}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-bold text-muted">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  on,
  color,
  onClick,
  children,
}: {
  on: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-bold transition active:scale-95",
        on ? "border-transparent text-white" : "border-line bg-surface text-slate-600",
      )}
      style={on ? { backgroundColor: color ?? "var(--primary)" } : undefined}
    >
      {children}
    </button>
  );
}
