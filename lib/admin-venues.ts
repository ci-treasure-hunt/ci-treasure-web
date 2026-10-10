import type { PhoneContactInput } from "./phone-contacts";

export const VENUE_VISIBILITY_OPTIONS = ["public", "hidden"] as const;

// I-181: the three venue levels, as one admin control over the two columns underneath
// (`visibility`, `show_in_list`). "Listed" without a page can't be chosen, so the combination
// that makes no sense can't be stored. Plain text on an event with no venue is not a level.
export const VENUE_LEVELS = [
  { value: "pin", label: "Pin: no page, linkable, on the map" },
  { value: "page", label: "Page: own venue page" },
  { value: "listed", label: "Listed: own page and on /venues" },
] as const;

export type VenueLevel = (typeof VENUE_LEVELS)[number]["value"];

export function venueLevel(visibility: string, showInList: boolean): VenueLevel {
  if (visibility !== "public") return "pin";
  return showInList ? "listed" : "page";
}

export function venueLevelColumns(level: VenueLevel): { visibility: "public" | "hidden"; showInList: boolean } {
  if (level === "pin") return { visibility: "hidden", showInList: false };
  return { visibility: "public", showInList: level === "listed" };
}

export type AdminVenueFormData = {
  id: string | null;
  name: string;
  slug: string;
  city: string;
  country: string;
  region: string;
  address: string;
  lat: string;
  lng: string;
  description: string;
  website: string;
  email: string;
  newsletter: string;
  facebook: string;
  instagram: string;
  youtube: string;
  // Gated phone/WhatsApp contacts (entity_phone_contacts), not a column on venues.
  phoneContacts: PhoneContactInput[];
  imageUrl: string;
  imageCredit: string;
  visibility: string;
  showInList: boolean;
  showInAnnounce: boolean;
  announceName: string;
  adminNotes: string;
};

export function createEmptyVenueFormData(): AdminVenueFormData {
  return {
    id: null,
    name: "",
    slug: "",
    city: "",
    country: "",
    region: "",
    address: "",
    lat: "",
    lng: "",
    description: "",
    website: "",
    email: "",
    newsletter: "",
    facebook: "",
    instagram: "",
    youtube: "",
    phoneContacts: [],
    imageUrl: "",
    imageCredit: "",
    visibility: "hidden",
    showInList: false,
    showInAnnounce: false,
    announceName: "",
    adminNotes: "",
  };
}
