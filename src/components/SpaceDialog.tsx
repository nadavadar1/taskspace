"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KanbanSquare, CalendarDays, ListChecks, Loader2, Trash2 } from "lucide-react";
import { useData } from "./DataProvider";
import { Modal, cn } from "./ui";
import { SPACE_COLORS, VIEWS } from "@/lib/constants";
import type { ViewType } from "@/lib/types";

const VIEW_ICONS: Record<ViewType, React.ReactNode> = {
  kanban: <KanbanSquare size={22} />,
  todo: <ListChecks size={22} />,
  calendar: <CalendarDays size={22} />,
};

export function SpaceDialog() {
  const { spaceDialog, closeSpaceDialog, spaces } = useData();
  if (!spaceDialog) return null;
  const editing = spaceDialog.mode === "edit" ? spaces.find((s) => s.id === spaceDialog.id) : undefined;
  if (spaceDialog.mode === "edit" && !editing) return null;
  return <SpaceForm key={editing?.id ?? "new"} onClose={closeSpaceDialog} editingId={editing?.id} />;
}

function SpaceForm({ onClose, editingId }: { onClose: () => void; editingId?: number }) {
  const { spaces, tasks, addSpace, patchSpace, removeSpace } = useData();
  const router = useRouter();
  const editing = spaces.find((s) => s.id === editingId);
  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState(editing?.color ?? SPACE_COLORS[spaces.length % SPACE_COLORS.length]);
  const [view, setView] = useState<ViewType>(editing?.view ?? "todo");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const taskCount = editing ? tasks.filter((t) => t.space_id === editing.id).length : 0;

  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true);
    if (editing) {
      await patchSpace(editing.id, { name: name.trim(), color, view });
      onClose();
    } else {
      const created = await addSpace({ name: name.trim(), color, view });
      onClose();
      if (created) router.push(`/space/${created.id}`);
    }
    setBusy(false);
  }

  async function remove() {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onClose();
    router.push("/");
    await removeSpace(editing.id);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "עריכת מרחב" : "מרחב חדש"}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>
            {editing && (
              <button
                onClick={remove}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition",
                  confirmDelete ? "bg-red-600 text-white" : "text-red-600 hover:bg-red-50",
                )}
              >
                <Trash2 size={15} />
                {confirmDelete ? `למחוק גם ${taskCount} משימות?` : "מחיקת מרחב"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              ביטול
            </button>
            <button
              onClick={save}
              disabled={busy || !name.trim()}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-600 disabled:opacity-60"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {editing ? "שמירה" : "יצירת מרחב"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-700">שם המרחב</div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="למשל: בית, עבודה, לימודים"
            className="w-full rounded-xl border border-line px-3.5 py-2.5 outline-none focus:border-primary focus:ring-4 focus:ring-indigo-100"
          />
        </div>

        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-700">צבע</div>
          <div className="flex flex-wrap gap-2">
            {SPACE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="flex h-9 w-9 items-center justify-center rounded-full transition hover:scale-110"
                style={{ backgroundColor: c }}
                aria-label={`צבע ${c}`}
              >
                {color === c && <Check size={16} className="text-white" />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-sm font-medium text-slate-700">תצוגה</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-2xl border-2 p-3 text-start transition",
                  view === v.key ? "bg-primary-soft" : "border-line bg-white hover:bg-slate-50",
                )}
                style={view === v.key ? { borderColor: color } : undefined}
              >
                <span style={{ color: view === v.key ? color : "#64748b" }}>{VIEW_ICONS[v.key]}</span>
                <span className="text-sm font-bold">{v.label}</span>
                <span className="text-xs leading-snug text-muted">{v.description}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">אפשר להחליף תצוגה בכל רגע, גם אחרי שהמרחב נוצר.</p>
        </div>
      </div>
    </Modal>
  );
}
