"use client";

import { useEffect, useRef, useState } from "react";
import type { Map } from "leaflet";
import "leaflet/dist/leaflet.css";
import { escapeHtml } from "@/lib/utils";

type VenueMapProps = {
  lat: number;
  lng: number;
  name: string;
};

export default function VenueMap({ lat, lng, name }: VenueMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !mapContainerRef.current || mapRef.current) return;

    let cancelled = false;

    const initMap = async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, {
        scrollWheelZoom: false,
        worldCopyJump: true,
        zoomControl: true,
      }).setView([lat, lng], 13);

      L.tileLayer(`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_CARTO_API_KEY}`, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:50%;background:#6834b2;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      const marker = L.marker([lat, lng], { icon, alt: name }).addTo(map).bindPopup(escapeHtml(name));
      // Leaflet's `alt` option only reaches an <img>-based icon; this is a
      // divIcon, so set the accessible name directly on its DOM element.
      const el = marker.getElement();
      if (el) {
        el.setAttribute("aria-label", name);
        el.setAttribute("title", name);
      }

      mapRef.current = map;
    };

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mounted, lat, lng, name]);

  if (!mounted) {
    return <div className="h-[300px] w-full rounded-2xl border border-slate-200 bg-slate-100 animate-pulse" />;
  }

  return (
    <div className="h-[300px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <div ref={mapContainerRef} className="h-full w-full z-10" />
    </div>
  );
}
