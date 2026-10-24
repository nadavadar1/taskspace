import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { isAuthed, passwordConfigured } from "@/lib/auth";
import { getSettings, listSpaces, listTasks } from "@/lib/store";
import { LoginForm } from "@/components/LoginForm";
import { DataProvider } from "@/components/DataProvider";
import { AppShell } from "@/components/AppShell";

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
  themeColor: "#4f46e5",
};

export const dynamic = "force-dynamic";

async function Content({ children }: { children: React.ReactNode }) {
  if (!(await isAuthed())) {
    return <LoginForm configured={passwordConfigured()} />;
  }
  try {
    const [spaces, tasks, settings] = await Promise.all([listSpaces(), listTasks(), getSettings()]);
    return (
      <DataProvider initial={{ spaces, tasks, settings }}>
        <AppShell>{children}</AppShell>
      </DataProvider>
    );
  } catch (e) {
    console.error("[layout] failed to load data", e);
    return (
      <div className="mx-auto mt-24 max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
        <h1 className="mb-2 text-xl font-bold">אי אפשר להתחבר למסד הנתונים</h1>
        <p className="text-muted">בדוק שהמשתנה DATABASE_URL מוגדר נכון בשרת, ורענן את הדף.</p>
      </div>
    );
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full`}>
      <body className="min-h-full">
        <Content>{children}</Content>
      </body>
    </html>
  );
}
