"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import type { CountryMapMarker } from "@/lib/country-pages";
import { escapeHtml } from "@/lib/utils";

const TYPE_COLOR: Record<CountryMapMarker["type"], string> = {
  event: "#6834b2", // matches the existing event-map marker color
  venue: "#0b6b73", // pine-adjacent, matches the venue accent used elsewhere
  community: "#f17b34", // matches the festival/community accent
};

const TYPE_LABEL: Record<CountryMapMarker["type"], string> = {
  event: "Event",
  venue: "Venue",
  community: "Community",
};

type CombinedMapProps = {
  markers: CountryMapMarker[];
};

export default function CombinedMap({ markers }: CombinedMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !mapContainerRef.current || mapRef.current) return;
    let cancelled = false;

    const initMap = async () => {
      await import("leaflet.markercluster");
      if (cancelled || !mapContainerRef.current || mapRef.current) return;

      // Same default-icon fix components/map.tsx uses
      // @ts-expect-error - Leaflet internal property
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });

      const isMobile = window.innerWidth < 640;
      const map = L.map(mapContainerRef.current, {
        scrollWheelZoom: true,
        worldCopyJump: true,
        minZoom: 2,
      }).setView([48, 12], isMobile ? 2 : 4);

      L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_CARTO_API_KEY}`, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);

      // One shared cluster group across all three types — cluster bubbles show a type-agnostic
      // count. Breaking clusters down by type inside the bubble is a nice-to-have, not v1.
      const clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 40,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 10,
        iconCreateFunction: (cluster: L.MarkerCluster) => {
          const count = cluster.getChildCount();
          const sizeClass = count < 10 ? "small" : count < 100 ? "medium" : "large";
          return L.divIcon({
            html: `<div><span>${count}</span></div>`,
            className: `marker-cluster marker-cluster-${sizeClass}`,
            iconSize: L.point(48, 48),
          });
        },
      });
      map.addLayer(clusterGroup);

      const bounds: L.LatLngTuple[] = [];

      markers.forEach((marker) => {
        const color = TYPE_COLOR[marker.type];
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
          popupAnchor: [0, -7],
        });

        const leafletMarker = L.marker([marker.lat, marker.lng], { icon, alt: marker.title });
        leafletMarker.on("add", () => {
          const el = leafletMarker.getElement();
          if (el) {
            el.setAttribute("aria-label", marker.title);
            el.setAttribute("title", marker.title);
          }
        });

        // bindPopup renders its argument as raw HTML — marker.title is organizer-submitted
        // free text, so it MUST go through escapeHtml (same rationale as map.tsx).
        const popupContent = `
          <div class="p-2 space-y-1.5 font-sans text-slate-900 max-w-64 min-w-56">
            <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase" style="background:${color}22;color:${color}">
              ${TYPE_LABEL[marker.type]}
            </span>
            <h4 class="font-serif text-base font-bold leading-tight text-slate-950">${escapeHtml(marker.title)}</h4>
            <a href="${escapeHtml(marker.href)}" class="text-xs font-semibold text-violet-600 hover:text-violet-800 transition inline-block pt-1">
              Details page &rarr;
            </a>
          </div>
        `;
        leafletMarker.bindPopup(popupContent, { closeButton: false, className: "custom-map-popup" });

        clusterGroup.addLayer(leafletMarker);
        bounds.push([marker.lat, marker.lng]);
      });

      if (bounds.length === 1) {
        map.setView(bounds[0], 8);
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9 });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  if (!mounted) {
    return <div className="h-full w-full rounded-xl border border-slate-200 bg-slate-100 animate-pulse" />;
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner">
      <div ref={mapContainerRef} className="h-full w-full z-10" />
    </div>
  );
}
