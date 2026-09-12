"use client";

import { useState } from "react";
import { ProductQr } from "@/components/ProductQr";
import { createTracePreview, TRACE_SCENARIOS, type TraceData } from "@/lib/trace-preview";

const panel = "rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-7 dark:border-olive-700 dark:bg-olive-800";
const muted = "text-cream-700 dark:text-cream-300";
const descriptions = ["Where this product’s journey begins.", "Preparation and handling before delivery.", "The journey from producer to store.", "Arrival at the store for customers."];

/** Human labels for snapshotOrgForStage's keys (see lib/db.ts) — falls back to the raw key. */
const SNAPSHOT_LABELS: Record<string, string> = {
  grid_region: "Grid region", location_lat: "Latitude", location_lng: "Longitude",
  farm_type: "Farm type", land_use_type: "Land use", farming_practice: "Farming practice",
  onsite_renewable_pct: "Onsite renewable %", facility_type: "Facility type",
  facility_energy_source: "Facility energy source", facility_renewable_pct: "Facility renewable %",
  fleet_type: "Fleet type", refrigeration_type: "Refrigeration", default_transport_mode: "Transport mode",
  buyer_type: "Buyer type", storage_type: "Storage type", kitchen_energy_source: "Kitchen energy source",
};

export default function TracePreview({ liveData }: { liveData: TraceData | null }) {
  const [scenario, setScenario] = useState(liveData ? "live" : "registered");
  const [expanded, setExpanded] = useState(!liveData);
  const isMock = scenario !== "live";
  const data = isMock ? createTracePreview(scenario) : liveData!;
  return <div className="space-y-6">
    {isMock && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <strong>Mock preview · Not real product data</strong>
      {liveData && <button type="button" onClick={() => setScenario("live")} className="min-h-11 underline underline-offset-4">Restore real data</button>}
    </div>}
    <TraceContent key={scenario} data={data} isMock={isMock} />
    <section className="border-t border-cream-300 pt-4 dark:border-olive-700" aria-label="Trace debug controls">
      <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls="trace-debug" className={`min-h-11 text-sm underline underline-offset-4 ${muted}`}>{expanded ? "Hide debug controls" : "Debug / Mock data"}</button>
      {expanded && <div id="trace-debug" className={`mt-2 space-y-3 ${panel}`}>
        <p className={`text-sm ${muted}`}>Preview only. No changes are saved to the database or blockchain. Refresh to reset the preview.</p>
        <label className="block text-sm font-medium">Test scenario
          <select value={scenario} onChange={(event) => setScenario(event.target.value)} className="mt-2 block min-h-11 w-full rounded-lg border border-cream-300 bg-cream-50 p-3 text-olive-900">
            {liveData && <option value="live">Real product data</option>}
            {TRACE_SCENARIOS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <p className={`text-xs ${muted}`}>Farm / Harvest is one combined stage. Error scenarios affect the selected stage; later stages remain unrecorded.</p>
      </div>}
    </section>
  </div>;
}

function photoStatus(item: TraceData["rows"][number], chainErr: string) {
  if (!item.row) return "Not recorded yet";
  if (chainErr) return "Check unavailable";
  if (!item.fileHash) return "Photo unavailable";
  if (!item.parsed) return "Awaiting chain record";
  return item.match ? "Photo matches record" : "Photo does not match";
}

function TraceContent({ data, isMock }: { data: TraceData; isMock: boolean }) {
  const { batch, rows, chainErr, assetUrl, mintUrl } = data;
  if (!batch) return <section className={`${panel} text-center`}><p className={`mb-3 text-sm ${muted}`}>YOUR PRODUCT’S STORY</p><h1 className="text-2xl font-semibold">No product information yet</h1><p className={`mt-3 ${muted}`}>There are no product or journey records to show. Check that you scanned the code on the product label, or ask the store for more information.</p></section>;
  const recorded = rows.filter((r) => r.row);
  const done = recorded.length;
  const matched = chainErr ? 0 : recorded.filter((r) => r.match).length;
  const mismatch = !chainErr && recorded.some((r) => r.fileHash && r.parsed && !r.match);
  const status = chainErr ? "Verification temporarily unavailable" : !done ? "Journey records coming soon" : mismatch ? "A photo needs review" : matched === done ? "Recorded photos match" : "Some evidence is unavailable";
  const latest = recorded.at(-1)?.row;
  const date = (timestamp: number) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(timestamp);

  return <div className="space-y-6">
    <section className={`${panel} overflow-hidden`}>
      <p className="text-xs font-semibold tracking-[0.18em] text-forest-800 dark:text-olive-300">YOUR PRODUCT’S STORY</p>
      <h1 className="mt-3 break-words text-3xl leading-tight font-semibold sm:text-4xl">{batch.name}</h1>
      <p className={`mt-2 text-base ${muted}`}>{batch.origin || "Origin not provided"}</p>
      <p className={`mt-5 max-w-xl text-sm leading-relaxed ${muted}`}>Know where your food comes from. Explore this batch’s journey, see the records behind it, and check how its photos compare with the blockchain record.</p>
      <dl className="mt-6 grid gap-4 border-t border-cream-300 pt-5 sm:grid-cols-3 dark:border-olive-700">
        <div><dt className={`text-xs ${muted}`}>Reported origin</dt><dd className="mt-1 break-words text-sm font-medium">{batch.origin || "Not provided"}</dd></div>
        <div><dt className={`text-xs ${muted}`}>Latest recorded stage</dt><dd className="mt-1 text-sm font-medium">{recorded.at(-1)?.s.label ?? "None yet"}</dd></div>
        <div><dt className={`text-xs ${muted}`}>Last record</dt><dd className="mt-1 text-sm font-medium">{latest ? date(latest.created_at) : "Not recorded yet"}</dd></div>
      </dl>
      <p className={`mt-5 text-xs ${muted}`}>Batch <span className="font-mono">#{batch.id}</span> · No account needed</p>
    </section>

    <section className={panel} aria-label="Record summary">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">A little more transparency.</h2><span className={`text-sm ${muted}`}>{done} of {rows.length} stages recorded</span></div>
      <div className="mt-4 flex gap-2" role="progressbar" aria-label="Journey records" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={done}>
        {rows.map((item) => <span key={item.s.id} className={`h-2 flex-1 rounded-full ${item.row ? "bg-forest-800 dark:bg-olive-300" : "bg-cream-300 dark:bg-olive-700"}`} />)}
      </div>
      <div className="mt-5 flex items-start gap-3" role="status">
        <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${mismatch ? "bg-red-100 text-red-800" : done && matched === done && !chainErr ? "bg-forest-100 text-forest-800" : "bg-cream-200 text-olive-800"}`}>{mismatch ? "!" : done && matched === done && !chainErr ? "✓" : "i"}</span>
        <div><p className="text-sm font-semibold">{status}</p><p className={`mt-1 text-sm leading-relaxed ${muted}`}>{chainErr ? "We couldn’t reach the blockchain. You can still explore the saved records; refresh to try verification again." : !done ? "This product has been registered. Its journey details have not been added yet." : mismatch ? "At least one photo differs from its blockchain fingerprint. Open the stage below to see the details." : `${matched} of ${done} recorded photos match their blockchain fingerprints. ${done < rows.length ? "The journey is still partly recorded." : "All journey stages have a record."}`}</p></div>
      </div>
    </section>

    <section aria-labelledby="journey-heading">
      <h2 id="journey-heading" className="text-2xl font-semibold">From farm to shelf</h2>
      <p className={`mt-1 mb-5 text-sm ${muted}`}>The people and records behind this batch.</p>
      <ol className="space-y-4">
        {rows.map((item, i) => {
          const { s, row, parsed, fileHash, photoUrl, txUrl, orgSnapshot, snapshotMatch } = item;
          const snapshotEntries = orgSnapshot ? Object.entries(orgSnapshot) : [];
          const problem = !!row && !chainErr && !!fileHash && !!parsed && !item.match;
          return <li key={s.id} className="relative flex gap-3 sm:gap-4">
            {i < rows.length - 1 && <span aria-hidden className="absolute top-10 bottom-[-16px] left-[19px] w-px bg-cream-400 dark:bg-olive-600" />}
            <span aria-hidden className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${row ? "bg-forest-800 text-cream-50" : "border border-cream-400 bg-cream-200 text-cream-700 dark:bg-olive-900 dark:text-cream-300"}`}>{s.id}</span>
            <div className={`min-w-0 flex-1 rounded-xl border p-4 sm:p-5 ${row ? "border-cream-300 bg-cream-50 dark:border-olive-700 dark:bg-olive-800" : "border-dashed border-cream-400 dark:border-olive-600"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold">{s.label}</h3><span className={`rounded-full px-2.5 py-1 text-xs ${problem ? "bg-red-100 text-red-800" : row && item.match && !chainErr ? "bg-forest-100 text-forest-800" : "bg-cream-200 text-olive-800"}`}>{photoStatus(item, chainErr)}</span></div>
              {row ? <>
                <p className="mt-3 break-words text-sm font-medium">{row.actor}</p>
                <p className={`mt-1 text-xs ${muted}`}>Recorded {date(row.created_at)} · UTC</p>
                {row.note && <p className={`mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed ${muted}`}>{row.note}</p>}
                <details className="group mt-3">
                  <summary className="cursor-pointer py-3 text-sm font-medium underline-offset-4 hover:underline">View photo &amp; evidence</summary>
                  <div className="mt-2 space-y-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {photoUrl ? <img src={photoUrl} alt={`${s.label} record supplied by ${row.actor}`} className="max-h-72 w-full rounded-lg bg-cream-200 object-contain" loading="lazy" /> : <p className={`rounded-lg bg-cream-200 p-5 text-sm text-olive-800`}>Photo unavailable for this stage.</p>}
                    <p className={`text-xs leading-relaxed ${muted}`}>Photos are supplied by the recording organization. Matching fingerprints check the photo’s integrity, not the accuracy of every product claim.</p>
                    <dl className={`space-y-2 text-xs ${muted}`}><div><dt>Blockchain photo fingerprint (SHA-256)</dt><dd className="mt-1 break-all font-mono">{parsed?.photoHash ?? "Unavailable"}</dd></div><div><dt>Stored photo fingerprint (SHA-256)</dt><dd className="mt-1 break-all font-mono">{fileHash ?? "Unavailable"}</dd></div></dl>
                    {txUrl ? <a className="inline-block py-2 text-sm underline" href={txUrl} target="_blank" rel="noreferrer">View blockchain transaction ↗</a> : <p className={`text-xs ${muted}`}>Simulated record · No blockchain transaction</p>}
                    {snapshotEntries.length > 0 && <div className="border-t border-cream-300 pt-3 dark:border-olive-700">
                      <p className={`flex items-center gap-1.5 text-xs font-medium ${muted}`}>Recorded from
                        <span className={snapshotMatch ? "text-forest-800 dark:text-forest-400" : "text-red-600 dark:text-red-400"}>{snapshotMatch ? "✓" : "✗ mismatch"}</span>
                      </p>
                      <dl className={`mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs ${muted}`}>
                        {snapshotEntries.map(([key, value]) => <div key={key} className="contents">
                          <dt>{SNAPSHOT_LABELS[key] ?? key}</dt>
                          <dd className="text-olive-900 dark:text-cream-200">{String(value)}</dd>
                        </div>)}
                      </dl>
                    </div>}
                  </div>
                </details>
              </> : <p className={`mt-2 text-sm leading-relaxed ${muted}`}>{descriptions[i]} Details will appear when a record is added.</p>}
            </div>
          </li>;
        })}
      </ol>
    </section>

    <section id="about-trace" className={`${panel} scroll-mt-24`}>
      <p className="text-xs font-semibold tracking-widest text-forest-800 dark:text-olive-300">BEHIND THE RECORDS</p>
      <h2 className="mt-2 text-xl font-semibold">What does the check mean?</h2>
      <p className={`mt-3 text-sm leading-relaxed ${muted}`}>Each recorded photo has a digital fingerprint saved on the blockchain. We compare the available photo with that fingerprint so you can see whether they match.</p>
      <p className={`mt-3 text-sm leading-relaxed ${muted}`}>A match does not independently certify food quality, origin, or claims such as organic. Notes and product descriptions are supplied by participating organizations.</p>
      <details className="mt-3 border-t border-cream-300 pt-2 dark:border-olive-700">
        <summary className="cursor-pointer py-3 text-sm font-medium">Technical details</summary>
        <div className={`space-y-3 py-2 text-xs ${muted}`}>
          <p>Network: Solana devnet · Test network</p>
          <dl className="space-y-3"><div><dt>Product asset</dt><dd className="mt-1 break-all font-mono">{assetUrl ? <a href={assetUrl} target="_blank" rel="noreferrer" className="underline">{batch.asset} ↗</a> : batch.asset}</dd></div><div><dt>Registration transaction</dt><dd className="mt-1 break-all font-mono">{mintUrl ? <a href={mintUrl} target="_blank" rel="noreferrer" className="underline">{batch.mint_sig} ↗</a> : batch.mint_sig}</dd></div></dl>
        </div>
      </details>
    </section>
    {!isMock && <section className={panel} aria-labelledby="share-product-heading">
      <h2 id="share-product-heading" className="text-xl font-semibold">Share this product</h2>
      <p className={`mt-2 text-sm leading-relaxed ${muted}`}>Open the QR code to share this product page or print it for the product label.</p>
      <ProductQr batchId={batch.id} />
    </section>}
    <p className={`text-center text-xs ${muted}`}>FoodTrace · Food provenance, made visible.</p>
  </div>;
}
