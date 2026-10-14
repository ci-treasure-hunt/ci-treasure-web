import type { Metadata } from "next";
import Link from "next/link";
import { NewsletterForm } from "./newsletter-form";

export const metadata: Metadata = {
  title: "Newsletter — CI Treasure Hunt",
  description:
    "Occasional updates on new Contact Improvisation events and news from the CI world, delivered straight to your inbox. Free to subscribe, unsubscribe any time.",
};

export default function NewsletterPage() {
  return (
    <main className="min-h-screen bg-(--color-mist)">
      <section className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8">
        <div className="mb-8 border-l-4 border-(--color-pine) pl-5 py-1">
          <h1 className="font-serif text-3xl tracking-tight text-slate-950 sm:text-4xl">Newsletter</h1>
          <p className="mt-2 text-base text-slate-500">
            A monthly digest of upcoming events, new communities, and what&apos;s moving in the CI world.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <NewsletterForm />
          <p className="mt-4 text-xs text-slate-400">
            You will get one email to confirm, then the newsletter. Sent with EmailOctopus, spam check by
            Cloudflare Turnstile.{" "}
            <Link href="/privacy" className="underline hover:text-slate-600">
              Privacy policy
            </Link>
            . Unsubscribe any time.
          </p>
        </div>
      </section>
    </main>
  );
}
