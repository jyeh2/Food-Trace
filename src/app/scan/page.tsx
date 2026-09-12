"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { STAGES } from "@/lib/stages";
import { ROLE_LABELS, ROLE_STAGES, type OrgRole } from "@/lib/orgs";

type Station = { s: number; c: string };
type Step = "station" | "produce" | "photo" | "done";
type Batch = { id: string; name: string; origin: string; last_stage: number };
type SessionOrg = { id: string; name: string; role: OrgRole } | null;

/** Map getUserMedia's DOMException names to plain-language causes. */
function cameraErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  switch (name) {
    case "NotAllowedError":
      return "Camera permission was denied. Check your browser's site settings and allow camera access, then try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera found on this device.";
    case "NotReadableError":
      return "Camera is already in use by another app or browser tab. Close it and try again.";
    case "SecurityError":
      return "Camera blocked — this page must be loaded over https:// (or localhost).";
    default:
      return `Camera error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const STEP_LABELS: { key: Step; label: string }[] = [
  { key: "station", label: "Scan Station" },
  { key: "produce", label: "Select Produce" },
  { key: "photo", label: "Details" },
];

/** Worker app: scan station QR, pick the product batch, add photo + details, submit. Requires a logged-in org. */
export default function ScanPage() {
  const [org, setOrg] = useState<SessionOrg | undefined>(undefined);
  const [station, setStation] = useState<Station | null>(null);
  const [stationConfirmed, setStationConfirmed] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [note, setNote] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastTx, setLastTx] = useState("");
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  const step: Step =
    msg?.ok && lastTx
      ? "done"
      : !station || !stationConfirmed
        ? "station"
        : !batchId
          ? "produce"
          : "photo";
  const stepIndex = STEP_LABELS.findIndex((s) => s.key === step);
  // Station and Select Produce share one continuous camera session — the
  // same live scan can catch either QR type, so the camera shouldn't stop
  // and restart between these two steps.
  const cameraStep = step === "station" || step === "produce";

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setOrg(j.org))
      .catch(() => setOrg(null));
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

  /** Returns which thing was decoded so the scanner knows whether to keep going. */
  function handleDecoded(text: string): "station" | "batch" | null {
    // Station QR: {"t":"station","s":2,"c":"abcd1234"}
    try {
      const j = JSON.parse(text);
      if (j?.t === "station" && typeof j.s === "number" && typeof j.c === "string") {
        setStation({ s: j.s, c: j.c });
        // Auto-advance past confirmation — scanning the station's rotating QR
        // is itself the proof of presence, so there's nothing left to confirm.
        setStationConfirmed(true);
        return "station";
      }
    } catch {
      /* not JSON */
    }
    // Product QR: .../verify/<ID>
    const m = text.match(/\/verify\/([A-Za-z0-9]+)/) ?? text.match(/^([A-F0-9]{8})$/i);
    if (m) {
      setBatchId(m[1].toUpperCase());
      return "batch";
    }
    return null;
  }

  async function startScan() {
    setMsg(null);
    // Everything here — including the dynamic import and the Html5Qrcode
    // constructor, not just inst.start() — must be inside this try block.
    // Both can throw (e.g. if #reader isn't mounted in the DOM yet), and if
    // that throw isn't caught, it's an unhandled rejection: nothing shows,
    // no popup, no error banner, just silence.
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access requires trusted HTTPS. Open the HTTPS demo URL in Safari.");
      }
      const { Html5Qrcode } = await import("html5-qrcode");
      const inst = new Html5Qrcode("reader");
      scannerRef.current = inst;
      setScanning(true);
      // Keep scanning until both station and batch are captured. Debounce so
      // one QR held in front of the camera doesn't fire repeatedly.
      let lastText = "";
      let lastAt = 0;
      const got = { station: !!station, batch: !!batchId };
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
      setMsg({ ok: false, text: cameraErrorMessage(e) });
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
  // Camera access is gated behind an explicit tap (enableCamera below), both
  // because iOS Safari requires a user gesture for the first getUserMedia
  // call, and so it's clear the scan is mandatory rather than a background
  // permission grab. enableCamera itself does that first start (it's the one
  // running inside the click). This effect only depends on `step`, not
  // `cameraEnabled` — it exists purely to restart the camera on later
  // re-entries into the scan steps (e.g. "Scan next"), which happens after
  // permission is already granted, so no gesture is needed there. If it also
  // depended on `cameraEnabled`, it would double-fire alongside enableCamera's
  // own call on the very first tap — two concurrent Html5Qrcode.start() calls
  // fighting over the same camera, which throws on the second one.
  useEffect(() => {
    if (!cameraEnabled) return;
    if (cameraStep && !scanning) {
      const id = requestAnimationFrame(() => void startScan());
      return () => cancelAnimationFrame(id);
    }
    if (!cameraStep && scanning) void stopScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function enableCamera() {
    // getUserMedia doesn't exist at all in an insecure context (plain http://
    // on anything but localhost) — check that directly, since html5-qrcode's
    // own error for this case is a generic "navigator.mediaDevices is
    // undefined" TypeError that doesn't say why.
    if (!navigator.mediaDevices?.getUserMedia) {
      setMsg({
        ok: false,
        text: "Camera isn't available on this connection — this page must be loaded over https:// (or localhost). If you're on a phone, use the https:// LAN URL from pnpm dev, and accept the certificate warning once.",
      });
      return;
    }
    setCameraEnabled(true);
    await startScan();
  }

  function onPhoto(f: File | null) {
    setPhoto(f);
    setPreview(f ? URL.createObjectURL(f) : "");
  }

  function startOver() {
    setStation(null);
    setStationConfirmed(false);
    setBatchId("");
    onPhoto(null);
    setNote("");
    setMsg(null);
    setLastTx("");
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
    fd.set("photo", photo);
    try {
      const r = await fetch("/api/stages", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setLastTx(j.stage.tx_sig);
      setMsg({ ok: true, text: `Stage ${station.s} recorded on-chain.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const stageMeta = station ? STAGES.find((s) => s.id === station.s) : null;
  const doneBatchId = batchId;

  if (org === undefined) return null;
  if (!org) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold">Record a stage</h1>
        <p className="rounded-2xl border border-cream-300 bg-cream-50 p-5 text-sm dark:border-olive-700 dark:bg-olive-800">
          You need to be logged in as an org to record a stage.{" "}
          <Link href="/login" className="text-forest-800 underline dark:text-olive-300">Log in</Link>
          {" "}or{" "}
          <Link href="/register" className="text-forest-800 underline dark:text-olive-300">register an org</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col gap-4">
      <p className="text-sm text-cream-700 dark:text-cream-300">
        Logged in as <span className="font-medium text-olive-900 dark:text-cream-100">{org.name}</span> ({ROLE_LABELS[org.role]}) — can record stage
        {ROLE_STAGES[org.role].length === 1 ? "" : "s"} {ROLE_STAGES[org.role].join(", ") || "none"}.
      </p>

      {step !== "done" && (
        <ol className="flex items-center justify-center gap-2 text-xs font-medium">
          {STEP_LABELS.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  i <= stepIndex
                    ? "bg-forest-800 text-cream-100"
                    : "bg-cream-300 text-cream-600 dark:bg-olive-800 dark:text-cream-600"
                }`}
              >
                {i < stepIndex ? "✓" : i + 1}
              </span>
              <span className={i === stepIndex ? "text-olive-800 dark:text-cream-100" : "text-cream-600 dark:text-cream-500"}>
                {s.label}
              </span>
              {i < STEP_LABELS.length - 1 && <span className="mx-1 h-px w-4 bg-cream-300 dark:bg-forest-800" />}
            </li>
          ))}
        </ol>
      )}

      {cameraStep && (
        <div className="flex flex-1 flex-col items-center gap-4 animate-fade-in-up">
          {!cameraEnabled ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <CameraIcon className="h-12 w-12 text-olive-600 dark:text-olive-300" />
              <p className="text-lg font-medium">Camera access is required</p>
              <p className="max-w-sm text-sm text-cream-700 dark:text-cream-300">
                The station must be verified by scanning its rotating QR code. It can&apos;t be
                typed in — that&apos;s what proves someone was physically at the station, not
                just claiming to be.
              </p>
              <button onClick={enableCamera} className="rounded-full bg-forest-800 px-6 py-3 font-medium text-cream-100 transition-transform active:scale-95">
                Enable camera
              </button>
            </div>
          ) : (
            <>
              <p className="text-center text-lg font-medium">
                {step === "station"
                  ? "Point camera at the station screen"
                  : "Scan the product QR, or pick it below"}
              </p>
              {step === "station" && (
                <p className="max-w-sm text-center text-sm text-cream-700 dark:text-cream-300">
                  Every stage starts by scanning the station where you are — this is what proves
                  presence, not just a claim.
                </p>
              )}
              {step === "produce" && (
                <>
                  <p className="rounded-full bg-olive-100 px-3 py-1 text-sm text-olive-800 dark:bg-forest-800 dark:text-cream-100">
                    {stageMeta?.label} scanned ✓
                  </p>
                  <select
                    defaultValue=""
                    onChange={(e) => e.target.value && setBatchId(e.target.value)}
                    className="w-full max-w-sm rounded-full border border-cream-400 bg-cream-50 px-5 py-2.5 text-center font-mono text-olive-900 dark:border-olive-600 dark:bg-olive-900 dark:text-cream-100"
                  >
                    <option value="" disabled>
                      Or choose a batch…
                    </option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} — #{b.id}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </>
          )}
          {/* Always mounted (not conditionally on cameraEnabled) so it exists
              in the DOM before enableCamera ever runs — Html5Qrcode's
              constructor needs the element to already be there, and React's
              state-update commit isn't guaranteed to land before the
              dynamic-import call that follows it. Hidden via CSS instead. */}
          <div
            id="reader"
            className={`w-full max-w-sm overflow-hidden rounded-xl bg-black transition-shadow ${
              cameraEnabled ? "" : "hidden"
            }`}
          />
          {msg && !msg.ok && (
            <p className="rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{msg.text}</p>
          )}
        </div>
      )}

      {step === "photo" && (
        <div className="flex flex-1 flex-col gap-3 animate-fade-in-up">
          <p className="text-center text-lg font-medium">Add a photo and details</p>
          <div className="rounded-lg border border-cream-300 bg-cream-50 p-3 text-sm dark:border-olive-700 dark:bg-olive-800">
            <b>{stageMeta?.label}</b> · batch <span className="font-mono">{batchId}</span>
          </div>
          <label className="relative block w-full cursor-pointer overflow-hidden rounded-xl transition-transform active:scale-[0.98]">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="preview" className="max-h-64 w-full rounded-xl object-cover" />
            ) : (
              <div className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-cream-400 dark:border-olive-600">
                <CameraIcon className="h-10 w-10 text-cream-500 dark:text-cream-600" />
                <span className="text-sm text-cream-600 dark:text-cream-400">Tap to take a photo</span>
              </div>
            )}
            {preview && (
              <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-cream-100">
                Retake photo
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="text-center text-xs text-cream-600 dark:text-cream-400">The photo&apos;s hash goes on-chain.</p>
          <input
            className="w-full rounded-full border border-cream-400 bg-cream-50 px-5 py-2.5 text-olive-900 placeholder:text-cream-600 dark:border-olive-600 dark:bg-olive-900 dark:text-cream-100"
            placeholder="Note (temp 4°C, lot, etc.)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            disabled={!photo || busy}
            onClick={submit}
            className="mt-auto w-full rounded-full bg-forest-800 py-3 font-medium text-cream-100 transition-transform active:scale-95 disabled:opacity-40"
          >
            {busy ? "Writing to Solana…" : "Submit stage"}
          </button>
          {msg && !msg.ok && (
            <p className="rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{msg.text}</p>
          )}
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center animate-fade-in-up">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-forest-800 text-2xl text-cream-100 animate-pop-in">✓</span>
          <p className="text-lg font-medium">{msg?.text}</p>
          <p className="break-all font-mono text-xs text-cream-600 dark:text-cream-400">tx {lastTx.slice(0, 24)}…</p>
          <div className="flex w-full max-w-sm flex-col gap-2">
            <button
              onClick={startOver}
              className="w-full rounded-full bg-forest-800 py-3 font-medium text-cream-100 transition-transform active:scale-95"
            >
              Scan next
            </button>
            <Link
              href={`/verify/${doneBatchId}`}
              className="w-full rounded-full border border-cream-400 py-3 text-center font-medium transition-colors hover:bg-cream-100 dark:border-olive-600 dark:hover:bg-olive-800"
            >
              View batch {doneBatchId}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
