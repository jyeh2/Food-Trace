"use client";

import { useState } from "react";
import { DEMO_LOCATIONS, type RecordedLocation } from "@/lib/demo-locations";

const LOCATION_CATEGORIES = ["Farm", "Processing", "Distribution", "Retail"] as const;

export function LocationPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: RecordedLocation | null;
  onChange: (location: RecordedLocation) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function useCurrentLocation() {
    setBusy(true);
    setError("");
    if (!navigator.geolocation) {
      setBusy(false);
      setError("Location services are not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onChange({
          label: "Current GPS location",
          lat: coords.latitude,
          lng: coords.longitude,
        });
        setBusy(false);
      },
      (locationError) => {
        const message = locationError.code === locationError.PERMISSION_DENIED
          ? "Location permission was denied. Allow location access in your browser settings and try again."
          : locationError.code === locationError.TIMEOUT
            ? "Location request timed out. Move somewhere with a clearer GPS signal and try again."
            : "Your current location could not be determined. Try again or use a demo location.";
        setError(message);
        setBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12_000 },
    );
  }

  function selectDemoLocation(id: string) {
    const preset = DEMO_LOCATIONS.find((item) => item.id === id);
    if (!preset) return;
    onChange({ label: preset.label, lat: preset.lat, lng: preset.lng });
    setError("");
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={disabled || busy}
        className="w-full rounded-full bg-forest-800 py-2.5 font-medium text-cream-100 transition-transform active:scale-95 disabled:opacity-50"
      >
        {busy ? "Finding your location…" : "Use my current location"}
      </button>
      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-cream-600 dark:text-cream-400">
        <span className="h-px flex-1 bg-cream-300 dark:bg-olive-600" />
        Or
        <span className="h-px flex-1 bg-cream-300 dark:bg-olive-600" />
      </div>
      <select
        value={DEMO_LOCATIONS.find((item) => item.label === value?.label)?.id ?? ""}
        onChange={(event) => selectDemoLocation(event.target.value)}
        disabled={disabled}
        className="w-full rounded-full border border-cream-400 bg-white px-4 py-2.5 text-olive-900 disabled:opacity-50 dark:border-olive-600 dark:bg-olive-900 dark:text-cream-100"
      >
        <option value="" disabled>Choose a demo location…</option>
        {LOCATION_CATEGORIES.map((category) => (
          <optgroup key={category} label={category}>
            {DEMO_LOCATIONS.filter((item) => item.category === category).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {value && (
        <div className="rounded-lg bg-olive-100 p-3 text-sm text-olive-900 dark:bg-forest-800 dark:text-cream-100">
          <p className="font-medium">✓ {value.label}</p>
          <p className="mt-0.5 font-mono text-xs opacity-75">
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
          </p>
        </div>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
      )}
    </div>
  );
}
