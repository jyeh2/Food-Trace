"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Qr } from "@/components/Qr";
import { STAGES } from "@/lib/stages";

type Batch = {
  id: string;
  name: string;
  origin: string;
  asset: string;
  mint_sig: string;
  created_at: number;
  last_stage: number;
};

export default function Dashboard() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [created, setCreated] = useState<Batch | null>(null);

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

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-8">
        <h1 className="mb-1 text-2xl font-semibold text-olive-900 sm:text-3xl">New batch → mint NFT</h1>
        <p className="mb-6 text-sm text-cream-700">
          Mints a Metaplex Core asset on devnet. Product QR links to its verify page.
        </p>
        <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded-full border border-cream-400 bg-cream-100 px-5 py-2.5 text-olive-900 placeholder:text-cream-600 transition-colors focus:border-forest-800 focus:outline-none"
            placeholder="Product (e.g. Organic Strawberries)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="flex-1 rounded-full border border-cream-400 bg-cream-100 px-5 py-2.5 text-olive-900 placeholder:text-cream-600 transition-colors focus:border-forest-800 focus:outline-none"
            placeholder="Origin (e.g. Green Acres Farm, PA)"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            required
          />
          <button
            disabled={busy}
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
        {batches.length === 0 && <p className="text-sm text-cream-700">None yet.</p>}
        <ul className="divide-y divide-cream-300 overflow-hidden rounded-2xl border border-cream-300 bg-cream-50">
          {batches.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 px-4 py-3 text-sm transition-colors duration-150 hover:bg-cream-100"
            >
              <div className="flex-1">
                <Link href={`/verify/${b.id}`} className="font-medium hover:underline">
                  {b.name} <span className="font-mono text-cream-600">#{b.id}</span>
                </Link>
                <div className="text-xs text-cream-700">{b.origin}</div>
              </div>
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
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
