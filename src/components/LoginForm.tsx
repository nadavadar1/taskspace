"use client";

import { useState } from "react";
import { Layers, Loader2, Lock } from "lucide-react";

export function LoginForm({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || "משהו השתבש, נסה שוב");
    } catch {
      setError("אין חיבור לשרת, נסה שוב");
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="anim-pop w-full max-w-sm rounded-3xl border border-line bg-surface p-8 shadow-xl shadow-indigo-100/50"
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
          <Layers size={28} />
        </div>
        <h1 className="mb-1 text-center text-2xl font-bold">מרחב</h1>
        <p className="mb-6 text-center text-sm text-muted">ניהול משימות חכם, עם סוכן AI</p>

        {!configured && (
          <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            הסיסמה עדיין לא הוגדרה בשרת (APP_PASSWORD).
          </p>
        )}

        <label className="mb-1.5 block text-sm font-medium" htmlFor="pw">
          סיסמה
        </label>
        <div className="relative mb-3">
          <Lock size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="pw"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-line bg-white py-2.5 pe-3 ps-9 outline-none transition focus:border-primary focus:ring-4 focus:ring-indigo-100"
            placeholder="הקלד סיסמה"
          />
        </div>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-medium text-white transition hover:bg-indigo-600 disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          כניסה
        </button>
      </form>
    </main>
  );
}
