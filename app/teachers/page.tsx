import { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Globe, MapPin } from "lucide-react";
import { SITE_URL, SITE_OG_IMAGE } from "@/lib/site";
import { getAllPublicTeachersForIndex, getListedPeople } from "@/lib/teachers";
import { getCountryLabel } from "@/lib/event-display";
import { EntityIndex } from "@/components/entity-index";
import { TeachersClient } from "./teachers-client";

const TITLE = "Contact Improvisation Teachers Worldwide";
const DESCRIPTION =
  "Browse Contact Improvisation teachers, organizers and musicians worldwide. Filter by country or continent, and find who teaches the events near you.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/teachers` },
  // Previously had no page-specific metadata at all, so it inherited the homepage's title/OG
  // wholesale (Next.js doesn't deep-merge nested metadata keys) — same bug already fixed on
  // /venues and /communities (I-150).
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/teachers`,
    siteName: "CI Treasure Hunt",
    type: "website",
    images: [{ url: SITE_OG_IMAGE, width: 1280, height: 1024, type: "image/jpeg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [SITE_OG_IMAGE],
  },
};

export const revalidate = 3600;

export default async function TeachersPage() {
  const [teachers, people] = await Promise.all([
    getAllPublicTeachersForIndex(),
    getListedPeople(),
  ]);

  // Country options for the filter, built from who is actually listed rather than a static list,
  // so a country with nobody in it never appears as a dead option.
  const countryOptions = Array.from(new Set(people.map((p) => p.country).filter(Boolean) as string[]))
    .map((iso) => ({ value: iso, label: getCountryLabel(iso) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const countryCount = countryOptions.length;

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-10 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        {/* Rendered server-side, outside the Suspense boundary below, so crawlers that don't
            execute client JS still see the H1 and page content — see I-150 (Ahrefs H1 finding).
            Same header shape as /venues and /communities. */}
        <header className="mb-8">
          <h1 className="mb-3 font-serif text-3xl text-slate-900 md:text-5xl">
            Contact Improvisation Teachers Worldwide
          </h1>
          <p className="mb-6 max-w-2xl text-lg text-slate-600">
            Browse Contact Improvisation teachers, organizers and musicians around the world, most
            linked to the events they are part of. Filter by country or continent to find who
            teaches near you.
          </p>
          <div className="flex justify-start gap-8 text-sm font-medium text-slate-700">
            <span className="flex items-center gap-2">
              <Globe className="size-4 text-(--color-pine)" />
              {people.length} teachers, organizers and musicians
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="size-4 text-slate-400" />
              {countryCount} countries
            </span>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-500">
            Already listed here?{" "}
            <Link href="/dashboard/claim" className="font-medium text-(--color-pine) underline">
              Claim your profile
            </Link>{" "}
            to edit your bio, photo and links. Not listed yet?{" "}
            <Link href="/dashboard/new-profile" className="font-medium text-(--color-pine) underline">
              Add yourself
            </Link>
            .
          </p>
        </header>

        {/* Suspense is required because TeachersClient calls useSearchParams(), not for data
            loading — same constraint as /venues and /communities. The EntityIndex block below sits
            outside it deliberately: the filtered list is client-rendered, so it is the server-side
            markup crawlers actually see (I-150). */}
        <Suspense fallback={<div className="min-h-screen" />}>
          <TeachersClient people={people} countries={countryOptions} />
        </Suspense>

        <EntityIndex
          basePath="/teachers"
          label="teachers"
          items={teachers.map((t) => ({
            slug: t.slug,
            name: t.name,
            country: t.country ? getCountryLabel(t.country) : null,
          }))}
        />
      </div>
    </main>
  );
}
