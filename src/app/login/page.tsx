"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [contact_email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact_email, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      router.push("/");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-lg font-semibold">Log in</h1>
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500 dark:text-stone-400">Contact email</span>
          <input
            type="email"
            required
            className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            value={contact_email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500 dark:text-stone-400">Password</span>
          <input
            type="password"
            required
            className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
        <button
          disabled={busy}
          className="w-full rounded bg-emerald-600 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="text-sm text-stone-500 dark:text-stone-400">
        No org yet? <Link href="/register" className="text-emerald-700 underline dark:text-emerald-400">Register one</Link>
      </p>
    </div>
  );
}
