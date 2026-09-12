"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TraceData } from "@/lib/trace-preview";

type Point = {
  id: number;
  stage: string;
  actor: string;
  label: string;
  lat: number;
  lng: number;
};

function getPoints(rows: TraceData["rows"]): Point[] {
  return rows.flatMap(({ s, row, location }) => row && location ? [{
    id: s.id,
    stage: s.label,
    actor: row.actor,
    label: location.label,
    lat: location.lat,
    lng: location.lng,
  }] : []);
}

function popupContent(point: Point) {
  const root = document.createElement("div");
  root.className = "journey-map-popup";
  const stage = document.createElement("strong");
  stage.textContent = `${point.id}. ${point.stage}`;
  const place = document.createElement("span");
  place.textContent = point.label;
  const actor = document.createElement("small");
  actor.textContent = point.actor;
  root.append(stage, place, actor);
  return root;
}

export function JourneyMap({ rows }: { rows: TraceData["rows"] }) {
  const points = useMemo(() => getPoints(rows), [rows]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(points.at(-1)?.id ?? null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const selected = points.find((point) => point.id === selectedId) ?? points.at(-1);

  useEffect(() => {
    if (!containerRef.current || !points.length) return;
    setReady(false);
    setLoadError(false);
    let disposed = false;
    let animationFrame = 0;
    let loadingTimeout = 0;
    let map: import("leaflet").Map | undefined;
    let tilesLoaded = false;

    const initialize = async () => {
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;
      loadingTimeout = window.setTimeout(() => {
        if (!tilesLoaded) setLoadError(true);
      }, 12000);
      const leafletMap = L.map(containerRef.current, {
        center: [points[0].lat, points[0].lng],
        zoom: 7,
        zoomControl: false,
      });
      map = leafletMap;
      L.control.zoom({ position: "topright" }).addTo(leafletMap);
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(leafletMap);
      tiles.once("load", () => {
        tilesLoaded = true;
        window.clearTimeout(loadingTimeout);
        setReady(true);
      });

      const coordinates = points.map((point) => L.latLng(point.lat, point.lng));
      L.polyline(coordinates, { color: "#142e28", weight: 9, opacity: 0.2 }).addTo(leafletMap);
      L.polyline(coordinates, { color: "#1c4038", weight: 4, opacity: 0.92 }).addTo(leafletMap);

      points.forEach((point) => {
        const marker = L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: "journey-map-marker-shell",
            html: `<span class="journey-map-marker-dot">${point.id}</span>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          }),
          keyboard: true,
          title: `${point.stage}: ${point.label}`,
        })
          .bindPopup(popupContent(point), { closeButton: false, offset: [0, -14] })
          .on("click", () => {
            setSelectedId(point.id);
            leafletMap.panTo([point.lat, point.lng], { animate: true, duration: 0.65 });
          })
          .addTo(leafletMap);
        marker.getElement()?.setAttribute("aria-label", `${point.stage}: ${point.label}`);
      });

      if (points.length > 1 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const traveler = L.circleMarker(coordinates[0], {
          radius: 6,
          color: "#1c4038",
          weight: 2,
          fillColor: "#fefcf9",
          fillOpacity: 1,
        }).addTo(leafletMap);
        const startedAt = performance.now();
        const animate = (now: number) => {
          const elapsed = Math.max(0, now - startedAt);
          const progress = (elapsed % 8000) / 8000;
          const segmentProgress = progress * (coordinates.length - 1);
          const segment = Math.max(0, Math.min(Math.floor(segmentProgress), coordinates.length - 2));
          const amount = segmentProgress - segment;
          const from = coordinates[segment];
          const to = coordinates[segment + 1];
          traveler.setLatLng([
            from.lat + (to.lat - from.lat) * amount,
            from.lng + (to.lng - from.lng) * amount,
          ]);
          animationFrame = requestAnimationFrame(animate);
        };
        animationFrame = requestAnimationFrame(animate);
      }

      leafletMap.fitBounds(L.latLngBounds(coordinates), {
        padding: [58, 58],
        maxZoom: 10,
        animate: false,
      });
      requestAnimationFrame(() => leafletMap.invalidateSize());
    };

    void initialize().catch(() => {
      if (!disposed) setLoadError(true);
    });

    return () => {
      disposed = true;
      window.clearTimeout(loadingTimeout);
      cancelAnimationFrame(animationFrame);
      map?.remove();
    };
  }, [points]);

  return (
    <section aria-labelledby="journey-map-heading" className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-50 shadow-[0_20px_55px_-36px_rgba(20,46,40,0.5)] dark:border-olive-700 dark:bg-olive-800">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-7 sm:pt-7">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-forest-800 dark:text-olive-300">JOURNEY MAP</p>
          <h2 id="journey-map-heading" className="mt-1 text-2xl font-semibold">Where this product has been</h2>
          <p className="mt-1 text-sm text-cream-700 dark:text-cream-300">Move around the map or select a numbered marker.</p>
        </div>
        <span className="rounded-full bg-forest-100 px-3 py-1 text-xs text-forest-800">{points.length} location{points.length === 1 ? "" : "s"}</span>
      </div>

      {points.length ? <>
        <div className="relative mx-3 mt-5 h-72 overflow-hidden rounded-xl border border-cream-300 bg-cream-200 sm:mx-5 sm:h-80 dark:border-olive-700 dark:bg-olive-900">
          <div ref={containerRef} className="absolute inset-0" aria-label="Interactive product journey map" />
          {!ready && !loadError && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-cream-100/80 text-sm text-cream-700 backdrop-blur-sm">Loading map…</div>}
          {loadError && <div className="absolute inset-x-4 bottom-4 z-10 rounded-lg bg-red-50 p-3 text-center text-sm text-red-800 shadow">The map tiles could not be loaded. Location details are still available below.</div>}
        </div>
        {selected && <div className="grid gap-3 px-5 py-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:px-7">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-forest-800 font-semibold text-cream-50">{selected.id}</span>
          <div className="min-w-0"><p className="font-semibold">{selected.stage}</p><p className="truncate text-sm text-cream-700 dark:text-cream-300">{selected.actor}</p></div>
          <div className="sm:text-right"><p className="text-sm font-medium">{selected.label}</p><p className="mt-0.5 font-mono text-[11px] text-cream-600 dark:text-cream-400">{selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}</p></div>
        </div>}
      </> : <div className="mx-5 my-6 rounded-xl border border-dashed border-cream-400 bg-cream-100 p-6 text-center text-sm text-cream-700 dark:border-olive-600 dark:bg-olive-900 dark:text-cream-300">Locations will appear here as participating organizations add them to their records.</div>}
    </section>
  );
}
