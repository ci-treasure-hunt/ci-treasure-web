"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { InstallToHomeScreen } from "@/components/install-to-home-screen";
import { createClient } from "@/lib/supabase/client";


const NAV_LINKS = [
  { label: "Events", href: "/", external: false },
  { label: "Communities", href: "/communities", external: false },
  { label: "Teachers", href: "/teachers", external: false, isNew: true },
  { label: "Venues", href: "/venues", external: false },
  { label: "Newsletter", href: "/newsletter", external: false },
];

// I-156, decided 2026-08-30: a grouped dropdown once there were three real destinations sharing
// one job ("learn about the project / explore beyond events"), rather than more flat nav items.
// Guides (I-148) appended 2026-09-01, as the note here anticipated. It leads the list:
// it is the only entry of the four a first-time visitor has a reason to open.
const EXPLORE_LINKS = [
  { label: "Guides", href: "/guides" },
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/faq" },
  { label: "Countries", href: "/countries" },
];

// Small "New" pill for recently-added nav items — remove the isNew flag above once it's
// been live long enough that regulars have noticed (a few weeks is plenty).
function NewBadge() {
  return (
    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-sans text-[9px] font-bold tracking-widest text-amber-700 uppercase">
      New
    </span>
  );
}

// null = session check still in flight (renders a same-sized skeleton so the
// button never visibly swaps labels after paint, matching the recommendation
// discussed with Jan 2026-08-29 to avoid a "sign in" -> "dashboard" flash).
function useIsSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // getSession() reads the locally persisted session (no network round trip) —
    // getUser() would revalidate against Supabase and is worth the latency only
    // for actual security checks, not for painting a label.
    supabase.auth.getSession().then(({ data }) => setSignedIn(data.session != null));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(session != null);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  return signedIn;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const signedIn = useIsSignedIn();

  return (
    <header className="border-b border-(--color-sand-strong) bg-(--color-mist)/90 backdrop-blur">
      <InstallToHomeScreen />
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="flex items-center gap-2 font-serif text-2xl tracking-tight text-slate-950"
          onClick={() => setOpen(false)}
        >
          CI Treasure Hunt
          <span className="rounded-full bg-(--color-pine)/10 px-2 py-0.5 font-sans text-[10px] font-bold tracking-widest uppercase text-(--color-pine)">
            Alpha
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-6">
          <nav className="flex items-center gap-5 text-sm font-medium text-slate-700">
            {NAV_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 transition hover:text-(--color-pine)"
                >
                  {link.label}
                  {link.isNew && <NewBadge />}
                </a>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  className="flex items-center gap-1.5 transition hover:text-(--color-pine)"
                >
                  {link.label}
                  {link.isNew && <NewBadge />}
                </Link>
              )
            )}
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-1 transition hover:text-(--color-pine) [&::-webkit-details-marker]:hidden">
                Explore
                <svg viewBox="0 0 10 6" className="size-2.5 fill-current transition group-open:rotate-180">
                  <path d="M0 0l5 6 5-6z" />
                </svg>
              </summary>
              <div className="absolute right-0 z-10 mt-2 flex min-w-32 flex-col gap-1 rounded-xl border border-(--color-sand-strong) bg-(--color-mist) p-2 shadow-lg">
                {EXPLORE_LINKS.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="rounded-lg px-3 py-1.5 transition hover:bg-(--color-pine)/10 hover:text-(--color-pine)"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </details>
          </nav>
          {signedIn === null ? (
            <span
              aria-hidden="true"
              className="inline-block h-7.5 w-23 animate-pulse rounded-full bg-(--color-sand-strong)/40"
            />
          ) : (
            <Link
              href={signedIn ? "/dashboard" : "/auth?next=/dashboard"}
              className="rounded-full border border-(--color-sand-strong) px-4 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-(--color-pine) hover:text-(--color-pine)"
            >
              {signedIn ? "Dashboard" : "Sign in"}
            </Link>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="sm:hidden p-2 text-slate-700 hover:text-(--color-pine)"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <nav className="sm:hidden border-t border-(--color-sand-strong) bg-(--color-mist) px-5 py-4 flex flex-col gap-4 text-base font-medium text-slate-700 items-end">
          {NAV_LINKS.map((link) =>
            link.external ? (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 transition hover:text-(--color-pine)"
                onClick={() => setOpen(false)}
              >
                {link.label}
                {link.isNew && <NewBadge />}
              </a>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                className="flex items-center gap-1.5 transition hover:text-(--color-pine)"
                onClick={() => setOpen(false)}
              >
                {link.label}
                {link.isNew && <NewBadge />}
              </Link>
            )
          )}
          {EXPLORE_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="flex items-center gap-1.5 transition hover:text-(--color-pine)"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {signedIn !== null && (
            <Link
              href={signedIn ? "/dashboard" : "/auth?next=/dashboard"}
              className="flex items-center gap-1.5 transition hover:text-(--color-pine)"
              onClick={() => setOpen(false)}
            >
              {signedIn ? "Dashboard" : "Sign in"}
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
