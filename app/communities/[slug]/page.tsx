import { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  Globe,
  Instagram,
  MapPin,
  MessageCircle,
  Send,
  Youtube,
  Users,
  Languages,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import BackButton from "@/components/back-button";
import { EntityBreadcrumb } from "@/components/entity-breadcrumb";
import VenueMap from "@/components/venue-map";
import { ExpandableList } from "@/components/expandable-list";
import { CompactTeacherRow } from "@/components/compact-entity-row";
import { VenueCard } from "@/components/entity-cards";
import { getLinkLabel, linkSortKey } from "@/lib/events";
import {
  formatEventDateRange,
  getCountryLabel,
  getCountryLabelWithArticle,
  getEventHref,
  getEventLocation,
  getTypeLabel,
  padShortDescription,
  EventListItem as EventListItemType,
} from "@/lib/event-display";
import {
  COMMUNITY_RELATED_EVENTS_LIMIT,
  getAllCommunitySlugs,
  getCommunityBySlug,
  getCommunityOwnEvents,
  getCommunityEventsByCountry,
  getPublishedInvitePlatforms,
  isLineUrl,
  isMessengerUrl,
  isPrivateGroupInvite,
  resolveCommunitySlugRedirect,
  getCommunityRingNeighbors,
} from "@/lib/communities";
import { getCountryPageLink } from "@/lib/country-pages";
import { getCountryFlag } from "@/lib/utils";
import { SITE_URL, SITE_OG_IMAGE, buildEntityTitle } from "@/lib/site";
import { ogImage } from "@/lib/og-image";
import { ReportButton } from "@/components/report-button";
import { InviteButtons } from "@/components/invite-buttons";
import { AlsoBrowse } from "@/components/also-browse";

export const revalidate = 3600;

type CommunityPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateStaticParams() {
  const slugs = await getAllCommunitySlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: CommunityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const community = await getCommunityBySlug(slug);
  if (!community) return {};

  const countryLabel = getCountryLabel(community.country ?? "");
  const description = community.description
    ? padShortDescription(community.description, "communities")
    : `${community.name} is a Contact Improvisation community in ${community.city}, ${countryLabel}, part of the CI Treasure Hunt global directory of jams, classes, and gatherings.`.slice(0, 160);

  return {
    title: buildEntityTitle(community.name, { city: community.city, country: countryLabel }),
    description,
    alternates: {
      canonical: `${SITE_URL}/communities/${community.slug}`,
    },
    openGraph: {
      title: community.name,
      description,
      url: `${SITE_URL}/communities/${community.slug}`,
      siteName: "CI Treasure Hunt",
      type: "website",
      // Communities have no image field of their own — always the site fallback, with its
      // known dimensions (unlike events/teachers/venues, which probe their own photo).
      images: [await ogImage(null)],
    },
    twitter: {
      card: "summary_large_image",
      title: community.name,
      description,
      images: [SITE_OG_IMAGE],
    },
  };
}

export default async function CommunityPage({ params }: CommunityPageProps) {
  const { slug } = await params;
  const community = await getCommunityBySlug(slug);

  if (!community) {
    const currentSlug = await resolveCommunitySlugRedirect(slug);
    if (currentSlug) {
      permanentRedirect(`/communities/${currentSlug}`);
    }
    notFound();
  }

  const [publishedInvitePlatforms, ownEvents, relatedEventsRaw, countryLink, ringNeighbors] = await Promise.all([
    getPublishedInvitePlatforms(community.id),
    getCommunityOwnEvents(community.id),
    getCommunityEventsByCountry(community.country),
    getCountryPageLink(community.country),
    getCommunityRingNeighbors(community.slug, community.country),
  ]);
  const hasPublishedInvites = Object.keys(publishedInvitePlatforms).length > 0;
  const ownEventIds = new Set(ownEvents.map((e) => e.id));
  const relatedEvents = relatedEventsRaw.filter((e) => !ownEventIds.has(e.id));

  type LinkRow = { type: string; href: string; label: string; icon: React.ReactNode };
  const communityLinks: LinkRow[] = [];
  if (community.website) communityLinks.push({ type: "website", href: community.website, label: getLinkLabel("website"), icon: <Globe className="h-4 w-4" /> });
  if (community.facebook_page) communityLinks.push({ type: "facebook_page", href: community.facebook_page, label: getLinkLabel("facebook_page"), icon: <FacebookIcon /> });
  if (community.facebook_group) communityLinks.push({ type: "facebook_group", href: community.facebook_group, label: getLinkLabel("facebook_group"), icon: <FacebookIcon /> });
  if (community.telegram_group && !isPrivateGroupInvite(community.telegram_group)) communityLinks.push({ type: "telegram_group", href: community.telegram_group, label: getLinkLabel("telegram_group"), icon: <MessageCircle className="h-4 w-4" /> });
  if (community.telegram_channel && !isPrivateGroupInvite(community.telegram_channel)) communityLinks.push({ type: "telegram_channel", href: community.telegram_channel, label: getLinkLabel("telegram_channel"), icon: <MessageCircle className="h-4 w-4" /> });
  if (community.whatsapp_channel && !isPrivateGroupInvite(community.whatsapp_channel)) communityLinks.push({ type: "whatsapp_channel", href: community.whatsapp_channel, label: getLinkLabel("whatsapp_channel"), icon: <MessageCircle className="h-4 w-4" /> });
  if (community.instagram) communityLinks.push({ type: "instagram", href: community.instagram, label: getLinkLabel("instagram"), icon: <Instagram className="h-4 w-4" /> });
  if (community.youtube) communityLinks.push({ type: "youtube", href: community.youtube, label: getLinkLabel("youtube"), icon: <Youtube className="h-4 w-4" /> });
  if (community.calendar) communityLinks.push({ type: "calendar", href: community.calendar, label: getLinkLabel("calendar"), icon: <CalendarDays className="h-4 w-4" /> });
  if (community.newsletter) communityLinks.push({ type: "newsletter", href: community.newsletter, label: getLinkLabel("newsletter"), icon: <Send className="h-4 w-4" /> });
  if (community.other_resource) communityLinks.push({
    type: "other",
    href: community.other_resource,
    label: isMessengerUrl(community.other_resource) ? "Messenger Group" : isLineUrl(community.other_resource) ? "LINE Group" : "Other Resource",
    icon: isMessengerUrl(community.other_resource) ? <MessengerIcon /> : isLineUrl(community.other_resource) ? <LineIcon /> : <ExternalLink className="h-4 w-4" />,
  });
  communityLinks.sort((a, b) => linkSortKey(a.type) - linkSortKey(b.type));

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-8 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <EntityBreadcrumb
          country={countryLink}
          currentLabel={community.name}
          currentUrl={`${SITE_URL}/communities/${community.slug}`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <BackButton />
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_25px_90px_rgba(105,73,22,0.12)]">
          <div className="border-b border-(--color-sand-strong) px-6 py-10 sm:px-8">
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden="true">
                  {getCountryFlag(community.country ?? "")}
                </span>
                <p className="text-sm font-semibold uppercase tracking-widest text-(--color-pine)">
                  {community.city}{community.city && community.country && ", "}{getCountryLabel(community.country ?? "")}
                  {community.region ? ` · ${community.region}` : ""}
                </p>
              </div>
              <div className="space-y-3">
                <h1 className="font-serif text-4xl leading-tight tracking-tight text-slate-950 sm:text-5xl">
                  {community.name}
                </h1>
                <div className="flex flex-wrap gap-2">
                  {community.type && (
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                      {community.type}
                    </Badge>
                  )}
                  {community.activity_level && (
                    <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100">
                      {community.activity_level}
                    </Badge>
                  )}
                  {community.verified && (
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100">
                      Verified
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.4fr_0.8fr]">
            <div className="space-y-10">
              {community.description && (
                <section className="space-y-4">
                  <h2 className="font-serif text-2xl text-slate-950">About the community</h2>
                  <p className="whitespace-pre-line text-lg leading-8 text-slate-700">
                    {community.description}
                  </p>
                </section>
              )}

              <section className="grid gap-6 sm:grid-cols-2">
                {community.focus && community.focus.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-500">
                      <Target className="h-4 w-4" /> Focus Areas
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {community.focus.map((f) => (
                        <span key={f} className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {community.languages && community.languages.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-500">
                      <Languages className="h-4 w-4" /> Languages
                    </h3>
                    <p className="text-slate-700">{community.languages.join(", ")}</p>
                  </div>
                )}
                {community.audience_size && (
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-500">
                      <Users className="h-4 w-4" /> Community size estimate
                    </h3>
                    <p className="text-slate-700">~{community.audience_size} members</p>
                  </div>
                )}
              </section>

              {community.lat && community.lng && (
                <section className="space-y-4">
                  <h2 className="font-serif text-2xl text-slate-950">Location</h2>
                  <VenueMap lat={community.lat} lng={community.lng} name={community.name} />
                </section>
              )}

              {community.associatedPeople.length > 0 && (
                <section className="space-y-3">
                  <h2 className="font-serif text-2xl text-slate-950">People</h2>
                  <div className="divide-y divide-(--color-sand-strong) overflow-hidden rounded-xl border border-(--color-sand-strong) bg-white">
                    <ExpandableList
                      itemLabel="people"
                      initialCount={7}
                      items={community.associatedPeople.map((person) => (
                        <CompactTeacherRow key={person.slug} teacher={person} />
                      ))}
                    />
                  </div>
                </section>
              )}

              {community.associatedVenues.length > 0 && (
                <section className="space-y-3">
                  <h2 className="font-serif text-2xl text-slate-950">Venues</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {community.associatedVenues.map((venue) => (
                      <VenueCard key={venue.slug} venue={venue} />
                    ))}
                  </div>
                </section>
              )}

              {(ownEvents.length > 0 || relatedEvents.length > 0) && (
                <section className="space-y-8">
                  <h2 className="font-serif text-3xl text-slate-950">Events</h2>

                  {ownEvents.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                        Organized by {community.name}
                      </h3>
                      <div className="grid gap-4">
                        {ownEvents.map((event) => (
                          <EventListItem key={event.id} event={event} />
                        ))}
                      </div>
                    </div>
                  )}

                  {relatedEvents.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                        Also happening in {getCountryLabelWithArticle(community.country ?? "")}
                      </h3>
                      <div className="grid gap-4">
                        {relatedEvents.map((event) => (
                          <EventListItem key={event.id} event={event} />
                        ))}
                      </div>
                      {relatedEvents.length >= COMMUNITY_RELATED_EVENTS_LIMIT && community.country && (
                        <Link
                          href={`/?country=${community.country}`}
                          className="group flex items-center gap-2 text-sm font-semibold text-(--color-pine) hover:underline"
                        >
                          See all upcoming events in {getCountryLabelWithArticle(community.country)}
                          <ArrowLeft className="h-4 w-4 rotate-180 transition-transform group-hover:translate-x-1" />
                        </Link>
                      )}
                    </div>
                  )}
                </section>
              )}
            </div>

            <aside className="space-y-6">
              <section className="rounded-[1.75rem] border border-(--color-sand-strong) bg-(--color-mist) p-6">
                <h2 className="font-serif text-2xl text-slate-950">Links & Resources</h2>
                <div className="mt-5 flex flex-col gap-3">
                  {communityLinks.length > 0
                    ? communityLinks.map((row, i) => (
                        <SocialLink key={i} href={row.href} icon={row.icon} label={row.label} />
                      ))
                    : <p className="text-sm text-slate-500 italic">No links available.</p>
                  }
                </div>
              </section>

              {community.has_invites && (
                <section id="invite" className="scroll-mt-6 rounded-[1.75rem] border border-(--color-pine)/20 bg-(--color-pine)/5 p-6">
                  <h2 className="font-serif text-xl text-slate-950">Join this community</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {hasPublishedInvites
                      ? "Invite links to chat groups are shared here after a quick verification to reduce spam."
                      : "This community coordinates in a private group. Join our Telegram group and we'll help you connect."}
                  </p>
                  <div className="mt-4">
                    <InviteButtons communityId={community.id} platforms={publishedInvitePlatforms} />
                  </div>
                </section>
              )}
            </aside>
          </div>
        </section>
        <div className="text-center text-sm text-slate-400">
          <ReportButton
            entity_type="community"
            entity_id={community.id}
            entity_title={community.name}
            entity_slug={community.slug}
          />
        </div>
        <AlsoBrowse basePath="/communities" items={ringNeighbors} />
      </div>
    </main>
  );
}

function EventListItem({ event }: { event: EventListItemType }) {
  return (
    <Link
      href={getEventHref(event)}
      className="group flex flex-col justify-between gap-4 rounded-2xl border border-(--color-sand-strong) bg-white p-5 transition hover:border-violet-300 hover:shadow-md sm:flex-row sm:items-center"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="bg-violet-50 text-xs font-semibold uppercase tracking-wider text-violet-700"
          >
            {getTypeLabel(event.type)}
          </Badge>
          <span className="text-xs text-slate-500">{getCountryFlag(event.country)}</span>
        </div>
        <h4 className="font-serif text-xl font-bold text-slate-950 group-hover:text-violet-700 transition">
          {event.title}
        </h4>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          <p className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatEventDateRange(event)}
          </p>
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {getEventLocation(event)}
          </p>
        </div>
      </div>
      <div className="text-violet-600 opacity-0 transition group-hover:opacity-100 sm:block hidden">
        <ArrowLeft className="h-5 w-5 rotate-180" />
      </div>
    </Link>
  );
}

function SocialLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-between rounded-xl border border-(--color-sand-strong) bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:border-(--color-pine) hover:text-(--color-pine)"
    >
      <span className="flex items-center gap-3">
        <span className="text-(--color-pine)">{icon}</span>
        <span className="capitalize">{label}</span>
      </span>
      <ExternalLink className="h-4 w-4 opacity-30" />
    </a>
  );
}

function FacebookIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function MessengerIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.093 0 11.552c0 3.686 1.745 6.972 4.472 9.12V24l4.086-2.242c1.09.301 2.246.464 3.442.464 6.627 0 12-5.093 12-11.552C24 5.093 18.627 0 12 0Zm1.191 15.527-3.055-3.26-5.963 3.26L10.732 9l3.131 3.259L19.752 9l-6.561 6.527Z" />
    </svg>
  );
}

function LineIcon() {
  // LINE app logo mark, from Simple Icons (CC0), fill swapped to currentColor.
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
    </svg>
  );
}
