"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Qr } from "@/components/Qr";
import { STAGES } from "@/lib/stages";
import { ROLE_LABELS, roleCanMintBatch, type OrgRole } from "@/lib/orgs";

type Batch = {
  id: string;
  name: string;
  origin: string;
  asset: string;
  mint_sig: string;
  created_at: number;
  last_stage: number;
};

type SessionOrg = { id: string; name: string; role: OrgRole } | null;

export function HomeDashboard() {
  const [org, setOrg] = useState<SessionOrg | undefined>(undefined);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [created, setCreated] = useState<Batch | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setOrg(j.org))
      .catch(() => setOrg(null));
  }, []);

  const load = useCallback(async () => {
    const r = await fetch("/api/batches");
    const j = await r.json();
    setBatches(j.batches ?? []);
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/batches")
      .then((r) => r.json())
      .then((j) => {
        if (alive) setBatches(j.batches ?? []);
      })
      .catch(console.error);
    return () => {
      alive = false;
    };
  }, []);

  async function create(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, origin }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setCreated({ ...j.batch, last_stage: 0 });
      setName("");
      setOrigin("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const base = typeof window !== "undefined" ? window.location.origin : "";

  const canMint = !!org && roleCanMintBatch(org.role);

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <h1 className="mb-1 text-lg font-semibold">New batch → mint NFT</h1>
        <p className="mb-3 text-sm text-stone-500 dark:text-stone-400">
          Mints a Metaplex Core asset on devnet. Product QR links to its verify page.
        </p>
        {org !== undefined && !canMint && (
          <p className="mb-3 rounded bg-stone-100 p-3 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            {org
              ? `${ROLE_LABELS[org.role]} orgs can't mint batches — log in as a Farmer org.`
              : (
                <>
                  <Link href="/login" className="text-emerald-700 underline dark:text-emerald-400">Log in</Link>
                  {" "}as a FARMER org to mint a batch.
                </>
              )}
          </p>
        )}
        <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 placeholder:text-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500"
            placeholder="Product (e.g. Organic Strawberries)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canMint}
            required
          />
          <input
            className="flex-1 rounded border border-stone-300 bg-white px-3 py-2 text-stone-900 placeholder:text-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500"
            placeholder="Origin (e.g. Green Acres Farm, PA)"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            disabled={!canMint}
            required
          />
          <button
            disabled={busy || !canMint}
            className="rounded bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {busy ? "Minting…" : "Mint"}
          </button>
        </form>
        {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
        {created && (
          <div className="mt-4 flex flex-col items-center gap-2 rounded bg-emerald-50 p-4 dark:bg-emerald-950/50 sm:flex-row sm:items-start">
            <Qr value={`${base}/verify/${created.id}`} size={160} />
            <div className="text-sm">
              <p className="font-medium">Batch {created.id} minted ✓</p>
              <p className="text-stone-600 dark:text-stone-300">Print this QR on the product.</p>
              <p className="mt-1 break-all font-mono text-xs text-stone-500 dark:text-stone-400">{created.asset}</p>
              <Link className="text-emerald-700 underline dark:text-emerald-400" href={`/verify/${created.id}`}>
                Open verify page
              </Link>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Batches</h2>
        {batches.length === 0 && <p className="text-sm text-stone-500 dark:text-stone-400">None yet.</p>}
        <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
          {batches.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="flex-1">
                <Link href={`/verify/${b.id}`} className="font-medium hover:underline">
                  {b.name} <span className="font-mono text-stone-400 dark:text-stone-500">#{b.id}</span>
                </Link>
                <div className="text-xs text-stone-500 dark:text-stone-400">{b.origin}</div>
              </div>
              <div className="flex gap-1">
                {STAGES.map((s) => (
                  <span
                    key={s.id}
                    title={s.label}
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      s.id <= b.last_stage
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500"
                    }`}
                  >
                    {s.icon}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
