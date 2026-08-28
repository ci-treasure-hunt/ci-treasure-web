import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  Facebook,
  Globe,
  Instagram,
  MapPin,
  MessageSquare,
  Send,
  Youtube,
} from "lucide-react";

import Link from "next/link";
import {
  getTeacherBySlug,
  getTeacherEvents,
  getAllPublicTeacherSlugs,
  resolveTeacherSlugRedirect,
  getProfileAssociations,
  getTeacherRingNeighbors,
  deriveRoles,
} from "@/lib/teachers";
import { ReportButton } from "@/components/report-button";
import BackButton from "@/components/back-button";
import { EntityBreadcrumb } from "@/components/entity-breadcrumb";
import { RingSection } from "@/components/also-browse";
import { CommunitySpotlightCard, VenueCard } from "@/components/entity-cards";
import { CompactTeacherRow } from "@/components/compact-entity-row";
import { SocialLink } from "@/components/social-link";
import { RevealEmail } from "@/components/reveal-email";
import { EntityEventCard } from "@/components/entity-event-card";
import { EntityImage } from "@/components/entity-image";
import { getLinkLabel, linkSortKey } from "@/lib/events";
import { GENERIC_ACCENT_GRADIENT, getCountryLabel, padShortDescription } from "@/lib/event-display";
import { PracticeBadge, practicesToDisplay } from "@/components/shared/practice-badge";
import { getCountryPageLink } from "@/lib/country-pages";
import { getCountryFlag } from "@/lib/utils";
import { SITE_URL, SITE_OG_IMAGE, buildEntityTitle } from "@/lib/site";
import { ogImage } from "@/lib/og-image";
import { getContinent } from "@/lib/entity-continents";
import { ringSectionHeading } from "@/lib/entity-ring";

export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = await getAllPublicTeacherSlugs();
  return slugs.map((slug) => ({
    slug,
  }));
}

type TeacherPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: TeacherPageProps): Promise<Metadata> {
  const { slug } = await params;
  const teacher = await getTeacherBySlug(slug);
  if (!teacher) return {};

  const description = teacher.bio
    ? padShortDescription(teacher.bio, "teachers")
    : (teacher.city
        ? `${teacher.name} is a Contact Improvisation teacher based in ${teacher.city}, listed on CI Treasure Hunt, the global directory of CI teachers, events, and communities.`
        : `${teacher.name} is a Contact Improvisation teacher listed on CI Treasure Hunt, the global directory of CI teachers, events, and communities.`
      ).slice(0, 160);

  const approvedImage = teacher.image_status === "approved" ? teacher.image_url : null;

  return {
    title: buildEntityTitle(teacher.name),
    description,
    alternates: {
      canonical: `${SITE_URL}/teachers/${teacher.slug}`,
    },
    openGraph: {
      title: teacher.name,
      description,
      url: `${SITE_URL}/teachers/${teacher.slug}`,
      siteName: "CI Treasure Hunt",
      type: "profile",
      images: [await ogImage(approvedImage)],
    },
    twitter: {
      card: "summary_large_image",
      title: teacher.name,
      description,
      images: [approvedImage ?? SITE_OG_IMAGE],
    },
  };
}

