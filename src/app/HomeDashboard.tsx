"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Qr } from "@/components/Qr";
import { STAGES } from "@/lib/stages";
import { ROLE_LABELS, roleCanMintBatch, type OrgRole } from "@/lib/orgs";
import { LocationPicker } from "@/components/LocationPicker";
import type { RecordedLocation } from "@/lib/demo-locations";

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

const PARTNER_TASKS: Partial<Record<OrgRole, { title: string; description: string }>> = {
  PROCESSOR: {
    title: "Record product processing",
    description: "Scan the processing station and product QR, then add a verified photo and current location.",
  },
  DISTRIBUTOR: {
    title: "Record product distribution",
    description: "Scan the distribution station and product QR, then record the product's location and condition.",
  },
  BUYER: {
    title: "Record retail arrival",
    description: "Scan the retail station and product QR, then confirm where the product is available to customers.",
  },
  SUPPLIER: {
    title: "Record a supply-chain stage",
    description: "Scan the station and product QR, then add a verified photo and current location.",
  },
};

export function HomeDashboard() {
  const [org, setOrg] = useState<SessionOrg | undefined>(undefined);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState<RecordedLocation | null>(null);
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
        body: JSON.stringify({
          name,
          origin: origin?.label,
          location_lat: origin?.lat,
          location_lng: origin?.lng,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setCreated({ ...j.batch, last_stage: 0 });
      setName("");
      setOrigin(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const base = typeof window !== "undefined" ? window.location.origin : "";
  const canMint = !!org && roleCanMintBatch(org.role);
  const partnerTask = org ? PARTNER_TASKS[org.role] : undefined;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-8 dark:border-olive-700 dark:bg-olive-800">
        {canMint ? (
          <>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-forest-800 dark:text-olive-300">For farmers</p>
        <h1 className="mb-2 text-2xl font-semibold text-olive-900 dark:text-cream-100 sm:text-3xl">Create a traceable product</h1>
        <p className="mb-2 text-sm text-cream-700 dark:text-cream-300">
          Add the product and where its journey begins. You&apos;ll get a QR code for customers.
        </p>
        <p className="mb-6 text-xs text-cream-600 dark:text-cream-400">
          Blockchain record · Metaplex Core NFT · Solana devnet
        </p>
        <form onSubmit={create} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-olive-900 dark:text-cream-100">1. Product name</span>
            <input
              className="w-full rounded-full border border-cream-400 bg-cream-100 px-5 py-2.5 text-olive-900 placeholder:text-cream-600 transition-colors focus:border-forest-800 focus:outline-none disabled:opacity-50"
              placeholder="e.g. Organic Strawberries"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canMint}
              required
            />
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium text-olive-900 dark:text-cream-100">2. Starting location</span>
            <p className="mb-3 text-xs text-cream-700 dark:text-cream-300">Use the farm&apos;s current location or a hackathon demo location.</p>
            <LocationPicker value={origin} onChange={setOrigin} disabled={!canMint} />
          </div>
          <button
            disabled={busy || !canMint || !origin}
            className="w-full rounded-full bg-forest-800 px-6 py-2.5 font-medium text-cream-50 transition-transform active:scale-95 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create product and QR code"}
          </button>
        </form>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        {created && (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-xl bg-forest-100 p-4 sm:flex-row sm:items-start animate-pop-in">
            <Qr value={`${base}/verify/${created.id}`} size={160} />
            <div className="text-sm">
              <p className="font-medium text-olive-900">Product {created.id} is ready ✓</p>
              <p className="text-cream-700">Print or place this QR code on the product.</p>
              <p className="mt-1 break-all font-mono text-xs text-cream-600">{created.asset}</p>
              <Link className="text-forest-800 underline" href={`/verify/${created.id}`}>
                Open verify page
              </Link>
            </div>
          </div>
        )}
          </>
        ) : (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-forest-800 dark:text-olive-300">
              For {org ? ROLE_LABELS[org.role].toLowerCase() : "supply-chain partners"}
            </p>
            <h1 className="mb-2 text-2xl font-semibold text-olive-900 dark:text-cream-100 sm:text-3xl">
              {partnerTask?.title ?? "Review product records"}
            </h1>
            <p className="mb-2 max-w-xl text-sm leading-6 text-cream-700 dark:text-cream-300">
              {partnerTask?.description ?? "Review the recorded journey and blockchain evidence for each product."}
            </p>
            <p className="mb-6 text-xs text-cream-600 dark:text-cream-400">
              Your photo fingerprint and stage record are verified on Solana devnet.
            </p>
            <Link href="/scan" className="block rounded-full bg-forest-800 px-6 py-3 text-center font-medium text-cream-50">
              Scan and record this stage
            </Link>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold">{canMint ? "Your traceable products" : "Products in the supply chain"}</h2>
        <p className="mb-3 text-xs text-cream-700 dark:text-cream-300">
          Each product has a customer QR code and four recorded journey steps: farm, processing, distribution, and retail.
        </p>
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
                    Customer QR code
                  </p>
                  <Link href={`/verify/${b.id}`} className="break-words font-medium text-olive-900 hover:underline dark:text-cream-100">
                    {b.name} <span className="font-mono text-cream-600 dark:text-cream-400">#{b.id}</span>
                  </Link>
                  <div className="mt-1 break-words text-xs text-cream-700 dark:text-cream-300">{b.origin}</div>
                  <p className="mt-2 max-w-xs text-xs text-cream-700 dark:text-cream-300">
                    Customers scan this code to see the product&apos;s verified journey.
                  </p>
                  <Link href={`/verify/${b.id}`} className="mt-2 inline-block text-xs text-forest-800 underline dark:text-olive-300">
                    Open product page
                  </Link>
                  <details className="mt-2 text-xs text-cream-600 dark:text-cream-400">
                    <summary className="cursor-pointer">Blockchain NFT details</summary>
                    <p className="mt-1">Metaplex Core NFT on Solana devnet</p>
                    <p className="truncate font-mono" title={b.asset}>Asset: {b.asset}</p>
                    <p className="truncate font-mono" title={b.mint_sig}>Mint transaction: {b.mint_sig}</p>
                  </details>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                <Link
                  href={`/reports/${b.id}`}
                  className="text-xs text-forest-800 underline dark:text-olive-300"
                >
                  Report
                </Link>
                <p className="text-xs text-cream-700 dark:text-cream-300">Journey: {b.last_stage} of 4 steps</p>
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
