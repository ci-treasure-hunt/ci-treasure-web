import type { PhoneContactInput } from "./phone-contacts";

export const VENUE_VISIBILITY_OPTIONS = ["public", "hidden"] as const;

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
