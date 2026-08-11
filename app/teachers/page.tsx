import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE_URL, SITE_OG_IMAGE } from "@/lib/site";
import { getAllPublicTeachersForIndex } from "@/lib/teachers";
import { getCountryLabel } from "@/lib/event-display";
import { EntityIndex } from "@/components/entity-index";

const TITLE = "Teachers — CI Treasure Hunt";
const DESCRIPTION =
  "A searchable directory of Contact Improvisation teachers is coming soon. Every teacher already has a live profile page, linked from their event listings.";

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
  const teachers = await getAllPublicTeachersForIndex();

  return (
    <main className="min-h-screen bg-(--color-mist) px-5 py-8 text-slate-900 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" className="border-(--color-sand-strong) bg-white/80">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to calendar
            </Link>
          </Button>
        </div>

        <div className="space-y-4">
          <h1 className="font-serif text-4xl tracking-tight text-slate-950 sm:text-5xl">
            Teachers
          </h1>
          <p className="text-lg text-slate-600">
            A searchable teacher directory is coming soon. In the meantime, every teacher already
            has their own profile page, listing their bio, location, and links, linked from the
            events they&apos;re teaching. Browse the calendar and follow a teacher&apos;s name from any
            event to find them.
          </p>
        </div>

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
