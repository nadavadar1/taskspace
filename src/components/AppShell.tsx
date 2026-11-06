"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  Home,
  LayoutDashboard,
  Layers,
  LogOut,
  Monitor,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Sun,
  Target,
} from "lucide-react";
import { useData } from "./DataProvider";
import { Celebration, Kbd, Modal, Sheet, Toasts, cn, useTheme, type ThemeChoice } from "./ui";
import { TaskDialog } from "./TaskDialog";
import { SpaceDialog } from "./SpaceDialog";
import { ChatWidget } from "./ChatWidget";
import { NotificationsButton } from "./NotificationsButton";
import { CommandPalette } from "./CommandPalette";
import { QuickAdd } from "./QuickAdd";
import { isClosed } from "@/lib/constants";

const MAIN_LINKS = [
  { href: "/", label: "דשבורד", icon: LayoutDashboard },
  { href: "/calendar", label: "יומן", icon: CalendarDays },
  { href: "/focus", label: "פוקוס", icon: Target },
] as const;

const THEME_OPTIONS: { key: ThemeChoice; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "light", label: "בהיר", icon: Sun },
  { key: "dark", label: "כהה", icon: Moon },
  { key: "auto", label: "לפי המכשיר", icon: Monitor },
];

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
      className="hidden shrink-0 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-ink sm:block"
    >
      <Icon size={17} />
    </button>
  );
}

