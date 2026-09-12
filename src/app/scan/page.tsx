"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { STAGES } from "@/lib/stages";
import { ROLE_LABELS, ROLE_STAGES, type OrgRole } from "@/lib/orgs";
import type { RecordedLocation } from "@/lib/demo-locations";
import { LocationPicker } from "@/components/LocationPicker";

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
  const [location, setLocation] = useState<RecordedLocation | null>(null);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ matches: boolean; reasoning: string } | { error: string } | null>(null);
  const [photoConfirmed, setPhotoConfirmed] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastTx, setLastTx] = useState("");
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [webcamError, setWebcamError] = useState("");
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  // Phones already get a native camera/gallery chooser from <input capture>,
  // so only desktop (no such chooser — it's just Finder either way) gets the
  // in-page getUserMedia webcam flow below.
  const isMobileDevice = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

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

  useEffect(() => {
    if (webcamOpen && webcamVideoRef.current && webcamStreamRef.current) {
      webcamVideoRef.current.srcObject = webcamStreamRef.current;
    }
  }, [webcamOpen]);
  useEffect(() => () => void webcamStreamRef.current?.getTracks().forEach((t) => t.stop()), []);

  async function openWebcam() {
    setWebcamError("");
    try {
      webcamStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setWebcamOpen(true);
    } catch (e) {
      setWebcamError(cameraErrorMessage(e));
    }
  }

  function closeWebcam() {
    webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
    webcamStreamRef.current = null;
    setWebcamOpen(false);
  }

  function captureWebcamPhoto() {
    const video = webcamVideoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) onPhoto(new File([blob], "webcam-photo.jpg", { type: "image/jpeg" }));
      closeWebcam();
    }, "image/jpeg", 0.9);
  }

  function onPhoto(f: File | null) {
    setPhoto(f);
    setPreview(f ? URL.createObjectURL(f) : "");
    // A retake makes any prior verdict stale — it was about the old photo.
    setValidation(null);
    setPhotoConfirmed(false);
  }

  /** Asks Gemini (via OpenRouter) whether the photo plausibly shows the
   * claimed produce. A pass unlocks "Confirm Upload", which is required
   * before Submit stage. */
  async function validatePhoto() {
    if (!photo) return;
    const produceName = batches.find((b) => b.id === batchId)?.name ?? batchId;
    setValidating(true);
    setValidation(null);
    const fd = new FormData();
    fd.set("photo", photo);
    fd.set("produceName", produceName);
    try {
      const r = await fetch("/api/validate-photo", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setValidation(j);
    } catch (e) {
      setValidation({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setValidating(false);
    }
  }

  function startOver() {
    setStation(null);
    setStationConfirmed(false);
    setBatchId("");
    onPhoto(null);
    setNote("");
    setLocation(null);
    setMsg(null);
    setLastTx("");
  }

  async function submit() {
    if (!station || !batchId || !photo || !photoConfirmed || !location) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("batchId", batchId);
    fd.set("stage", String(station.s));
    fd.set("code", station.c);
    fd.set("note", note);
    fd.set("photo", photo);
    fd.set("locationLat", String(location.lat));
    fd.set("locationLng", String(location.lng));
    fd.set("locationLabel", location.label);
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
                {step === "station" && !station
                  ? "Point camera at the station screen"
                  : step === "station"
                    ? "Station confirmed"
                    : "Scan the product QR, or pick it below"}
              </p>
              {step === "station" && !station && (
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
            } ${station && !stationConfirmed ? "ring-4 ring-green-500" : ""}`}
          />
          {station && !stationConfirmed && (
            <button
              onClick={() => setStationConfirmed(true)}
              className="w-full max-w-sm rounded-full bg-forest-800 py-3 font-medium text-cream-100 transition-transform active:scale-95 animate-pop-in"
            >
              Continue
            </button>
          )}
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
          <section className="space-y-3 rounded-xl border border-cream-300 bg-cream-50 p-4 dark:border-olive-700 dark:bg-olive-800">
            <div>
              <h2 className="font-medium text-olive-900 dark:text-cream-100">Record this stage&apos;s location</h2>
              <p className="mt-1 text-xs text-cream-700 dark:text-cream-300">
                Your coordinates are saved with this stage and shown on the customer journey map.
              </p>
            </div>
            <LocationPicker value={location} onChange={setLocation} />
          </section>
          <div
            className={`aspect-square w-full overflow-hidden rounded-xl transition-shadow ${
              validation && "matches" in validation
                ? validation.matches
                  ? "ring-4 ring-green-500"
                  : "ring-4 ring-red-500"
                : ""
            }`}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center border-2 border-dashed border-cream-400 dark:border-olive-600">
                <CameraIcon className="h-10 w-10 text-cream-500 dark:text-cream-600" />
              </div>
            )}
          </div>
          <p className="text-center text-xs text-cream-600 dark:text-cream-400">The photo&apos;s hash goes on-chain.</p>
          {validation && "error" in validation && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              Couldn&apos;t validate: {validation.error}
            </p>
          )}
          {validation && "matches" in validation && (
            <div
              className={`rounded-lg p-3 text-sm ${
                validation.matches
                  ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300"
                  : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300"
              }`}
            >
              <p className="font-medium">
                {validation.matches ? "✓ Validation success" : "✗ Validation failed, please upload the correct photo"}
              </p>
              <p className="mt-0.5 opacity-80">{validation.reasoning}</p>
            </div>
          )}
          <div className="flex w-full gap-3">
            {isMobileDevice ? (
              <label className="flex-1 cursor-pointer rounded-full bg-forest-800 py-3 text-center font-medium text-cream-100 transition-transform active:scale-95">
                Take Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <button
                type="button"
                onClick={openWebcam}
                className="flex-1 rounded-full bg-forest-800 py-3 text-center font-medium text-cream-100 transition-transform active:scale-95"
              >
                Take Photo
              </button>
            )}
            <label className="flex-1 cursor-pointer rounded-full bg-forest-800 py-3 text-center font-medium text-cream-100 transition-transform active:scale-95">
              Photo Library
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {webcamError && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{webcamError}</p>
          )}
          {webcamOpen && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 p-4">
              <video
                ref={webcamVideoRef}
                autoPlay
                playsInline
                muted
                className="max-h-[70vh] w-full max-w-md rounded-xl bg-black object-cover"
              />
              <div className="flex w-full max-w-md gap-3">
                <button
                  type="button"
                  onClick={closeWebcam}
                  className="flex-1 rounded-full border border-cream-300 bg-cream-50 py-3 font-medium text-olive-900 transition-transform active:scale-95 dark:border-olive-600 dark:bg-olive-800 dark:text-cream-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={captureWebcamPhoto}
                  className="flex-1 rounded-full bg-forest-800 py-3 font-medium text-cream-100 transition-transform active:scale-95"
                >
                  Capture
                </button>
              </div>
            </div>
          )}
          {photo && (
            <button
              onClick={validatePhoto}
              disabled={validating}
              className="w-full rounded-full bg-forest-800 py-2.5 font-medium text-cream-100 transition-transform active:scale-95 disabled:opacity-50"
            >
              {validating ? "Checking with Gemini…" : "Validate"}
            </button>
          )}
          <button
            onClick={() => setPhotoConfirmed(true)}
            disabled={!validation || !("matches" in validation) || !validation.matches || photoConfirmed}
            className="w-full rounded-full bg-forest-800 py-2.5 font-medium text-cream-100 transition-transform active:scale-95 disabled:opacity-40"
          >
            {photoConfirmed ? "Upload confirmed ✓" : "Confirm Upload"}
          </button>
          <input
            className="w-full rounded-full border border-cream-400 bg-cream-50 px-5 py-2.5 text-olive-900 placeholder:text-cream-600 dark:border-olive-600 dark:bg-olive-900 dark:text-cream-100"
            placeholder="Note (temp 4°C, lot, etc.)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            disabled={!photo || !photoConfirmed || !location || busy}
            onClick={submit}
            className="mt-auto w-full rounded-full bg-forest-800 py-3 font-medium text-cream-100 transition-transform active:scale-95 disabled:opacity-40"
          >
            {busy ? "Writing to Solana…" : !location ? "Select a location to submit" : "Submit stage"}
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
