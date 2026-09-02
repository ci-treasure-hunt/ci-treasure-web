// I-167: config for the event-type listing pages (/festivals, /workshops, /retreats,
// /intensives, /long-jams). One entry drives metadata, the H1/intro copy, and the
// getEventsByType() query for its page — see components/event-type-listing.tsx for the shared
// render and app/<slug>/page.tsx for the five thin per-route wrappers.
//
// Intro copy below is a first draft written during build (2026-09-02), not final — flagged in
// the I-167 spec as a to-do to review/rewrite before ship, not stub text (see
// feedback_new_event_creation / bio conventions on never shipping placeholder copy — this is
// real, considered text, just not yet signed off).
export type EventTypePageConfig = {
  /** DB `events.type` value */
  type: string;
  /** URL path, e.g. "/festivals" */
  path: string;
  /** <title> and H1 base, before " Worldwide" / site suffix handling */
  label: string;
  /** Meta description, ~150-160 chars */
  description: string;
  /** One defining paragraph, rendered under the H1, distinguishing this type from its neighbors */
  intro: string;
  /**
   * I-148. The guide a reader of THIS listing most likely wants next. Tightest intent match on
   * the site: someone browsing /festivals is by definition considering going to one. Phrased as
   * what the guide gives them, not as "read our guide", so it reads as help rather than promotion.
   * Optional, so a future type can ship before a guide exists for it.
   */
  guide?: { href: string; label: string };
};

export const EVENT_TYPE_PAGES: EventTypePageConfig[] = [
  {
    type: "festival",
    path: "/festivals",
    label: "Contact Improvisation Festivals",
    description:
      "Discover Contact Improvisation festivals around the world: multi-day gatherings with many teachers, workshops, jams, and performances, kept up to date.",
    intro:
      "A festival brings together many teachers, workshops, jams, and often performances in one place, usually over several days. It's the widest way to experience Contact Improvisation with a large community, rather than a single class or teacher.",
    guide: {
      href: "/guides/first-ci-festival-prep",
      label: "Going to your first one? What to pack, and how to pace a week",
    },
  },
  {
    type: "workshop",
    path: "/workshops",
    label: "Contact Improvisation Workshops",
    description:
      "Discover Contact Improvisation workshops around the world: focused, teacher-led classes from a single day to a weekend, hand-researched and kept up to date.",
    intro:
      "A workshop is a focused block of classes with one teacher or teaching team, typically a single day up to a weekend. It's the most common way to study a specific theme or technique without committing to a longer gathering.",
    guide: {
      href: "/guides/what-is-contact-improvisation",
      label: "New to Contact Improvisation? Start with what it actually is",
    },
  },
  {
    type: "retreat",
    path: "/retreats",
    label: "Contact Improvisation Retreats",
    description:
      "Discover Contact Improvisation retreats around the world: multi-day gatherings that pair practice with rest and nature, hand-researched and kept up to date.",
    intro:
      "A retreat is a multi-day gathering, often at a residential venue away from daily life, that pairs Contact Improvisation practice with rest, nature, and reflection. Expect a slower, less densely scheduled pace than a festival or intensive.",
    guide: {
      href: "/guides/first-ci-festival-prep",
      label: "First multi-day event? What to pack, and how to pace yourself",
    },
  },
  {
    type: "intensive",
    path: "/intensives",
    label: "Contact Improvisation Intensives",
    description:
      "Discover Contact Improvisation intensives around the world: multi-day deep-dives into a single theme with one teacher or team, kept up to date.",
    intro:
      "An intensive is a multi-day deep-dive into Contact Improvisation, usually led by one teacher or a small teaching team around a single theme, with a denser, more concentrated curriculum than a festival's mixed program.",
    guide: {
      href: "/guides/first-ci-festival-prep",
      label: "First multi-day event? What to pack, and how to pace yourself",
    },
  },
  {
    type: "long_jam",
    path: "/long-jams",
    label: "Contact Improvisation Long Jams",
    description:
      "Discover Contact Improvisation long jams around the world: extended, teacher-free open dancing beyond a typical evening jam, kept up to date.",
    intro:
      "A long jam is an extended, teacher-free open dance that runs longer than a typical evening or weekly jam, often a full day or across several days. It's about practicing together, not being taught.",
    guide: {
      href: "/guides/contact-improvisation-jam-etiquette",
      label: "What happens at a jam, and the etiquette that holds it together",
    },
  },
];

export function getEventTypePageConfig(type: string): EventTypePageConfig {
  const config = EVENT_TYPE_PAGES.find((c) => c.type === type);
  if (!config) throw new Error(`No event type page config for type "${type}"`);
  return config;
}