const iconBtn = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-ink active:bg-slate-100";

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    spaces,
    tasks,
    today,
    openSpaceDialog,
    toasts,
    dismissToast,
    celebration,
    setPaletteOpen,
    quickAddOpen,
    setQuickAddOpen,
    chatOpen,
    setChatOpen,
  } = useData();
  const pathname = usePathname();
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  const [spacesOpen, setSpacesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useTheme();

  // the tab strip scrolls sideways: keep the current tab in view
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
  const phoneTitle = currentSpace
    ? currentSpace.name
    : pathname === "/calendar"
      ? "יומן"
      : pathname === "/focus"
        ? "פוקוס"
        : "מרחב";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-1.5 px-3 py-2 sm:gap-3 sm:px-5 sm:py-2.5">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-bold" aria-label="מרחב, לדשבורד">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-soft sm:h-8 sm:w-8"
              style={currentSpace ? { backgroundImage: "none", backgroundColor: currentSpace.color } : undefined}
            >
              <Layers size={17} />
            </span>
            <span className="hidden text-[17px] tracking-tight lg:inline">מרחב</span>
          </Link>

          {/* phone: just the page name */}
          <h1 className="min-w-0 flex-1 truncate ps-1 text-lg font-bold sm:hidden">{phoneTitle}</h1>

          {/* computer: all the links */}
          <nav ref={navRef} className="scroll-thin hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5 sm:flex">
            {MAIN_LINKS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  data-active={active}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition",
                    active ? "bg-ink text-surface" : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  <Icon size={15} />
                  {label}
                </Link>
              );
            })}
            <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
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
          <button onClick={() => setPaletteOpen(true)} className={cn(iconBtn, "sm:hidden")} aria-label="חיפוש">
            <Search size={20} />
          </button>
          <button onClick={() => setChatOpen(true)} className={cn(iconBtn, "text-primary sm:hidden")} aria-label="שאל את הסוכן">
            <Sparkles size={20} />
          </button>
          <ThemeButton />
          <NotificationsButton />
          <button onClick={() => setMenuOpen(true)} className={cn(iconBtn, "sm:hidden")} aria-label="עוד">
            <MoreHorizontal size={20} />
          </button>
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

      <main className="pb-nav mx-auto w-full max-w-7xl flex-1 px-3 pt-4 sm:px-5 sm:pt-5">{children}</main>

      {/* phone: thumb-reach bottom bar */}
      {!chatOpen && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
          aria-label="ניווט ראשי"
        >
          <div className="mx-auto grid max-w-md grid-cols-5 items-end px-1 pt-1">
            <BottomItem href="/" label="בית" icon={Home} active={pathname === "/"} />
            <BottomItem
              label="מרחבים"
              icon={Layers}
              active={!!currentSpace || spacesOpen}
              onClick={() => setSpacesOpen(true)}
              dotColor={currentSpace?.color}
            />
            <div className="flex justify-center">
              <button
                onClick={() => setQuickAddOpen(true)}
                className="-mt-4 mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lift transition active:scale-95"
                aria-label="משימה חדשה"
              >
                <Plus size={28} />
              </button>
            </div>
            <BottomItem href="/calendar" label="יומן" icon={CalendarDays} active={pathname === "/calendar"} />
            <BottomItem href="/focus" label="פוקוס" icon={Target} active={pathname === "/focus"} />
          </div>
        </nav>
      )}

      {/* phone: spaces */}
      <Sheet open={spacesOpen} onClose={() => setSpacesOpen(false)} title="המרחבים שלי">
        <div className="space-y-1">
          {spaces.map((s) => {
            const open = tasks.filter((t) => t.space_id === s.id && !isClosed(t.status));
            const late = open.filter((t) => t.due_date && t.due_date < today).length;
            const active = currentSpace?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSpacesOpen(false);
                  router.push(`/space/${s.id}`);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start transition active:bg-slate-100",
                  active && "bg-slate-50",
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: s.color }}>
                  <Layers size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold">{s.name}</span>
                  <span className="block text-xs text-muted">
                    {open.length === 0 ? "אין משימות פתוחות" : `${open.length} פתוחות`}
                    {late > 0 && <span className="font-bold text-red-600"> · {late} באיחור</span>}
                  </span>
                </span>
                <ChevronLeft size={18} className="text-slate-400" />
              </button>
            );
          })}
          <button
            onClick={() => {
              setSpacesOpen(false);
              openSpaceDialog({ mode: "new" });
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start text-primary active:bg-slate-100"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-dashed border-indigo-200">
              <Plus size={18} />
            </span>
            <span className="text-base font-bold">מרחב חדש</span>
          </button>
        </div>
      </Sheet>

      {/* phone: more */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="עוד">
        <div className="px-2 pb-2">
          <div className="mb-2 text-sm font-bold text-muted">ערכת צבעים</div>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTheme(key)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border py-3 text-sm font-bold transition",
                  theme === key ? "border-primary bg-primary-soft text-primary" : "border-line text-slate-600",
                )}
              >
                <Icon size={20} />
                {label}
              </button>
            ))}
          </div>
          <MenuRow
            icon={<Sparkles size={19} className="text-primary" />}
            label="לשאול את הסוכן"
            onClick={() => {
              setMenuOpen(false);
              setChatOpen(true);
            }}
          />
          <MenuRow icon={<LogOut size={19} />} label="יציאה" onClick={logout} />
        </div>
      </Sheet>

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

function MenuRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-start text-base font-medium active:bg-slate-100">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">{icon}</span>
      {label}
    </button>
  );
}

function BottomItem({
  href,
  label,
  icon: Icon,
  active,
  onClick,
  dotColor,
}: {
  href?: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  active: boolean;
  onClick?: () => void;
  dotColor?: string;
}) {
  const cls = cn(
    "relative flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-bold transition active:scale-95",
    active ? "text-primary" : "text-slate-500",
  );
  const body = (
    <>
      <span className={cn("flex h-8 w-12 items-center justify-center rounded-full transition", active && "bg-primary-soft")}>
        <Icon size={21} strokeWidth={active ? 2.4 : 2} />
      </span>
      {label}
      {dotColor && <span className="absolute end-3 top-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />}
    </>
  );
  return href ? (
    <Link href={href} className={cls} aria-current={active ? "page" : undefined}>
      {body}
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {body}
    </button>
  );
}
