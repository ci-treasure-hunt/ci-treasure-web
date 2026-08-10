import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — CI Treasure Hunt",
  description:
    "How CI Treasure Hunt collects, uses, and protects your data, including account information, cookies, and third-party services used on the site.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-14 sm:px-8">
      <h1 className="font-serif text-4xl text-slate-950">Privacy Policy</h1>
      <div className="mt-8 space-y-6 text-base leading-8 text-slate-700">
        <p className="text-sm text-slate-500">Last updated: July 2026</p>
        <section>
          <h2 className="font-semibold text-slate-950">1. Controller</h2>
          <p>
            Jan Auras
            <br />
            Lenbachstr. 17
            <br />
            10115 Berlin
            <br />
            Germany
            <br />
            Email:{" "}
            <a href="mailto:hello@citreasurehunt.com" className="underline">
              hello@citreasurehunt.com
            </a>
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">2. What this site does</h2>
          <p>
            CI Treasure Hunt is a non-commercial public directory of contact improvisation events and communities
            worldwide. We do not sell tickets, process payments, or organize events. We link to external organizer
            pages.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">3. Hosting and server logs</h2>
          <p>
            This website is hosted by Vercel Inc. When you visit, technical data including IP address, browser type,
            requested pages, and access time may be logged by Vercel for security and stability purposes. We do not
            use these logs for profiling or tracking. See{" "}
            <a
              href="https://vercel.com/legal/privacy-notice"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Vercel&apos;s privacy policy
            </a>{" "}
            for details. Legal basis: Art. 6(1)(f) GDPR - legitimate interest in operating a stable website.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">4. Analytics</h2>
          <p>
            This website uses Vercel Web Analytics (aggregate traffic: page views, referrers, top pages) and Vercel
            Speed Insights (Core Web Vitals: loading speed, layout stability, interactivity). Both tools are designed
            to be privacy-friendly: they do not use cookies or persistent identifiers and do not track visitors across
            sites. A short-lived hash derived from the visitor&apos;s IP address and user agent is used for unique
            visitor counting and is not stored. All data is aggregate only. It is processed by Vercel Inc. (US) under
            Standard Contractual Clauses. Legal basis:{" "}
            Art.&nbsp;6(1)(f) GDPR — legitimate interest in understanding how the site is used and performs so we can improve it.
          </p>
          <p>
            This website also uses Umami, a self-hosted, privacy-focused analytics tool (aggregate traffic: page
            views, referrers, visit duration). Like the tools above, Umami does not use cookies or persistent
            identifiers and does not track visitors across sites. Unlike Vercel&apos;s tools, Umami is self-hosted by
            us rather than run by a third-party processor, though no personally identifiable information is
            collected either way. Legal basis: Art.&nbsp;6(1)(f) GDPR, legitimate interest in understanding how the
            site is used and performs so we can improve it.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">5. Event data</h2>
          <p>
            Event listings are stored in a database provided by Supabase Inc. (US). This data is publicly displayed
            on the site. It consists of event details compiled from public sources and does not include personal data
            beyond organizer names and contact links that are already publicly available. Data transfers to Supabase
            are governed by Standard Contractual Clauses (SCCs) under Art.&nbsp;46(2)(c) GDPR. See{" "}
            <a href="https://supabase.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">
              Supabase&apos;s privacy policy
            </a>{" "}
            for details.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">6. Newsletter</h2>
          <p>
            The newsletter signup form is embedded directly on this site and is provided by EmailOctopus
            (EmailOctopus Limited, UK). When you subscribe, your name and email address are transmitted to and stored
            by EmailOctopus. Their{" "}
            <a
              href="https://emailoctopus.com/legal/privacy"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              privacy policy
            </a>{" "}
            governs that data. We do not store your email address on our own systems. Legal basis: Art. 6(1)(a) GDPR
            — your consent at the time of signup. You can unsubscribe at any time via the link in any newsletter
            email.
          </p>
          <p className="mt-2">
            The signup form uses Google reCAPTCHA to prevent automated spam submissions. When the form loads, Google
            reCAPTCHA collects hardware and software information (including device and application data) and sends it
            to Google Inc. (US). This processing serves our legitimate interest in keeping the mailing list free from
            bots. Legal basis: Art. 6(1)(f) GDPR. See{" "}
            <a
              href="https://policies.google.com/privacy"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google&apos;s privacy policy
            </a>{" "}
            and{" "}
            <a
              href="https://policies.google.com/terms"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              terms of service
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">7. Feedback form</h2>
          <p>
            The feedback form at /feedback is provided by Tally (Tally Solutions BV, Belgium) and is embedded via
            iframe. If you submit a response, the data you enter is received by Tally and forwarded to us. We use
            this data solely to improve the site and do not share it. Tally&apos;s{" "}
            <a
              href="https://tally.so/help/privacy-policy"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              privacy policy
            </a>{" "}
            governs Tally&apos;s own processing. Legal basis: Art. 6(1)(f) GDPR — legitimate interest in improving
            the service.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">9. Your rights</h2>
          <p>
            Under the GDPR you have the right to access, correct, or delete personal data we hold about you, to
            restrict or object to processing, and to data portability where applicable. To exercise these rights,
            contact us at hello@citreasurehunt.com.
          </p>
          <p className="mt-2">
            You also have the right to lodge a complaint with the supervisory authority responsible for Berlin:{" "}
            <a
              href="https://www.datenschutz-berlin.de"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Berliner Beauftragte für Datenschutz und Informationsfreiheit
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">8. Event reports</h2>
          <p>
            When you submit a report via the report form on event, venue, or teacher pages, a daily-rotating hash
            of your IP address is stored to prevent abuse. This hash cannot be used to identify you and is not
            shared with third parties. Legal basis: Art. 6(1)(f) GDPR — legitimate interest in preventing spam
            and abuse.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">10. Accounts and login</h2>
          <p>
            If you create an account to manage your events, we use Supabase Auth (Supabase Inc., US) to sign you
            in by magic link. We store your email address and an internal user identifier, and set a session
            cookie so you stay signed in. We do not use passwords — sign-in is by emailed link only. The session
            cookie is strictly necessary for login and is not used for tracking or profiling. Legal basis:
            Art.&nbsp;6(1)(b) GDPR — processing necessary to provide the account and organizer tools you request.
            Data transfers to Supabase are governed by Standard Contractual Clauses (SCCs) under
            Art.&nbsp;46(2)(c) GDPR. See{" "}
            <a href="https://supabase.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">
              Supabase&apos;s privacy policy
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">11. Transactional email (magic links &amp; notifications)</h2>
          <p>
            Emails such as your sign-in magic link, and notifications about your event submissions or profile
            claims, are delivered through Resend (Resend, Inc., US). Resend receives your email address and the
            message content in order to send these emails. We have configured Resend&apos;s EU sending region
            (Ireland, <span className="font-mono text-sm">eu-west-1</span>), so message delivery is processed
            within the EU; because Resend is a US-incorporated company, however, its staff may access data from
            the US, so transfers are governed by Standard Contractual Clauses (SCCs) under Art.&nbsp;46(2)(c)
            GDPR. Legal basis: Art.&nbsp;6(1)(b) GDPR for login emails (necessary to provide the account), and
            Art.&nbsp;6(1)(f) GDPR — legitimate interest in operating the organizer tools — for related
            notifications. See{" "}
            <a href="https://resend.com/legal/privacy-policy" className="underline" target="_blank" rel="noopener noreferrer">
              Resend&apos;s privacy policy
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">12. Community invite links</h2>
          <p>
            Some community pages hide their private Telegram/WhatsApp/Signal/LINE group link behind a
            &quot;Request access&quot; button, to keep it from being scraped. Before revealing the link, we run a
            Cloudflare Turnstile check: Turnstile collects technical data (such as browser and device signals,
            including your IP address) and sends it to Cloudflare, Inc. (US) to verify you&apos;re not a bot. We
            also store a daily-rotating hash of your IP address ourselves to rate-limit repeated requests; like the
            report-form hash in section 8, this cannot be used to identify you. Legal basis: Art. 6(1)(f) GDPR —
            legitimate interest in preventing these links from being scraped and spammed. See{" "}
            <a
              href="https://www.cloudflare.com/privacypolicy/"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Cloudflare&apos;s privacy policy
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">13. Profile photos</h2>
          <p>
            If you upload a profile photo, it is stored in our Supabase Storage (Supabase Inc., US) and is not
            publicly visible until we&apos;ve reviewed and approved it. Approved photos are shown publicly on your
            teacher/organizer profile page, together with a photo credit if you provide one. You can replace or
            remove your photo at any time from your dashboard; a new upload is reviewed again before going live.
            Legal basis: Art.&nbsp;6(1)(a) GDPR — your consent, given by choosing to upload a photo. Data transfers
            to Supabase are governed by Standard Contractual Clauses (SCCs) under Art.&nbsp;46(2)(c) GDPR. See{" "}
            <a href="https://supabase.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">
              Supabase&apos;s privacy policy
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">14. Changes to this policy</h2>
          <p>
            This policy will be updated when new features affecting data processing are added. The date at the top of
            this page reflects the most recent revision.
          </p>
        </section>
      </div>
    </main>
  );
}
