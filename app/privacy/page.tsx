import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - CI Treasure Hunt",
  description:
    "How CI Treasure Hunt collects, uses, and protects your data, including account information, cookies, and third-party services used on the site.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-14 sm:px-8">
      <h1 className="font-serif text-4xl text-slate-950">Privacy Policy</h1>
      <div className="mt-8 space-y-6 text-base leading-8 text-slate-700">
        <p className="text-sm text-slate-500">Last updated: August 2026</p>
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
            Art.&nbsp;6(1)(f) GDPR: legitimate interest in understanding how the site is used and performs so we can improve it.
          </p>
          <p>
            This website also uses Umami, a privacy-focused analytics tool (aggregate traffic: page views,
            referrers, visit duration). Like the tools above, Umami does not use cookies or persistent identifiers
            and does not track visitors across sites. Unlike Vercel&apos;s own tools, we run our own Umami instance
            rather than sending data to an analytics company: it is hosted on Vercel and its data is stored in a
            Supabase project of ours in the EU (Frankfurt, eu-central-1). No personally identifiable information is
            collected either way. Legal basis: Art.&nbsp;6(1)(f) GDPR, legitimate interest in understanding how the
            site is used and performs so we can improve it.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">5. Event data</h2>
          <p>
            Event listings are stored in a database provided by Supabase Inc. (US), hosted in the EU (Frankfurt,
            eu-central-1), and are publicly displayed on the site. They consist of event details compiled from organizers&apos; own public announcements. Where an
            event credits named teachers, organizers or musicians, the personal data in those credits is covered by
            section 6 below. Data transfers to Supabase are governed by Standard Contractual Clauses (SCCs) under
            Art.&nbsp;46(2)(c) GDPR. See{" "}
            <a href="https://supabase.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">
              Supabase&apos;s privacy policy
            </a>{" "}
            for details.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">6. Teacher, organizer and musician profiles</h2>
          <p>
            Most profiles on this site are created by us, not by the person they describe. This section explains that
            processing, as required by Art.&nbsp;14 GDPR, which applies where personal data has not been obtained
            from the data subject.
          </p>
          <p className="mt-2">
            <strong className="font-semibold text-slate-950">What we store.</strong>{" "}
            Your name; the events you are
            credited on and your role in them (teacher, organizer, musician); the city and country where you are
            currently based, or a note that you travel without a fixed base; the practices you teach; a short
            biography, which in most cases is a summary we have written rather than text you wrote yourself, and
            which you can replace with your own words once you claim your profile; and
            links you publish yourself, such as your website, newsletter, or public social media profiles. We store
            an email address only where you have published one yourself for professional contact. We never source a
            photograph of a person: a profile has a photo only if you uploaded one yourself after claiming it.
          </p>
          <p className="mt-2">
            <strong className="font-semibold text-slate-950">Where it comes from.</strong>{" "}
            Publicly accessible
            sources only. In most cases this is the event organizer&apos;s own public page or announcement crediting
            who is teaching, together with your own public website or social media profile linked from it. We do not
            buy personal data, and we do not take it from private or closed groups.
          </p>
          <p className="mt-2">
            <strong className="font-semibold text-slate-950">Why we do this, and on what basis.</strong>{" "}
            A directory
            of Contact Improvisation events is not usable without the people who teach and organize them. Dancers
            look for events by teacher, and crediting teachers is standard practice in this field and is information
            organizers already publish themselves. Legal basis: Art.&nbsp;6(1)(f) GDPR: our legitimate interest in
            operating an accurate public directory of Contact Improvisation events and the people who run them,
            alongside the interest of teachers and organizers in being findable professionally. In weighing this
            against your own interests, we take into account that we process only professional information of a kind
            already published about you, and no photographs sourced by us. We do not seek out special categories of
            data within the meaning of Art.&nbsp;9 GDPR, and we do not infer anything about a person that their own
            public material does not state. Where such material, published by the person themselves, is reflected in
            a summary on this site, we process it on the basis of Art.&nbsp;9(2)(e) GDPR, which covers personal data
            manifestly made public by the data subject.
          </p>
          <p className="mt-2">
            <strong className="font-semibold text-slate-950">How long we keep it.</strong>{" "}
            For as long as the profile
            forms part of the event record, and in any case until you object or ask us to delete it. Past events stay
            online as an archive, so a profile may remain linked to an event that has already taken place.
          </p>
          <p className="mt-2">
            <strong className="font-semibold text-slate-950">Who else receives it.</strong>{" "}
            If you are credited on
            an event, your name is shown on that event&apos;s page as part of its record of who taught, organized or
            played music for it. Not everyone credited also has a profile page: some records exist only as that link
            between a person and an event. Profiles and event pages are public and can therefore be indexed by
            search engines. When an event is published we also announce it in our public Telegram channel and
            group, and that announcement names the teachers, organizers and musicians credited on the event, so
            those names are transmitted to Telegram (Telegram FZ-LLC, Dubai) and shown to its subscribers. Technically the data is stored
            by our hosting and database providers, Vercel Inc. and Supabase Inc. (US); transfers to Supabase are
            governed by Standard Contractual Clauses (SCCs) under Art.&nbsp;46(2)(c) GDPR. We do not sell personal
            data and we do not share it with advertisers.
          </p>
          <p className="mt-2">
            <strong className="font-semibold text-slate-950">No automated decision-making.</strong>{" "}
            This data is not
            used for automated decision-making or profiling within the meaning of Art.&nbsp;22 GDPR.
          </p>
          <p className="mt-2">
            <strong className="font-semibold text-slate-950">Correcting or removing your profile.</strong>{" "}
            Email{" "}
            <a href="mailto:hello@citreasurehunt.com" className="underline">
              hello@citreasurehunt.com
            </a>{" "}
            and we will correct, hide, or delete it. You can also claim the profile and edit or deactivate it
            yourself from your dashboard at any time. Your further rights are set out in section 10.
          </p>
          {/* Art. 21(4) requires the right to object to be "explicitly brought to the attention of the data
              subject" and "presented clearly and separately" from other information, hence its own bordered
              block rather than another paragraph in the flow above. Don't merge it back in. */}
          <div className="mt-5 rounded-xl border-2 border-(--color-pine) bg-(--color-mist) p-5">
            <p className="font-semibold text-slate-950">Your right to object</p>
            <p className="mt-2">
              You have the right to object at any time to our processing of your personal data based on legitimate
              interest, under Art.&nbsp;21 GDPR. You do not need to give a reason. If you object, we will remove
              your profile and your name from the event credits it appears in. You can object by using the report
              button on your profile page and selecting
              &ldquo;This is my profile, please remove it&rdquo;, or by emailing{" "}
              <a href="mailto:hello@citreasurehunt.com" className="underline">
                hello@citreasurehunt.com
              </a>
              .
            </p>
          </div>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">7. Profile photos</h2>
          <p>
            If you upload a profile photo, it is stored in our Supabase Storage (Supabase Inc., US) and is not
            publicly visible until we&apos;ve reviewed and approved it. Approved photos are shown publicly on your
            teacher/organizer profile page, together with a photo credit if you provide one. You can replace or
            remove your photo at any time from your dashboard; a new upload is reviewed again before going live.
            Legal basis: Art.&nbsp;6(1)(a) GDPR: your consent, given by choosing to upload a photo. Data transfers
            to Supabase are governed by Standard Contractual Clauses (SCCs) under Art.&nbsp;46(2)(c) GDPR. See{" "}
            <a href="https://supabase.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">
              Supabase&apos;s privacy policy
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">8. Newsletter</h2>
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
            governs that data. We do not store your email address on our own systems. Legal basis: Art. 6(1)(a)
            GDPR: your consent at the time of signup. We keep your address until you unsubscribe or ask us to
            remove it. You can unsubscribe at any time via the link in any newsletter email, and withdrawing your
            consent that way does not affect the lawfulness of anything sent beforehand.
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
          <h2 className="font-semibold text-slate-950">9. Feedback form</h2>
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
            governs Tally&apos;s own processing. Legal basis: Art. 6(1)(f) GDPR: legitimate interest in improving
            the service.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">10. Your rights</h2>
          <p>
            Under the GDPR you have the right to access, correct, or delete personal data we hold about you, to
            restrict or object to processing, and to data portability where applicable. Where we rely on your
            consent, such as for the newsletter or a profile photo you uploaded, you can withdraw that consent at
            any time, and doing so does not affect the lawfulness of processing carried out beforehand. To exercise
            these rights, contact us at hello@citreasurehunt.com.
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
          <h2 className="font-semibold text-slate-950">11. Reports</h2>
          <p>
            When you submit a report via the report form on an event, venue, community or profile page, we store
            the report itself: which listing it concerns, the reason you selected, and any details you choose to
            type. We also store a daily-rotating hash of your IP address to prevent abuse; that hash cannot be used
            to identify you and is not shared with third parties. Please do not include information in the details
            field that you do not want us to hold. Reports are kept while we act on them and for as long as they
            remain useful as a record of a listing&apos;s history; the IP hash rotates daily and is not retained
            beyond its rate-limiting purpose. Legal basis: Art. 6(1)(f) GDPR: legitimate interest in keeping
            listings accurate and preventing spam and abuse.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">12. Accounts and login</h2>
          <p>
            If you create an account to manage your events, we use Supabase Auth (Supabase Inc., US) to sign you
            in by magic link. We store your email address and an internal user identifier, and set a session
            cookie so you stay signed in. We do not use passwords, sign-in is by emailed link only. The session
            cookie is strictly necessary for login and is not used for tracking or profiling. Legal basis:
            Art.&nbsp;6(1)(b) GDPR: processing necessary to provide the account and organizer tools you request.
            We keep your account for as long as you have one; ask us to delete it and we remove it, along with the
            email address and identifier stored with it. Data transfers to Supabase are governed by Standard
            Contractual Clauses (SCCs) under
            Art.&nbsp;46(2)(c) GDPR. See{" "}
            <a href="https://supabase.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">
              Supabase&apos;s privacy policy
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">13. Transactional email (magic links &amp; notifications)</h2>
          <p>
            Emails such as your sign-in magic link, and notifications about your event submissions or profile
            claims, are delivered through Resend (Resend, Inc., US). Resend receives your email address and the
            message content in order to send these emails. We have configured Resend&apos;s EU sending region
            (Ireland, <span className="font-mono text-sm">eu-west-1</span>), so message delivery is processed
            within the EU; because Resend is a US-incorporated company, however, its staff may access data from
            the US, so transfers are governed by Standard Contractual Clauses (SCCs) under Art.&nbsp;46(2)(c)
            GDPR. Legal basis: Art.&nbsp;6(1)(b) GDPR for login emails (necessary to provide the account), and
            Art.&nbsp;6(1)(f) GDPR: legitimate interest in operating the organizer tools, for related
            notifications. See{" "}
            <a href="https://resend.com/legal/privacy-policy" className="underline" target="_blank" rel="noopener noreferrer">
              Resend&apos;s privacy policy
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">14. Community invite links</h2>
          <p>
            Some community pages hide their private Telegram/WhatsApp/Signal/LINE group link behind a
            &quot;Request access&quot; button, to keep it from being scraped. Before revealing the link, we run a
            Cloudflare Turnstile check: Turnstile collects technical data (such as browser and device signals,
            including your IP address) and sends it to Cloudflare, Inc. (US) to verify you&apos;re not a bot. We
            also store a daily-rotating hash of your IP address ourselves to rate-limit repeated requests; like the
            report-form hash in section 11, this cannot be used to identify you. Legal basis: Art. 6(1)(f) GDPR:
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
          <h2 className="font-semibold text-slate-950">15. Maps</h2>
          <p>
            Pages that show a map, such as the events calendar, the communities map and venue pages, load map tiles
            from CARTO (CARTO Inc., US). Your browser requests those tiles directly, so CARTO receives your IP
            address and the tiles you request, which indicates the area of the map you are looking at. We send no
            other information to CARTO, and we do not receive anything back about you. The underlying map data comes
            from OpenStreetMap. Legal basis: Art. 6(1)(f) GDPR: legitimate interest in showing where events,
            communities and venues actually are. See{" "}
            <a
              href="https://carto.com/privacy/"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              CARTO&apos;s privacy policy
            </a>
            .
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-950">16. Changes to this policy</h2>
          <p>
            This policy will be updated when new features affecting data processing are added. The date at the top of
            this page reflects the most recent revision.
          </p>
        </section>
      </div>
    </main>
  );
}
