import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { isAuthed, passwordConfigured } from "@/lib/auth";
import { getSettings, listSpaces, listTasks } from "@/lib/store";
import { listActiveReminders } from "@/lib/reminders";
import { LoginForm } from "@/components/LoginForm";
import { DataProvider } from "@/components/DataProvider";
import { AppShell } from "@/components/AppShell";
import { THEME_BOOT_SCRIPT } from "@/components/theme-script";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "מרחב – ניהול משימות חכם",
  description: "מערכת אישית לניהול משימות במרחבים, עם סוכן AI",
  appleWebApp: { capable: true, title: "מרחב", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1018" },
  ],
};

export const dynamic = "force-dynamic";

async function Content({ children }: { children: React.ReactNode }) {
  if (!(await isAuthed())) {
    return <LoginForm configured={passwordConfigured()} />;
  }
  const initial = await loadInitialData();
  if (!initial) {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
        <h1 className="mb-2 text-xl font-bold">אי אפשר להתחבר למסד הנתונים</h1>
        <p className="text-muted">בדוק שהמשתנה DATABASE_URL מוגדר נכון בשרת, ורענן את הדף.</p>
      </div>
    );
  }
  return (
    <DataProvider initial={initial}>
      <AppShell>{children}</AppShell>
    </DataProvider>
  );
}

async function loadInitialData() {
  try {
    const [spaces, tasks, settings, reminders] = await Promise.all([
      listSpaces(),
      listTasks(),
      getSettings(),
      listActiveReminders(),
    ]);
    return { spaces, tasks, settings, reminders };
  } catch (e) {
    console.error("[layout] failed to load data", e);
    return null;
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Content>{children}</Content>
      </body>
    </html>
  );
}