export default async function TeacherPage({ params }: TeacherPageProps) {
  const { slug } = await params;
  const teacher = await getTeacherBySlug(slug);

  if (!teacher) {
    // I-117: the slug may be a superseded one (e.g. a name correction) — redirect to the
    // current slug rather than 404ing on what used to be a valid, possibly externally-linked URL.
    const currentSlug = await resolveTeacherSlugRedirect(slug);
    if (currentSlug) {
      permanentRedirect(`/teachers/${currentSlug}`);
    }
    notFound();
  }

  const [{ upcoming, past }, countryLink, associations, ring] = await Promise.all([
    getTeacherEvents(teacher.id),
    getCountryPageLink(teacher.country),
    getProfileAssociations(teacher.id),
    getTeacherRingNeighbors(teacher.slug, teacher.country),
  ]);
  const ringHeading = ringSectionHeading(
    "teachers",
    ring.tier,
    teacher.country ? getCountryLabel(teacher.country) : null,
    getContinent(teacher.country),
  );
  const allEvents = [...upcoming, ...past];

  // Derive roles from both stored flags and linked events (I-115). Shared with the /teachers
  // list's getListedPeople() via deriveRoles() so the two pages can't disagree on someone's role
  // again — see the comment on deriveRoles for the bug this fixed (I-074 follow-up, 2026-08-14).
  const { isTeacher: derivedIsTeacher, isMusician: derivedIsMusician, isOrganizer: derivedIsOrganizer } = deriveRoles(
    teacher,
    {
      hasTeacherCredit: allEvents.some(e => e.teacher_id === teacher.id && e.role !== 'musician'),
      hasMusicianCredit: allEvents.some(e => e.teacher_id === teacher.id && e.role === 'musician'),
      hasOrganizerCredit: allEvents.some(e => e.organizer_id === teacher.id),
    },
  );

  const ensureHttps = (url: string) => url.startsWith("http") ? url : `https://${url}`;
  type LinkRow = { type: string; href: string; label: string; icon: React.ReactNode };
  const teacherLinks: LinkRow[] = [];
  if (teacher.website) teacherLinks.push({ type: "website", href: ensureHttps(teacher.website), label: getLinkLabel("website"), icon: <Globe className="h-4 w-4" /> });
  if (teacher.facebook) teacherLinks.push({ type: "facebook", href: ensureHttps(teacher.facebook), label: getLinkLabel("facebook"), icon: <Facebook className="h-4 w-4" /> });
  if (teacher.instagram) teacherLinks.push({ type: "instagram", href: ensureHttps(teacher.instagram.replace(/^@/, "https://instagram.com/")), label: getLinkLabel("instagram"), icon: <Instagram className="h-4 w-4" /> });
  if (teacher.youtube) teacherLinks.push({ type: "youtube", href: ensureHttps(teacher.youtube), label: getLinkLabel("youtube"), icon: <Youtube className="h-4 w-4" /> });
  if (teacher.telegram) teacherLinks.push({ type: "telegram", href: teacher.telegram.startsWith("http") ? teacher.telegram : `https://t.me/${teacher.telegram.replace(/^@/, "")}`, label: getLinkLabel("telegram"), icon: <Send className="h-4 w-4" /> });
  if (teacher.newsletter) teacherLinks.push({ type: "newsletter", href: ensureHttps(teacher.newsletter), label: getLinkLabel("newsletter"), icon: <MessageSquare className="h-4 w-4" /> });
  teacherLinks.sort((a, b) => linkSortKey(a.type) - linkSortKey(b.type));

  const approvedImage = teacher.image_status === "approved" ? teacher.image_url : null;
  const sameAs = teacherLinks
    .filter((row) => ["facebook", "instagram", "youtube", "telegram"].includes(row.type))
    .map((row) => row.href);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: teacher.name,
    image: approvedImage ?? undefined,
    description: teacher.bio ?? undefined,
    url: `${SITE_URL}/teachers/${teacher.slug}`,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    address:
      teacher.city || teacher.country
        ? {
            "@type": "PostalAddress",
            addressLocality: teacher.city ?? undefined,
            addressCountry: teacher.country ?? undefined,
          }
        : undefined,
  };

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-8 text-slate-900 sm:px-8 lg:px-10">
      <script
        type="application/ld+json"
        // teacher.bio/name are profile-owner-controlled free text — escape "<" so a
        // value containing "</script>" can't break out of this tag (same pattern as
        // the event page's JSON-LD).
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <EntityBreadcrumb
          country={countryLink}
          currentLabel={teacher.name}
          currentUrl={`${SITE_URL}/teachers/${teacher.slug}`}
        />
        <div>
          <BackButton />
        </div>
        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_25px_90px_rgba(105,73,22,0.12)]">
          <div className={`flex min-h-52 flex-col justify-end border-b border-(--color-sand-strong) ${GENERIC_ACCENT_GRADIENT} px-6 py-8 sm:px-8`}>
            <div className="max-w-3xl space-y-3">
              {/* Same grammar as the event header (2026-07-25): frosted practice pills first
                  (scope/modality), then the solid "identity" pill(s) — here the role, the teacher's
                  type-equivalent (what kind of profile this is). Lone CI is suppressed via
                  practicesToDisplay (same rule as events), so a plain CI teacher shows just the solid
                  role pill(s); only a distinctive practice (BMC, Axis) surfaces as a frosted pill. */}
              {practicesToDisplay(teacher.discipline).length ? (
                <div className="flex flex-wrap gap-2">
                  {practicesToDisplay(teacher.discipline).map((d) => (
                    <PracticeBadge key={d} discipline={d} />
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {derivedIsTeacher && <RoleBadge>Teacher</RoleBadge>}
                {derivedIsOrganizer && <RoleBadge>Organizer</RoleBadge>}
                {derivedIsMusician && <RoleBadge>Musician</RoleBadge>}
              </div>
              <h1 className="font-serif text-4xl leading-tight tracking-tight text-white sm:text-5xl">
                {teacher.name}
              </h1>
              <p className={`flex items-center gap-2 text-white/90 ${teacher.city || teacher.country || teacher.is_nomadic ? "" : "invisible"}`}>
                {teacher.is_nomadic ? (
                  <>
                    <Globe className="h-4 w-4 shrink-0 text-white/70" />
                    <span>Nomadic</span>
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4 shrink-0 text-white/70" />
                    {teacher.country ? (
                      <span className="leading-none" title={getCountryLabel(teacher.country)}>
                        {getCountryFlag(teacher.country)}
                      </span>
                    ) : null}
                    <span>
                      {teacher.city}{teacher.city && teacher.country ? ", " : ""}{teacher.country ? getCountryLabel(teacher.country) : ""}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.4fr_0.8fr]">
            <div className="space-y-8">
              {teacher.image_url && teacher.image_status === "approved" && (
                <EntityImage src={teacher.image_url} alt={teacher.name} credit={teacher.image_credit} />
              )}

              {teacher.bio ? (
                <section className="space-y-3">
                  <h2 className="font-serif text-2xl text-slate-950">About</h2>
                  <p className="whitespace-pre-line text-base leading-8 text-slate-700">
                    {teacher.bio}
                  </p>
                </section>
              ) : null}

              {associations.communities.length > 0 && (
                <section className="space-y-3">
                  <h2 className="font-serif text-2xl text-slate-950">Community</h2>
                  <div className="space-y-3">
                    {associations.communities.map((c) => (
                      <CommunitySpotlightCard key={c.slug} community={c} />
                    ))}
                  </div>
                </section>
              )}

              {associations.venues.length > 0 && (
                <section className="space-y-3">
                  <h2 className="font-serif text-2xl text-slate-950">Venue</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {associations.venues.map((v) => (
                      <VenueCard key={v.slug} venue={v} roleLabel={v.role} />
                    ))}
                  </div>
                </section>
              )}

              <section className="space-y-6">
                <h2 className="font-serif text-2xl text-slate-950">Events</h2>

                <div className="space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                      Upcoming Events
                    </h3>
                    {upcoming.length > 0 ? (
                      <div className="grid gap-4">
                        {upcoming.map((event) => (
                          <EntityEventCard key={event.id} event={event} />
                        ))}
                      </div>
                    ) : (
                      <p className="italic text-slate-500">No upcoming events scheduled.</p>
                    )}
                  </div>

                  {past.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer list-none space-y-4">
                        <div className="flex items-center justify-between border-t border-(--color-sand-strong) pt-6">
                          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                            Past Events ({past.length})
                          </h3>
                          <span className="text-sm font-medium text-violet-600 group-open:hidden">
                            Show past events
                          </span>
                          <span className="hidden text-sm font-medium text-violet-600 group-open:block">
                            Hide past events
                          </span>
                        </div>
                      </summary>
                      <div className="mt-4 grid gap-4">
                        {past.map((event) => (
                          <EntityEventCard key={event.id} event={event} />
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </section>

              {ring.items.length > 0 && (
                <RingSection heading={ringHeading}>
                  <div className="divide-y divide-(--color-sand-strong) overflow-hidden rounded-xl border border-(--color-sand-strong) bg-white">
                    {ring.items.map((t) => (
                      <CompactTeacherRow key={t.slug} teacher={{ ...t, bio: null }} />
                    ))}
                  </div>
                </RingSection>
              )}
            </div>

            <aside className="space-y-6">
              {teacherLinks.length > 0 && (
                <section className="rounded-[1.75rem] border border-(--color-sand-strong) bg-(--color-mist) p-6">
                  <h2 className="font-serif text-2xl text-slate-950">Links</h2>
                  <div className="mt-4 flex flex-col gap-3">
                    {teacherLinks.map((row, i) => (
                      <SocialLink key={i} href={row.href} icon={row.icon} label={row.label} />
                    ))}
                    {teacher.public_email && (
                      <RevealEmail entityType="profile" entityId={teacher.id} />
                    )}
                  </div>
                </section>
              )}

              {/* Professional Background (year_starting_practice, year_starting_teaching, significant_teachers) — hidden for now; re-enable when data is more complete */}
            </aside>
          </div>
        </section>
        <div className="text-center text-sm text-slate-400">
          <ClaimCta teacher={teacher} />
          {teacher.user_id ? null : <>{" "}·{" "}</>}
          <ReportButton
            entity_type="profile"
            entity_id={teacher.id}
            entity_title={teacher.name}
            entity_slug={teacher.slug}
          />
        </div>
      </div>
    </main>
  );
}

// Three states (not two) — mirrors submit_profile_claim's own rules so the UI never
// lets someone hit the RPC's "already pending" rejection.
function ClaimCta({ teacher }: { teacher: { id: string; user_id: string | null; claim_pending_user_id: string | null } }) {
  if (teacher.user_id) {
    return null;
  }
  if (teacher.claim_pending_user_id) {
    return <span>Claim pending review</span>;
  }
  const next = `/dashboard/claim?profile=${teacher.id}`;
  return (
    <span>
      Is this your profile?{" "}
      <Link href={`/auth?next=${encodeURIComponent(next)}`} className="font-semibold text-(--color-pine) underline">
        Claim this profile
      </Link>
    </span>
  );
}

// Solid-white "identity" pill — the teacher's role is the type-equivalent (what kind of profile
// this is), so it gets the same solid treatment as the event header's type pill, distinguishing it
// from the frosted practice pills above it. Same sizing as PracticeBadge so all header pills match.
function RoleBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-bold uppercase tracking-wider text-(--color-pine)">
      {children}
    </span>
  );
}
