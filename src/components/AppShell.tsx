"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Layers, LogOut, Plus } from "lucide-react";
import { useData } from "./DataProvider";
import { Toasts, cn } from "./ui";
import { TaskDialog } from "./TaskDialog";
import { SpaceDialog } from "./SpaceDialog";
import { ChatWidget } from "./ChatWidget";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { spaces, openSpaceDialog, toasts } = useData();
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // on a phone the tab strip scrolls sideways: keep the current tab in view
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>("[data-active=true]")?.scrollIntoView({
      inline: "center",
      block: "nearest",
    });
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2.5 sm:px-5">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
              <Layers size={17} />
            </span>
            <span className="hidden sm:inline">מרחב</span>
          </Link>

          <nav ref={navRef} className="scroll-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
            <Link
              href="/"
              data-active={pathname === "/"}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition",
                pathname === "/" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <LayoutDashboard size={15} />
              דשבורד
            </Link>
            {spaces.map((s) => {
              const active = pathname === `/space/${s.id}`;
              return (
                <Link
                  key={s.id}
                  href={`/space/${s.id}`}
                  data-active={active}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition",
                    active ? "text-white" : "text-slate-600 hover:bg-slate-100",
                  )}
                  style={active ? { backgroundColor: s.color } : undefined}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: active ? "#ffffffcc" : s.color }}
                  />
                  {s.name}
                </Link>
              );
            })}
            <button
              onClick={() => openSpaceDialog({ mode: "new" })}
              className="flex shrink-0 items-center gap-1 rounded-xl border border-dashed border-slate-300 px-2.5 py-1.5 text-sm text-slate-500 transition hover:border-primary hover:text-primary"
            >
              <Plus size={14} />
              מרחב חדש
            </button>
          </nav>

          <button
            onClick={logout}
            title="יציאה"
            className="shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-ink"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 pb-28 pt-5 sm:px-5">{children}</main>

      <ChatWidget />
      <TaskDialog />
      <SpaceDialog />
      <Toasts toasts={toasts} />
    </div>
  );
}
