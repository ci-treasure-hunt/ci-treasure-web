export const EVENT_TYPE_OPTIONS = [
  "jam",
  "class",
  "lab",
  "underscore",
  "cdp",
  "performance",
  "lecture",
  "workshop",
  "long_jam",
  "training",
  "festival",
  "camp",
  "retreat",
  "intensive",
  "residency",
  "other",
] as const;

// 'archived' deliberately excluded -- it's set only by the daily pg_cron job
// (published -> archived once end_date passes), never manually by an admin.
export const EVENT_STATUS_OPTIONS = ["draft", "published"] as const;
// Canonical list per ci-treasure-hunt/docs/web/link-types.md (2026-07-06) — keep in sync. This
// cross-repo reference has drifted twice already: deprecated values found live 2026-07-22
// (facebook/info/program from a stale copy of this list -- a self-submitted event picked
// "facebook" for its FB event link because facebook_event wasn't offered), and this comment's own
// path was wrong for weeks (said docs/enrichment/LINK_TYPES.md, a path that never existed) until
// the file was moved out of scripts/enrichment/ to docs/web/ on 2026-08-24 specifically to stop
// this recurring. `facebook_page`/`facebook_group` deliberately excluded here — those
// belong on the teacher/organizer profile, never the event, per link-types.md.
export const LINK_TYPE_OPTIONS = ["website", "registration", "info_pack", "schedule", "facebook_event", "video", "telegram", "whatsapp", "instagram", "youtube", "other"] as const;
export const TEACHER_ROLE_OPTIONS = ["teacher", "assistant", "guest", "musician", "intensive"] as const;
export const ORGANIZER_ROLE_OPTIONS = ["lead", "co-organizer", "hosting_venue"] as const;

export type AdminPriceItem = {
  amount: string;
  currency: string;
  description: string;
};

export type AdminLinkItem = {
  type: string;
  url: string;
};

export type AdminPersonItem = {
  profileId: string;
  name: string;
  role: string;
};

export type AdminEventFormData = {
  id: string | null;
  title: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  timezone: string;
  city: string;
  country: string;
  venueId: string | null;
  venueLabel: string;
  venueName: string;
  contactEmail: string;
  description: string;
  imageUrl: string;
  cancelled: boolean;
  cancelledText: string;
  hide: boolean;
  priceItems: AdminPriceItem[];
  linkItems: AdminLinkItem[];
  teachers: AdminPersonItem[];
  organizers: AdminPersonItem[];
};

export function createEmptyEventFormData(): AdminEventFormData {
  return {
    id: null,
    title: "",
    type: "workshop",
    status: "draft",
    startDate: "",
    endDate: "",
    timezone: "Europe/Berlin",
    city: "",
    country: "",
    venueId: null,
    venueLabel: "",
    venueName: "",
    contactEmail: "",
    description: "",
    imageUrl: "",
    cancelled: false,
    cancelledText: "",
    hide: false,
    priceItems: [],
    linkItems: [],
    teachers: [],
    organizers: [],
  };
}
