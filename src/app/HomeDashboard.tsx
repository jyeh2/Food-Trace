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
      <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-8 dark:border-olive-700 dark:bg-olive-800">
        <h1 className="mb-1 text-2xl font-semibold text-olive-900 dark:text-cream-100 sm:text-3xl">New batch → mint NFT</h1>
        <p className="mb-6 text-sm text-cream-700 dark:text-cream-300">
          Mints a Metaplex Core asset on devnet. Product QR links to its verify page.
        </p>
        {org !== undefined && !canMint && (
          <p className="mb-6 rounded-xl bg-cream-100 p-4 text-sm text-cream-700 dark:bg-olive-900 dark:text-cream-300">
            {org
              ? `${ROLE_LABELS[org.role]} orgs can't mint batches — log in as a Farmer org.`
              : (
                <>
                  <Link href="/login" className="text-forest-800 underline dark:text-olive-300">Log in</Link>
                  {" "}as a FARMER org to mint a batch.
                </>
              )}
          </p>
        )}
        <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded-full border border-cream-400 bg-cream-100 px-5 py-2.5 text-olive-900 placeholder:text-cream-600 transition-colors focus:border-forest-800 focus:outline-none disabled:opacity-50"
            placeholder="Product (e.g. Organic Strawberries)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canMint}
            required
          />
          <input
            className="flex-1 rounded-full border border-cream-400 bg-cream-100 px-5 py-2.5 text-olive-900 placeholder:text-cream-600 transition-colors focus:border-forest-800 focus:outline-none disabled:opacity-50"
            placeholder="Origin (e.g. Green Acres Farm, PA)"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            disabled={!canMint}
            required
          />
          <button
            disabled={busy || !canMint}
            className="rounded-full bg-forest-800 px-6 py-2.5 font-medium text-cream-50 transition-transform active:scale-95 disabled:opacity-50"
          >
            {busy ? "Minting…" : "Mint"}
          </button>
        </form>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        {created && (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-forest-100 p-4 sm:flex-row sm:items-start animate-pop-in">
            <Qr value={`${base}/verify/${created.id}`} size={160} />
            <div className="text-sm">
              <p className="font-medium text-olive-900">Batch {created.id} minted ✓</p>
              <p className="text-cream-700">Print this QR on the product.</p>
              <p className="mt-1 break-all font-mono text-xs text-cream-600">{created.asset}</p>
              <Link className="text-forest-800 underline" href={`/verify/${created.id}`}>
                Open verify page
              </Link>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Batches</h2>
        {batches.length === 0 && <p className="text-sm text-cream-700 dark:text-cream-300">None yet.</p>}
        <ul className="divide-y divide-cream-300 overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 dark:divide-olive-700 dark:border-olive-700 dark:bg-olive-800">
          {batches.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-4 px-4 py-5 text-sm transition-colors duration-150 hover:bg-cream-100 dark:hover:bg-olive-700 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <Qr value={`${base}/verify/${b.id}`} size={128} />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-forest-800 dark:text-olive-300">
                    Product QR
                  </p>
                  <Link href={`/verify/${b.id}`} className="break-words font-medium text-olive-900 hover:underline dark:text-cream-100">
                    {b.name} <span className="font-mono text-cream-600 dark:text-cream-400">#{b.id}</span>
                  </Link>
                  <div className="mt-1 break-words text-xs text-cream-700 dark:text-cream-300">{b.origin}</div>
                  <p className="mt-2 max-w-xs text-xs text-cream-700 dark:text-cream-300">
                    Scan to open the customer product page. Print this QR on the product label.
                  </p>
                  <Link href={`/verify/${b.id}`} className="mt-2 inline-block text-xs text-forest-800 underline dark:text-olive-300">
                    Open product page
                  </Link>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/reports/${b.id}`}
                  className="text-xs text-forest-800 underline dark:text-olive-300"
                >
                  Report
                </Link>
                <div className="flex gap-1">
                  {STAGES.map((s) => (
                    <span
                      key={s.id}
                      title={s.label}
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium ${
                        s.id <= b.last_stage ? "bg-forest-800 text-cream-50" : "bg-cream-200 text-cream-600"
                      }`}
                    >
                      {s.id}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
