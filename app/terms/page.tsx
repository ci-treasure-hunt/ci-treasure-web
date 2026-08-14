import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - CI Treasure Hunt",
  description:
    "The terms of service governing use of CI Treasure Hunt, a directory of Contact Improvisation events, teachers, communities, and venues worldwide.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-14 sm:px-8">
      <h1 className="font-serif text-4xl text-slate-950">Terms of Service</h1>
      <div className="mt-8 space-y-6 text-base leading-8 text-slate-700">
        <p className="text-sm text-slate-500">Last updated: August 2026</p>
        <section>
          <h2 className="font-semibold text-slate-950">1. Scope</h2>
          <p>
            These terms govern use of the CI Treasure Hunt website (citreasurehunt.com). By using the site you
            accept these terms.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">2. Nature of the service</h2>
          <p>
            CI Treasure Hunt is a free, non-commercial directory of contact improvisation events and communities.
            Event listings link to external organizer pages. Registration, ticketing, and participation are handled
            entirely by the respective organizers. We are not a party to any transaction between users and organizers.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">3. Accuracy of listings</h2>
          <p>
            Listings are compiled from public sources. While we aim for accuracy, we cannot guarantee that event
            information is complete, correct, or current at all times. Always verify details directly with the
            organizer before making travel or registration decisions. We accept no liability for cancelled, changed,
            or incorrectly listed events.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">4. External links</h2>
          <p>
            This website contains links to third-party sites. CI Treasure Hunt is not responsible for the content,
            availability, or privacy practices of those sites.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">5. Acceptable use</h2>
          <p>
            You may not use automated means like scraping, crawling, bulk downloading, or similar to systematically
            extract or reproduce a substantial portion of the data on this site or its underlying systems, without
            our prior written permission. This does not apply to standard search-engine and content-preview
            crawlers that respect robots.txt. Individual listings may of course be shared, linked to, or referenced
            normally. You may not submit false or misleading information, or attempt to disrupt the service.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">6. Accounts and submissions</h2>
          <p>
            Organizers may create an account (by email magic link) to claim a profile and submit or edit their own
            event listings. You are responsible for activity under your account and for keeping your email access
            secure. You may only submit content you have the right to publish, and it must be accurate and not
            misleading. Submitted events are reviewed before publication unless your account is marked trusted; we
            may edit, decline, unpublish, or remove any listing at our discretion, for example if it is
            inaccurate, off-topic, or violates these terms. Claiming a profile that is not yours is not permitted.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">7. Content you submit</h2>
          <p>
            You keep ownership of anything you submit. By submitting content, such as event details, descriptions,
            images and links, you grant us a non-exclusive, worldwide, royalty-free licence to store, display,
            reproduce and adapt it for the purpose of running this directory. Adapting means things like resizing or
            cropping an image so that it displays correctly on different devices.
          </p>
          <p className="mt-2">
            This licence also covers announcing your listing in our own channels. When an event is published it is
            posted automatically to our Telegram channel and group, including its image and the people credited on
            it.
          </p>
          <p className="mt-2">
            You confirm that you hold the rights to the content you submit, including photographs, and that
            publishing it here does not infringe anyone else&apos;s rights. Past events stay online as an archive
            rather than being deleted, so this licence lasts for as long as the listing remains on the site. You can
            ask us to remove a listing at any time.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">8. Changes</h2>
          <p>
            We may update these terms when new features are added. Continued use of the site after changes constitutes
            acceptance of the updated terms.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">9. Governing law</h2>
          <p>These terms are governed by the laws of the Federal Republic of Germany.</p>
        </section>
      </div>
    </main>
  );
}
