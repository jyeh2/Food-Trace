"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QUICK_ROLES, ROLE_LABELS, type OrgRole } from "@/lib/orgs";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<OrgRole>("FARMER");
  const [name, setName] = useState("");
  const [contact_email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [public_key, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/orgs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, role, contact_email, password, public_key }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact_email, password }),
      });
      if (login.ok) {
        router.push("/");
        router.refresh();
      } else {
        router.push("/login");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-lg font-semibold">Join FoodTrace</h1>
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUICK_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`rounded border px-2 py-2 text-sm font-medium ${
                role === r
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-stone-300 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300"
              }`}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-stone-500 dark:text-stone-400">Name</span>
          <input
            required
            className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
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
          <span className="mb-1 block text-stone-500 dark:text-stone-400">Password (min 8 chars)</span>
          <input
            type="password"
            required
            className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500 dark:text-stone-400">Public key (for verifying block signatures)</span>
          <input
            className="w-full rounded border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            value={public_key}
            onChange={(e) => setPublicKey(e.target.value)}
          />
        </label>

        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
        <button
          disabled={busy}
          className="w-full rounded bg-emerald-600 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Registering…" : `Register as ${ROLE_LABELS[role]}`}
        </button>
      </form>
      <p className="text-sm text-stone-500 dark:text-stone-400">
        Already registered? <Link href="/login" className="text-emerald-700 underline dark:text-emerald-400">Log in</Link>
      </p>
    </div>
  );
}
