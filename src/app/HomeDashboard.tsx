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

/** Purely decorative line-art produce icons for the side margins on wide
 * screens — cute hand-drawn-doodle style (small stem/leaf/seed details)
 * rather than plain geometric outlines. */
function AppleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 9c-3.5-1-6.5 1-6.5 5.5S8 21 11 21c.5 0 1-.2 1-.2s.5.2 1 .2c3 0 5.5-2 5.5-6.5S15.5 8 12 9Z" />
      <path d="M12 9c0-2 .5-3.5 2-4.5" />
      <path d="M9.5 5.5c.7.9 1.7 1.3 2.5 1.3" />
    </svg>
  );
}
function CherryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="8" cy="17" r="3.2" />
      <circle cx="15.5" cy="15" r="3.2" />
      <path d="M8 13.8C8.5 8 10 5 13 3.5M15.5 11.8c0-3 .5-5 1-6.5" />
      <path d="M13 3.5c1 0 2 .3 2.7 1" />
    </svg>
  );
}
function StrawberryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 21c4-.5 7-4.5 7-9 0-2-1.5-3-3-2-1-1.5-6-1.5-7 0-1.5-1-3 0-3 2 0 4.5 3 8.5 6 9Z" />
      <path d="M9 8c1-1.5 4-1.5 5 0" />
      <circle cx="10" cy="12" r=".4" fill="currentColor" stroke="none" />
      <circle cx="14" cy="13" r=".4" fill="currentColor" stroke="none" />
      <circle cx="11" cy="16" r=".4" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="17" r=".4" fill="currentColor" stroke="none" />
    </svg>
  );
}
function CitrusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 6.5V19.5M5.3 9.5h13.4M5.3 16.5h13.4" />
      <path d="M9.5 5.5c1-1 3.5-1 4.5.5" />
    </svg>
  );
}
function GrapeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3c1.5 0 2.5 1 2.5 2" />
      <path d="M11 4.5c-1.5-1-3 0-3 1" />
      <circle cx="10" cy="8" r="2.3" />
      <circle cx="14" cy="8" r="2.3" />
      <circle cx="8" cy="12" r="2.3" />
      <circle cx="12" cy="12" r="2.3" />
      <circle cx="16" cy="12" r="2.3" />
      <circle cx="10" cy="16" r="2.3" />
      <circle cx="14" cy="16" r="2.3" />
      <circle cx="12" cy="20" r="2.3" />
    </svg>
  );
}
function LeafIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 20c0-8 4-14 12-16-1 7-3 12-12 16Z" />
      <path d="M5.5 18.5c3-4 6-7 9.5-11" />
    </svg>
  );
}

/** Fixed so it sits in the empty gutters beside the centered column, independent
 * of the column's own max-width. Hidden below `lg` since there's no room there. */
function ProduceDecor() {
  const leftIcons = [
    { Icon: AppleIcon, top: "12%" },
    { Icon: GrapeIcon, top: "38%" },
    { Icon: CitrusIcon, top: "66%" },
  ];
  const rightIcons = [
    { Icon: StrawberryIcon, top: "18%" },
    { Icon: CherryIcon, top: "46%" },
    { Icon: LeafIcon, top: "74%" },
  ];
  return (
    <div className="pointer-events-none fixed inset-0 hidden lg:block" aria-hidden>
      {leftIcons.map(({ Icon, top }, i) => (
        <Icon key={i} className="absolute left-10 h-9 w-9 text-cream-500 opacity-40" style={{ top }} />
      ))}
      {rightIcons.map(({ Icon, top }, i) => (
        <Icon key={i} className="absolute right-10 h-9 w-9 text-cream-500 opacity-40" style={{ top }} />
      ))}
    </div>
  );
}

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
      <ProduceDecor />
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
        {batches.length === 0 && <p className="text-sm text-cream-700">None yet.</p>}
        <ul className="divide-y divide-cream-300 overflow-hidden rounded-2xl border border-cream-300 bg-cream-50">
          {batches.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-4 px-4 py-5 text-sm transition-colors duration-150 hover:bg-cream-100 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <Qr value={`${base}/verify/${b.id}`} size={128} />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-forest-800">
                    Product QR
                  </p>
                  <Link href={`/verify/${b.id}`} className="break-words font-medium hover:underline">
                  {b.name} <span className="font-mono text-cream-600">#{b.id}</span>
                  </Link>
                  <div className="mt-1 break-words text-xs text-cream-700">{b.origin}</div>
                  <p className="mt-2 max-w-xs text-xs text-cream-700">
                    Scan to open the customer product page. Print this QR on the product label.
                  </p>
                  <Link href={`/verify/${b.id}`} className="mt-2 inline-block text-xs text-forest-800 underline">
                    Open product page
                  </Link>
                </div>
              </div>
              <div className="flex gap-1 self-end sm:self-auto" aria-label={`${b.last_stage} of ${STAGES.length} stages recorded`}>
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
