"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Globe } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Dynamic import of markercluster styles is safe
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import { type Community } from "@/lib/communities";
import { escapeHtml } from "@/lib/utils";

// Standard fix for Leaflet default icon markers in Next.js/Webpack environment
const fixLeafletIcons = () => {
  // @ts-expect-error - Leaflet internal property
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
};

type CommunityMapProps = {
  communities: Community[];
  highlightedCommunityId: string | null;
  onMarkerClick?: (communityId: string) => void;
  onReset?: () => void;
  visible?: boolean;
};

export default function CommunityMap({ communities, highlightedCommunityId, onMarkerClick, onReset, visible }: CommunityMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersMapRef = useRef<Record<string, L.Marker>>({});
  const [mapReady, setMapReady] = useState(false);
  const [showReset, setShowReset] = useState(false);
  // Skip fitBounds on first mobile render (keep Europe default); fit on subsequent filter changes
  const hasFitOnceMobile = useRef(false);
  // Suppress moveend-based showReset during programmatic fits
  const isProgFitRef = useRef(false);
  const progFitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to build custom HTML markers matching violet theme
  const createCustomMarker = () => {
    const color = "#6834b2";
    return L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -7],
    });
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let cancelled = false;

    const initMap = async () => {
      await import("leaflet.markercluster");
      // Guard after async gap: StrictMode cleanup may have run and set cancelled
      if (cancelled || !mapContainerRef.current || mapRef.current) return;
      fixLeafletIcons();

      // Create Map with default focus on Europe
      const isMobile = window.innerWidth < 640;
      const map = L.map(mapContainerRef.current, {
        scrollWheelZoom: true,
        worldCopyJump: true,
        minZoom: 2,
      }).setView([48, 12], isMobile ? 2 : 4);

      // CartoDB Positron - Light Grayscale/Silver tiles
      L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${process.env.NEXT_PUBLIC_CARTO_API_KEY}`, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);

      // Initialize cluster group
      const clusterGroup = L.markerClusterGroup({
        maxClusterRadius: 40,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        disableClusteringAtZoom: 10,
      });
      map.addLayer(clusterGroup);

      mapRef.current = map;
      clusterGroupRef.current = clusterGroup;
      setMapReady(true);
    };

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const handleMarkerClickInternal = useCallback((communityId: string) => {
    if (onMarkerClick) {
      onMarkerClick(communityId);
    }
  }, [onMarkerClick]);

  // Mark a programmatic fit in progress so moveend doesn't trigger showReset
  const startProgFit = useCallback(() => {
    isProgFitRef.current = true;
    if (progFitTimerRef.current) clearTimeout(progFitTimerRef.current);
    progFitTimerRef.current = setTimeout(() => { isProgFitRef.current = false; }, 800);
  }, []);

  // Show "Reset view" button whenever the user pans or zooms manually
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const onMoveEnd = () => {
      if (!isProgFitRef.current) setShowReset(true);
    };
    map.on("moveend", onMoveEnd);
    return () => { map.off("moveend", onMoveEnd); };
  }, [mapReady]);

  // Update Markers when communities list changes
  useEffect(() => {
    const map = mapRef.current;
    const clusterGroup = clusterGroupRef.current;
    if (!map || !clusterGroup) return;

    // Clear previous markers
    clusterGroup.clearLayers();
    markersMapRef.current = {};

    const bounds: L.LatLngTuple[] = [];

    communities.forEach((community) => {
      if (typeof community.latitude !== "number" || typeof community.longitude !== "number") return;

      const icon = createCustomMarker();
      const marker = L.marker([community.latitude, community.longitude], { icon, alt: community.name });
      // Leaflet's `alt` option only reaches an <img>-based icon; this is a
      // divIcon, so set the accessible name directly once it's actually in
      // the DOM (markers inside a cluster group aren't always mounted yet).
      marker.on("add", () => {
        const el = marker.getElement();
        if (el) {
          el.setAttribute("aria-label", community.name);
          el.setAttribute("title", community.name);
        }
      });

      const badgeText = community.type || "Community";
      const badgeColor = "bg-violet-100 text-violet-700";

      const popupContent = `
        <div class="p-2 space-y-2 font-sans text-slate-900 max-w-64 min-w-56">
          <div class="flex items-center gap-1.5">
            <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${badgeColor}">
              ${escapeHtml(badgeText)}
            </span>
          </div>
          <h4 class="font-serif text-base font-bold leading-tight text-slate-950">${escapeHtml(community.name)}</h4>
          <p class="text-xs text-slate-500 flex items-center gap-1">
            <span>📍</span> ${escapeHtml(community.city)}${community.city && community.country ? ", " : ""}${escapeHtml(community.country)}
          </p>
          <div class="pt-1.5 border-t border-slate-100 flex items-center justify-between">
            <a href="/communities/${encodeURIComponent(community.slug)}" class="text-xs font-semibold text-violet-600 hover:text-violet-800 transition flex items-center gap-1">
              View details &rarr;
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        closeButton: false,
        className: "custom-map-popup",
      });

      marker.on("click", () => {
        handleMarkerClickInternal(community.id);
      });

      markersMapRef.current[community.id] = marker;
      clusterGroup.addLayer(marker);
      bounds.push([community.latitude, community.longitude]);
    });

    // Always fit on desktop; on mobile skip only the very first render (initial Europe view),
    // then fit on every subsequent change (filter, etc.)
    if (bounds.length > 0) {
      const isMobile = window.innerWidth < 640;
      if (!isMobile || hasFitOnceMobile.current) {
        startProgFit();
        setShowReset(false);
        if (bounds.length === 1) {
          map.setView(bounds[0], 8, { animate: true });
        } else {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9 });
        }
      }
      hasFitOnceMobile.current = true;
    }
  }, [communities, handleMarkerClickInternal, mapReady, startProgFit]);

  // When the map container becomes visible (mobile switching to map view), Leaflet needs to
  // recalculate its dimensions and re-fit to the current markers
  useEffect(() => {
    if (!visible) return;
    const map = mapRef.current;
    if (!map) return;

    const timer = setTimeout(() => {
      map.invalidateSize();
      const currentBounds = Object.values(markersMapRef.current).map((m) => {
        const ll = m.getLatLng();
        return [ll.lat, ll.lng] as L.LatLngTuple;
      });
      if (currentBounds.length > 0) {
        startProgFit();
        setShowReset(false);
        if (currentBounds.length === 1) {
          map.setView(currentBounds[0], 8, { animate: false });
        } else {
          map.fitBounds(currentBounds, { padding: [40, 40], maxZoom: 9 });
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [visible, startProgFit]);

  // Zoom to highlighted community
  useEffect(() => {
    const map = mapRef.current;
    const clusterGroup = clusterGroupRef.current;
    if (!map || !clusterGroup) return;

    if (!highlightedCommunityId) {
      map.closePopup();
      return;
    }

    const marker = markersMapRef.current[highlightedCommunityId];
    if (marker) {
      startProgFit();
      clusterGroup.zoomToShowLayer(marker, () => {
        map.setView(marker.getLatLng(), 10, { animate: true });
        marker.openPopup();
        setShowReset(true);
      });
    }
  }, [highlightedCommunityId, startProgFit]);

  const handleResetView = () => {
    const map = mapRef.current;
    if (!map) return;
    map.closePopup();
    const allBounds = Object.values(markersMapRef.current).map((m) => {
      const ll = m.getLatLng();
      return [ll.lat, ll.lng] as L.LatLngTuple;
    });
    startProgFit();
    setShowReset(false);
    if (allBounds.length === 1) {
      map.setView(allBounds[0], 8, { animate: true });
    } else if (allBounds.length > 1) {
      map.fitBounds(allBounds, { padding: [40, 40], maxZoom: 9 });
    }
    onReset?.();
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner">
      <div ref={mapContainerRef} className="h-full w-full z-10" />
      {showReset && (
        <button
          onClick={handleResetView}
          className="absolute top-3 right-3 z-1001 flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md backdrop-blur-sm transition hover:bg-white hover:text-violet-700"
        >
          <Globe className="size-3.5" />
          Reset view
        </button>
      )}
    </div>
  );
}
