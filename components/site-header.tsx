"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { InstallToHomeScreen } from "@/components/install-to-home-screen";


const NAV_LINKS = [
  { label: "Events", href: "/", external: false },
  { label: "Communities", href: "/communities", external: false },
  { label: "Teachers", href: "/teachers", external: false, isNew: true },
  { label: "Venues", href: "/venues", external: false },
  { label: "Newsletter", href: "/newsletter", external: false },
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

export function SiteHeader() {
  const [open, setOpen] = useState(false);

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
          </nav>
          <Link
            href="/auth?next=/dashboard"
            className="rounded-full border border-(--color-sand-strong) px-4 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-(--color-pine) hover:text-(--color-pine)"
          >
            Sign in
          </Link>
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
          <Link
            href="/auth?next=/dashboard"
            className="flex items-center gap-1.5 transition hover:text-(--color-pine)"
            onClick={() => setOpen(false)}
          >
            Sign in
          </Link>
        </nav>
      )}
    </header>
  );
}
