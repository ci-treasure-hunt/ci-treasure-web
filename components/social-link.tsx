import { ExternalLink } from "lucide-react";

export function SocialLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      // noopener, not noreferrer: these point at the entity's own site/socials, and they should
      // be able to see citreasurehunt.com as a referrer (I-173). Referrer-Policy sends origin only.
      rel="noopener"
      className="inline-flex items-center justify-between rounded-xl border border-(--color-sand-strong) bg-white px-4 py-3 text-sm font-medium text-slate-900 transition hover:border-(--color-pine) hover:text-(--color-pine)"
    >
      <span className="flex items-center gap-3">
        <span className="text-(--color-pine)">{icon}</span>
        <span className="capitalize">{label}</span>
      </span>
      <ExternalLink className="h-4 w-4 opacity-30" />
    </a>
  );
}
