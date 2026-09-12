"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Qr } from "@/components/Qr";
import { STAGES } from "@/lib/stages";
import { TOTP_STEP_MS } from "@/lib/totp";

type Code = { stage: number; label: string; code: string; expiresAt: number; payload: string };

/** Rendered client-only (see page.tsx), so window/sessionStorage are safe in initializers. */
export function StationDisplay({ stage }: { stage: string }) {
  const [key, setKey] = useState(
    () =>
      new URLSearchParams(window.location.search).get("k") ??
      sessionStorage.getItem("stationKey") ??
      "",
  );
  const [authErr, setAuthErr] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<Code | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!key) return;
    sessionStorage.setItem("stationKey", key);
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    async function refresh() {
      const r = await fetch(`/api/station/${stage}`, {
        cache: "no-store",
        headers: { "x-station-key": key },
      });
      if (!alive) return;
      if (r.status === 401) {
        setAuthErr(true);
        return;
      }
      if (!r.ok) return;
      const j: Code = await r.json();
      if (!alive) return;
      setData(j);
      timer = setTimeout(refresh, Math.max(250, j.expiresAt - Date.now() + 50));
    }
    refresh();
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [stage, key, attempt]);

  const meta = STAGES.find((s) => String(s.id) === stage);
  if (!meta) return <p>Unknown stage.</p>;

  if (authErr || !key) {
    return (
      <form
        className="mx-auto max-w-sm space-y-3 rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
        onSubmit={(e) => {
          e.preventDefault();
          const v = new FormData(e.currentTarget).get("k");
          const k = typeof v === "string" ? v.trim() : "";
          if (!k) return;
          setAuthErr(false);
          setKey(k);
          setAttempt((n) => n + 1);
        }}
      >
        <h1 className="text-lg font-semibold">
          {meta.icon} Station {meta.id}: {meta.label}
        </h1>
        <p className="text-sm text-stone-600 dark:text-stone-300">
          This screen shows the rotating QR for the station. Enter the station display key
          (<code>STATION_DISPLAY_KEY</code> in <code>.env.local</code>) once on this device.
        </p>
        {authErr && <p className="text-sm text-red-600 dark:text-red-400">Key rejected. Try again.</p>}
        <input
          name="k"
          autoFocus
          className="w-full rounded border border-stone-300 bg-white px-3 py-2 font-mono text-stone-900 placeholder:text-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500"
          placeholder="station display key"
        />
        <button className="w-full rounded bg-stone-900 py-2 text-white dark:bg-stone-100 dark:text-stone-900">Unlock station</button>
      </form>
    );
  }

  const secsLeft = data && now ? Math.max(0, Math.ceil((data.expiresAt - now) / 1000)) : 0;
  const pct = data && now ? Math.max(0, (data.expiresAt - now) / TOTP_STEP_MS) * 100 : 0;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-wrap justify-center gap-2 text-sm">
        {STAGES.map((s) => (
          <Link
            key={s.id}
            href={`/station/${s.id}`}
            className={`rounded px-3 py-1 ${s.id === meta.id ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900"}`}
          >
            {s.icon} {s.label}
          </Link>
        ))}
      </div>
      <h1 className="text-2xl font-semibold">
        {meta.icon} Station {meta.id}: {meta.label}
      </h1>
      <div className="rounded-xl bg-white p-6 shadow dark:bg-stone-900">
        {data ? <Qr value={data.payload} size={320} /> : <div className="h-80 w-80 bg-stone-100 dark:bg-stone-800" />}
      </div>
      <div className="w-80">
        <div className="mb-1 flex justify-between font-mono text-sm text-stone-600 dark:text-stone-300">
          <span>{data?.code ?? "--------"}</span>
          <span>rotates in {secsLeft}s</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-stone-200 dark:bg-stone-800">
          <div className="h-full bg-emerald-500 transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="max-w-md text-center text-sm text-stone-500 dark:text-stone-400">
        Code = HMAC(secret, stage, ⌊t/30s⌋). Server accepts ±1 window. A photo of this QR
        stops working within a minute, so a scan proves presence here, now.
      </p>
    </div>
  );
}
