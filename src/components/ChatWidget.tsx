"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { useData } from "./DataProvider";
import { cn } from "./ui";
import type { AgentResponse, AgentScope, PendingInfo } from "@/lib/types";

type PendingState = "open" | "approved" | "rejected" | "dismissed";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  scopeLabel?: string;
  actions?: string[];
  pending?: PendingInfo & { state: PendingState };
  error?: boolean;
}

const SUGGESTIONS = [
  { label: "מה הכי חשוב לעשות עכשיו?", text: "מה הכי חשוב לעשות עכשיו? תן לי רק את הצעד הראשון." },
  { label: "סיכום יומי", text: "תכין לי סיכום יומי." },
  { label: "דחה את מה שבאיחור למחר", text: "תדחה את כל מה שבאיחור למחר." },
  { label: "פרק משימה לצעדים קטנים", text: "בחר את המשימה הדחופה ביותר ופרק אותה לצעדים קטנים. הצג לי קודם את הצעדים, ואל תוסיף עדיין." },
];

function Rich({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const inline = (s: string, key: string) => (
    <span key={key}>
      {s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
  const flush = () => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul${blocks.length}`} className="my-1 list-disc space-y-0.5 ps-5">
        {items.map((b, i) => (
          <li key={i}>{inline(b, `b${i}`)}</li>
        ))}
      </ul>,
    );
  };
  text.split("\n").forEach((line, i) => {
    const m = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (m) {
      bullets.push(m[1]);
      return;
    }
    flush();
    if (line.trim() === "") return;
    blocks.push(
      <p key={`p${i}`} className="my-0.5">
        {inline(line, `l${i}`)}
      </p>,
    );
  });
  flush();
  return <>{blocks}</>;
}

export function ChatWidget() {
  const {
    spaces,
    chatOpen,
    setChatOpen,
    chatPrefill,
    consumePrefill,
    refresh,
  } = useData();
  const pathname = usePathname();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [override, setOverride] = useState<AgentScope | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const lastNonce = useRef(0);

  messagesRef.current = messages;

  useEffect(() => {
    setOverride(null);
  }, [pathname]);

  const autoScope: AgentScope = useMemo(() => {
    const m = pathname.match(/^\/space\/(\d+)/);
    return m ? { type: "space", spaceId: Number(m[1]) } : { type: "all" };
  }, [pathname]);

  const scope: AgentScope = useMemo(() => {
    const s = override ?? autoScope;
    if (s.type === "space" && !spaces.some((sp) => sp.id === s.spaceId)) return { type: "all" };
    return s;
  }, [override, autoScope, spaces]);

  const scopeSpace = scope.type === "space" ? spaces.find((s) => s.id === scope.spaceId) : undefined;
  const scopeLabel = scopeSpace ? scopeSpace.name : "כל המרחבים";
  const isManual = override !== null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, chatOpen]);

  useEffect(() => {
    if (chatOpen) setTimeout(() => inputRef.current?.focus(), 150);
  }, [chatOpen]);

  const nextId = () => ++idRef.current;

  const handleResponse = useCallback(
    async (data: AgentResponse) => {
      if (data.mutated) await refresh();
      setMessages((prev) => [
        ...prev,
        data.error
          ? { id: nextId(), role: "assistant", content: data.error, error: true }
          : {
              id: nextId(),
              role: "assistant",
              content: data.reply,
              actions: data.actions,
              pending: data.pending ? { ...data.pending, state: "open" } : undefined,
            },
      ]);
    },
    [refresh],
  );

  const send = useCallback(
    async (raw: string) => {
      const content = raw.trim();
      if (!content || loading) return;
      const userMsg: ChatMessage = { id: nextId(), role: "user", content, scopeLabel };
      const base = messagesRef.current.map((m) =>
        m.pending?.state === "open" ? { ...m, pending: { ...m.pending, state: "dismissed" as const } } : m,
      );
      const next = [...base, userMsg];
      setMessages(next);
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      setLoading(true);
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope,
            messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        await handleResponse((await res.json()) as AgentResponse);
      } catch {
        await handleResponse({ reply: "", actions: [], mutated: false, error: "אין חיבור לשרת. נסה שוב." });
      } finally {
        setLoading(false);
      }
    },
    [loading, scope, scopeLabel, handleResponse],
  );

  async function decide(msgId: number, approve: boolean) {
    const msg = messagesRef.current.find((m) => m.id === msgId);
    if (!msg?.pending || msg.pending.state !== "open" || loading) return;
    const pendingId = msg.pending.id;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.pending ? { ...m, pending: { ...m.pending, state: approve ? "approved" : "rejected" } } : m,
      ),
    );
    setLoading(true);
    try {
      const res = await fetch("/api/agent/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pendingId, approve }),
      });
      await handleResponse((await res.json()) as AgentResponse);
    } catch {
      await handleResponse({ reply: "", actions: [], mutated: false, error: "אין חיבור לשרת. נסה שוב." });
    } finally {
      setLoading(false);
    }
  }

  // messages pushed from elsewhere in the app (e.g. the dashboard "daily summary" button)
  useEffect(() => {
    if (!chatPrefill || chatPrefill.nonce === lastNonce.current) return;
    lastNonce.current = chatPrefill.nonce;
    const { text, send: shouldSend } = chatPrefill;
    consumePrefill();
    if (shouldSend) void send(text);
    else setInput(text);
  }, [chatPrefill, consumePrefill, send]);

  function clearChat() {
    setMessages([]);
    setInput("");
  }

  return (
    <>
      {/* floating launcher */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="anim-pop group fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-40 flex items-center gap-2.5 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 py-3.5 pe-5 ps-4 text-white shadow-xl shadow-indigo-300/50 transition hover:scale-[1.03] hover:shadow-2xl"
          aria-label="פתיחת צ'אט עם הסוכן"
        >
          <Sparkles size={22} />
          <span className="text-sm font-bold">שאל את הסוכן</span>
        </button>
      )}

      {/* panel */}
      {chatOpen && (
        <div
          className={cn(
            "anim-slide fixed z-50 flex flex-col overflow-hidden bg-surface shadow-2xl",
            "inset-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(700px,calc(100vh-2.5rem))] sm:w-[410px] sm:rounded-3xl sm:border sm:border-line",
          )}
          role="dialog"
          aria-label="צ'אט עם הסוכן"
        >
          {/* header */}
          <div className="bg-gradient-to-br from-indigo-500 to-violet-600 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                  <Bot size={22} />
                </span>
                <div>
                  <div className="font-bold leading-tight">עוזר המשימות</div>
                  <div className="flex items-center gap-1.5 text-xs text-white/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    מחובר
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearChat}
                  disabled={!messages.length}
                  className="rounded-lg p-2 text-white/80 transition hover:bg-white/15 disabled:opacity-30"
                  title="שיחה חדשה"
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  onClick={() => setChatOpen(false)}
                  className="rounded-lg p-2 text-white/80 transition hover:bg-white/15"
                  aria-label="סגירה"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* scope */}
            <div className="relative mt-3">
              <button
                onClick={() => setPickerOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-xl bg-white/15 px-3 py-2 text-sm transition hover:bg-white/25"
              >
                <span className="flex items-center gap-2">
                  <span className="text-white/80">עובד עכשיו על:</span>
                  <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-ink">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: scopeSpace?.color ?? "#6366f1" }}
                    />
                    {scopeLabel}
                  </span>
                  {!isManual && <span className="text-[11px] text-white/70">(אוטומטי)</span>}
                </span>
                <ChevronDown size={16} className={cn("transition", pickerOpen && "rotate-180")} />
              </button>
              {pickerOpen && (
                <div className="anim-pop absolute inset-x-0 top-full z-10 mt-1.5 overflow-hidden rounded-xl bg-white py-1 text-ink shadow-xl">
                  <ScopeOption
                    label="כל המרחבים"
                    color="#6366f1"
                    active={scope.type === "all"}
                    onClick={() => {
                      setOverride({ type: "all" });
                      setPickerOpen(false);
                    }}
                  />
                  {spaces.map((s) => (
                    <ScopeOption
                      key={s.id}
                      label={s.name}
                      color={s.color}
                      active={scope.type === "space" && scope.spaceId === s.id}
                      onClick={() => {
                        setOverride({ type: "space", spaceId: s.id });
                        setPickerOpen(false);
                      }}
                    />
                  ))}
                  {isManual && (
                    <button
                      onClick={() => {
                        setOverride(null);
                        setPickerOpen(false);
                      }}
                      className="w-full border-t border-line px-3 py-2 text-start text-xs font-medium text-primary hover:bg-slate-50"
                    >
                      חזרה לבחירה אוטומטית
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* messages */}
          <div ref={scrollRef} className="scroll-thin flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4">
            {messages.length === 0 && (
              <div className="anim-fade pt-4 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <Sparkles size={26} />
                </div>
                <p className="font-bold">היי, אני כאן לעזור 👋</p>
                <p className="mx-auto mt-1 max-w-[280px] text-sm text-muted">
                  אפשר לשאול אותי מה חשוב, או לבקש שאוסיף, אעדכן ואדחה משימות. אני אפעל על: <b>{scopeLabel}</b>.
                </p>
                <div className="mt-5 flex flex-col items-stretch gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => send(s.text)}
                      className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-start text-sm font-medium transition hover:border-primary hover:text-primary"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={cn("anim-fade flex flex-col", m.role === "user" ? "items-start" : "items-end")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[14.5px] leading-relaxed",
                    m.role === "user"
                      ? "rounded-ss-md bg-primary text-white"
                      : m.error
                        ? "rounded-se-md border border-red-200 bg-red-50 text-red-700"
                        : "rounded-se-md border border-line bg-white shadow-sm",
                  )}
                >
                  <Rich text={m.content} />
                </div>

                {m.role === "user" && m.scopeLabel && (
                  <span className="mt-1 px-1 text-[11px] text-muted">על: {m.scopeLabel}</span>
                )}

                {m.actions && m.actions.length > 0 && (
                  <div className="mt-1.5 flex max-w-[88%] flex-wrap gap-1.5">
                    {m.actions.map((a, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                      >
                        <Check size={12} />
                        {a}
                      </span>
                    ))}
                  </div>
                )}

                {m.pending && (
                  <div className="mt-2 w-[92%] rounded-2xl border border-amber-200 bg-amber-50 p-3">
                    <div className="mb-1.5 text-sm font-bold text-amber-900">{m.pending.title}</div>
                    <ul className="mb-3 space-y-0.5 text-[13px] text-amber-900/80">
                      {m.pending.items.map((it, i) => (
                        <li key={i} className="truncate">
                          • {it}
                        </li>
                      ))}
                    </ul>
                    {m.pending.state === "open" ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => decide(m.id, true)}
                          disabled={loading}
                          className={cn(
                            "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold text-white transition disabled:opacity-60",
                            m.pending.destructive ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700",
                          )}
                        >
                          <CheckCircle2 size={16} />
                          {m.pending.destructive ? "כן, למחוק" : "אשר"}
                        </button>
                        <button
                          onClick={() => decide(m.id, false)}
                          disabled={loading}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          <XCircle size={16} />
                          בטל
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs font-medium text-amber-900/70">
                        {m.pending.state === "approved"
                          ? "אושר ✓"
                          : m.pending.state === "rejected"
                            ? "בוטל"
                            : "הבקשה הוחלפה בהודעה חדשה"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-end">
                <div className="flex items-center gap-1 rounded-2xl rounded-se-md border border-line bg-white px-4 py-3 shadow-sm">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* composer */}
          <div className="border-t border-line bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-white p-1.5 transition focus-within:border-primary focus-within:ring-4 focus-within:ring-indigo-100">
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={`כתוב לסוכן (${scopeLabel})...`}
                className="max-h-[120px] min-h-[38px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[14.5px] outline-none"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-indigo-600 disabled:bg-slate-200 disabled:text-slate-400"
                aria-label="שליחה"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} className="-scale-x-100" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ScopeOption({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between px-3 py-2 text-start text-sm transition hover:bg-slate-50"
    >
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      {active && <Check size={15} className="text-primary" />}
    </button>
  );
}
