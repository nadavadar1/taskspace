"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, Layers, LogOut, Monitor, Moon, Plus, Search, Sun, Target } from "lucide-react";
import { useData } from "./DataProvider";
import { Celebration, Kbd, Modal, Toasts, cn, useTheme } from "./ui";
import { TaskDialog } from "./TaskDialog";
import { SpaceDialog } from "./SpaceDialog";
import { ChatWidget } from "./ChatWidget";
import { NotificationsButton } from "./NotificationsButton";
import { CommandPalette } from "./CommandPalette";
import { QuickAdd } from "./QuickAdd";

const MAIN_LINKS = [
  { href: "/", label: "דשבורד", icon: LayoutDashboard },
  { href: "/calendar", label: "יומן", icon: CalendarDays },
  { href: "/focus", label: "פוקוס", icon: Target },
] as const;

function ThemeButton() {
  const [theme, setTheme] = useTheme();
  const next = theme === "auto" ? "dark" : theme === "dark" ? "light" : "auto";
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label = theme === "dark" ? "מצב כהה" : theme === "light" ? "מצב בהיר" : "לפי המכשיר";
  return (
    <button
      onClick={() => setTheme(next)}
      title={`${label} (לחיצה מחליפה)`}
      aria-label={`ערכת צבעים: ${label}`}
      className="shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-ink"
    >
      <Icon size={17} />
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    spaces,
    openSpaceDialog,
    toasts,
    dismissToast,
    celebration,
    setPaletteOpen,
    quickAddOpen,
    setQuickAddOpen,
    chatOpen,
  } = useData();
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
    window.location.reload(); // the session cookie is gone, so the login screen shows up
  }

  const currentSpace = spaces.find((s) => pathname === `/space/${s.id}`);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-soft">
              <Layers size={17} />
            </span>
            <span className="hidden text-[17px] tracking-tight lg:inline">מרחב</span>
          </Link>

          <nav ref={navRef} className="scroll-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5">
            {MAIN_LINKS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  data-active={active}
                  className={cn(
                    "hidden shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition sm:flex",
                    active ? "bg-ink text-surface" : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  <Icon size={15} />
                  {label}
                </Link>
              );
            })}
            <span className="mx-1 hidden h-5 w-px shrink-0 bg-line sm:block" aria-hidden />
            {spaces.map((s) => {
              const active = currentSpace?.id === s.id;
              return (
                <Link
                  key={s.id}
                  href={`/space/${s.id}`}
                  data-active={active}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition",
                    active ? "text-white shadow-soft" : "text-slate-600 hover:bg-slate-100",
                  )}
                  style={active ? { backgroundColor: s.color } : undefined}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: active ? "#ffffffcc" : s.color }} />
                  {s.name}
                </Link>
              );
            })}
            <button
              onClick={() => openSpaceDialog({ mode: "new" })}
              className="flex shrink-0 items-center gap-1 rounded-xl border border-dashed border-slate-300 px-2.5 py-1.5 text-sm text-slate-500 transition hover:border-primary hover:text-primary"
              title="מרחב חדש"
            >
              <Plus size={14} />
              <span className="hidden md:inline">מרחב חדש</span>
            </button>
          </nav>

          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden shrink-0 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-sm text-muted transition hover:border-slate-300 hover:text-ink sm:flex"
            aria-label="חיפוש"
          >
            <Search size={15} />
            <span className="hidden lg:inline">חיפוש</span>
            <span className="hidden items-center gap-0.5 lg:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <ThemeButton />
          <NotificationsButton />
          <button
            onClick={logout}
            title="יציאה"
            aria-label="יציאה"
            className="hidden shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-ink sm:block"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <main className="pb-nav mx-auto w-full max-w-7xl flex-1 px-3 pt-5 sm:px-5">{children}</main>

      {/* phone: thumb-reach bottom bar */}
      {!chatOpen && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
          aria-label="ניווט ראשי"
        >
          <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
            {MAIN_LINKS.slice(0, 2).map((l) => (
              <BottomLink key={l.href} {...l} active={pathname === l.href} />
            ))}
            <div className="flex justify-center">
              <button
                onClick={() => setQuickAddOpen(true)}
                className="-mt-5 mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lift transition active:scale-95"
                aria-label="משימה חדשה"
              >
                <Plus size={26} />
              </button>
            </div>
            <BottomLink {...MAIN_LINKS[2]} active={pathname === "/focus"} />
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium text-slate-500"
            >
              <Search size={21} />
              חיפוש
            </button>
          </div>
        </nav>
      )}

      <Modal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} title="משימה חדשה">
        <QuickAdd autoFocus spaceId={currentSpace?.id} onAdded={() => setQuickAddOpen(false)} />
        <p className="mt-3 text-xs leading-relaxed text-muted">
          כותבים במשפט אחד, והמערכת מבינה לבד תאריך, שעה, עדיפות ו-#מרחב. למשל: ״לשלם ארנונה ביום ראשון חשוב #בית״.
        </p>
      </Modal>

      <ChatWidget />
      <TaskDialog />
      <SpaceDialog />
      <CommandPalette />
      <Celebration nonce={celebration} />
      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function BottomLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium transition",
        active ? "text-primary" : "text-slate-500",
      )}
    >
      <Icon size={21} />
      {label}
    </Link>
  );
}
