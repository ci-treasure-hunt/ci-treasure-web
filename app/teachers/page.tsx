import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE_URL, SITE_OG_IMAGE } from "@/lib/site";

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

export default function TeachersPage() {
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
            events they're teaching. Browse the calendar and follow a teacher's name from any
            event to find them.
          </p>
        </div>
      </div>
    </main>
  );
}
