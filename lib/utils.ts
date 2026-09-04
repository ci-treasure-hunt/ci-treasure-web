import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// HTML-escape a string for interpolation into innerHTML contexts — Leaflet's
// bindPopup()/divIcon html take raw HTML strings, unlike React's auto-escaped
// JSX. Event titles/cities, venue/community names etc. are organizer- or
// admin-submitted free text; a value like "<img src=x onerror=...>" interpolated
// unescaped into a popup template executes in our origin. Escape everything
// dynamic, including values that "should" come from a closed list (a crafted
// server-action call can store arbitrary strings in e.g. events.type).
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getCountryFlag(countryCode: string) {
  if (!countryCode || countryCode.length !== 2) return "";
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}
