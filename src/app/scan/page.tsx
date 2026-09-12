"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { STAGES } from "@/lib/stages";

type Station = { s: number; c: string };

/** Worker app: scan station QR + product QR, take photo, submit. */
export default function ScanPage() {
  const [station, setStation] = useState<Station | null>(null);
  const [batchId, setBatchId] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [note, setNote] = useState("");
  const [actor, setActor] = useState("");
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  /** Returns which thing was decoded so the scanner knows whether to keep going. */
  function handleDecoded(text: string): "station" | "batch" | null {
    // Station QR: {"t":"station","s":2,"c":"abcd1234"}
    try {
      const j = JSON.parse(text);
      if (j?.t === "station" && typeof j.s === "number" && typeof j.c === "string") {
        setStation({ s: j.s, c: j.c });
        setMsg({ ok: true, text: `Station ${j.s} scanned — now scan the product QR` });
        return "station";
      }
    } catch {
      /* not JSON */
    }
    // Product QR: .../verify/<ID>
    const m = text.match(/\/verify\/([A-Za-z0-9]+)/) ?? text.match(/^([A-F0-9]{8})$/i);
    if (m) {
      setBatchId(m[1].toUpperCase());
      setMsg({ ok: true, text: `Batch ${m[1].toUpperCase()} scanned` });
      return "batch";
    }
    setMsg({ ok: false, text: "Unrecognized QR" });
    return null;
  }

  async function startScan() {
    setScanning(true);
    const { Html5Qrcode } = await import("html5-qrcode");
    const inst = new Html5Qrcode("reader");
    scannerRef.current = inst;
    // Keep scanning until both station and batch are captured. Debounce so one
    // QR held in front of the camera doesn't fire repeatedly.
    let lastText = "";
    let lastAt = 0;
    const got = { station: !!station, batch: !!batchId };
    try {
      await inst.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (text) => {
          const now = Date.now();
          if (text === lastText && now - lastAt < 2000) return;
          lastText = text;
          lastAt = now;
          const kind = handleDecoded(text);
          if (kind) got[kind] = true;
          if (got.station && got.batch) stopScan();
        },
        () => {},
      );
    } catch (e) {
      setMsg({ ok: false, text: `Camera error: ${e instanceof Error ? e.message : String(e)}` });
      setScanning(false);
    }
  }
  async function stopScan() {
    try {
      await scannerRef.current?.stop();
    } catch {
      /* already stopped */
    }
    scannerRef.current = null;
    setScanning(false);
  }
  useEffect(() => () => void stopScan(), []);

  function onPhoto(f: File | null) {
    setPhoto(f);
    setPreview(f ? URL.createObjectURL(f) : "");
  }

  async function submit() {
    if (!station || !batchId || !photo) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("batchId", batchId);
    fd.set("stage", String(station.s));
    fd.set("code", station.c);
    fd.set("note", note);
    fd.set("actor", actor || `station-${station.s}`);
    fd.set("photo", photo);
    try {
      const r = await fetch("/api/stages", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setMsg({ ok: true, text: `Stage ${station.s} recorded on-chain. tx ${j.stage.tx_sig.slice(0, 12)}…` });
      setStation(null);
      onPhoto(null);
      setNote("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const stageMeta = station ? STAGES.find((s) => s.id === station.s) : null;
  const ready = !!station && !!batchId && !!photo;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Record a stage</h1>

      <div id="reader" className={`overflow-hidden rounded-lg bg-black ${scanning ? "" : "hidden"}`} />
      <div className="flex gap-2">
        {!scanning ? (
          <button onClick={startScan} className="rounded bg-stone-900 px-4 py-2 text-white dark:bg-stone-100 dark:text-stone-900">
            📷 Scan QR
          </button>
        ) : (
          <button onClick={stopScan} className="rounded border border-stone-300 px-4 py-2 dark:border-stone-700">
            Stop
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="1. Station (rotating QR)">
          {station ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              {stageMeta?.icon} {stageMeta?.label} · <span className="font-mono">{station.c}</span>
            </span>
          ) : (
            <span className="text-stone-400 dark:text-stone-500">not scanned</span>
          )}
        </Field>
        <Field label="2. Product batch">
          <input
            className="w-full rounded border border-stone-300 bg-white px-2 py-1 font-mono uppercase text-stone-900 placeholder:text-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500"
            placeholder="scan or type ID"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="3. Photo (hash goes on-chain)">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
          />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="preview" className="mt-2 max-h-40 rounded" />
          )}
        </Field>
        <Field label="4. Details">
          <input
            className="mb-1 w-full rounded border border-stone-300 bg-white px-2 py-1 text-stone-900 placeholder:text-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500"
            placeholder="Your name / role"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />
          <input
            className="w-full rounded border border-stone-300 bg-white px-2 py-1 text-stone-900 placeholder:text-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500"
            placeholder="Note (temp 4°C, lot, etc.)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>

      <button
        disabled={!ready || busy}
        onClick={submit}
        className="w-full rounded bg-emerald-600 py-3 font-medium text-white disabled:opacity-40"
      >
        {busy ? "Writing to Solana…" : "Submit stage"}
      </button>

      {msg && (
        <p className={`rounded p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}
      {batchId && (
        <Link href={`/verify/${batchId}`} className="block text-sm text-emerald-700 underline dark:text-emerald-400">
          View batch {batchId}
        </Link>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 text-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</div>
      {children}
    </div>
  );
}
