"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Turnstile } from "@marsidev/react-turnstile";

import { CountryPicker } from "@/components/shared/country-picker";
import {
  FOCUS_OPTIONS,
  LANGUAGE_OPTIONS,
  PUBLIC_ACTIVITY_LEVELS,
  PUBLIC_COMMUNITY_TYPES,
} from "@/lib/admin-communities";
import type { CommunityLinkInput } from "@/lib/community-links";
import { submitCommunity } from "@/lib/community-submit-action";

const TOP_LANGUAGES = LANGUAGE_OPTIONS.slice(0, 8);
const OTHER_LANGUAGES = LANGUAGE_OPTIONS.slice(8);

const LINK_FIELDS: Array<{ key: keyof CommunityLinkInput; label: string; placeholder: string }> = [
  { key: "website", label: "Website", placeholder: "https://..." },
  { key: "telegram_group", label: "Telegram group", placeholder: "https://t.me/..." },
  { key: "telegram_channel", label: "Telegram channel", placeholder: "https://t.me/..." },
  { key: "whatsapp_group", label: "WhatsApp group", placeholder: "https://chat.whatsapp.com/..." },
  { key: "whatsapp_channel", label: "WhatsApp channel", placeholder: "https://whatsapp.com/channel/..." },
  { key: "facebook_group", label: "Facebook group", placeholder: "https://facebook.com/groups/..." },
  { key: "facebook_page", label: "Facebook page", placeholder: "https://facebook.com/..." },
  { key: "signal_group", label: "Signal group", placeholder: "https://signal.group/..." },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/..." },
  { key: "newsletter", label: "Mailing list / newsletter", placeholder: "https://..." },
  { key: "calendar", label: "Calendar", placeholder: "https://..." },
  { key: "other", label: "Other platform or resource", placeholder: "https://..." },
];

export function CommunitySubmitForm() {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [worldwide, setWorldwide] = useState(false);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [focus, setFocus] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState<CommunityLinkInput>({});
  const [email, setEmail] = useState("");
  const [submitterContact, setSubmitterContact] = useState("");
  const [linksConsent, setLinksConsent] = useState(false);
  const [token, setToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [isSubmitting, startTransition] = useTransition();

  const siteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY;

  const toggle = (list: string[], value: string, on: boolean) =>
    on ? [...list, value] : list.filter((x) => x !== value);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await submitCommunity({
        name,
        type,
        worldwide,
        country,
        city,
        activityLevel,
        focus,
        languages,
        description,
        links,
        email,
        submitterContact,
        linksConsent,
        turnstileToken: token,
      });
      if (result.ok) {
        setDone(true);
        return;
      }
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      // A Turnstile token is single-use; get a fresh one for the next attempt.
      setToken("");
      setTurnstileKey((k) => k + 1);
    });
  }

  if (done) {
    return (
      <div className="space-y-3">
        <h2 className="font-serif text-2xl text-slate-950">Thank you!</h2>
        <p className="text-slate-700">
          We review every submission by hand, so it may take a few days before it shows up on the site.
        </p>
        <Link href="/communities" className="inline-block text-sm font-semibold text-(--color-pine) underline">
          Back to communities
        </Link>
      </div>
    );
  }

  // Without a site key the server would reject every token; fail closed, like the reveal buttons.
  if (!siteKey) {
    return <p className="text-sm text-slate-500">The form isn&apos;t available right now. Please try again later.</p>;
  }

  const err = (key: string) =>
    fieldErrors[key] ? <p className="text-xs text-rose-700">{fieldErrors[key]}</p> : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-4">
        <Field label="Community name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClassName} maxLength={150} />
          {err("name")}
        </Field>

        <Field label="Type" required>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClassName}>
            <option value="">Choose...</option>
            {PUBLIC_COMMUNITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            A group run by one person is best listed on their teacher profile instead; a collective is several people.
          </p>
          {err("type")}
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={worldwide} onChange={(e) => setWorldwide(e.target.checked)} />
          Worldwide, or spread over several countries
        </label>

        {!worldwide ? (
          <Field label="Country" required>
            <CountryPicker value={country} onChange={setCountry} inputClassName={inputClassName} />
            {err("country")}
          </Field>
        ) : null}

        <Field label={worldwide ? "Where (e.g. Worldwide, Latin America)" : "City"} required>
          <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClassName} maxLength={120} autoComplete="off" />
          {err("city")}
        </Field>
      </div>

      <div className="space-y-4">
        <Field label="How often does it meet?">
          <select value={activityLevel} onChange={(e) => setActivityLevel(e.target.value)} className={inputClassName}>
            <option value="">Choose...</option>
            {PUBLIC_ACTIVITY_LEVELS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          {err("activityLevel")}
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Focus</legend>
          <div className="flex flex-wrap gap-4">
            {FOCUS_OPTIONS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" checked={focus.includes(f)} onChange={(e) => setFocus(toggle(focus, f, e.target.checked))} />
                {f}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Language(s)</legend>
          <div className="flex flex-wrap gap-4">
            {TOP_LANGUAGES.map((l) => (
              <label key={l} className="flex items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" checked={languages.includes(l)} onChange={(e) => setLanguages(toggle(languages, l, e.target.checked))} />
                {l}
              </label>
            ))}
          </div>
          <select
            value=""
            onChange={(e) => e.target.value && !languages.includes(e.target.value) && setLanguages([...languages, e.target.value])}
            className={inputClassName}
          >
            <option value="">Another language...</option>
            {OTHER_LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          {languages.some((l) => !TOP_LANGUAGES.includes(l as (typeof TOP_LANGUAGES)[number])) ? (
            <p className="text-xs text-slate-600">
              Also:{" "}
              {languages
                .filter((l) => !TOP_LANGUAGES.includes(l as (typeof TOP_LANGUAGES)[number]))
                .map((l) => (
                  <button key={l} type="button" onClick={() => setLanguages(languages.filter((x) => x !== l))} className="mr-2 underline">
                    {l} ✕
                  </button>
                ))}
            </p>
          ) : null}
        </fieldset>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClassName} min-h-28`}
            maxLength={4000}
            placeholder="When and where it meets, who it's for, anything a visitor should know."
          />
        </Field>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-700">
            Links <span className="text-rose-700">*</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            At least one. A single group or chat link is enough. Everything you enter is shown on the listing once
            we&apos;ve reviewed it. Links to groups and chats (like a WhatsApp group) sit behind a quick human check, so
            bots can&apos;t collect them.
          </p>
          {err("links")}
        </div>
        {LINK_FIELDS.map(({ key, label, placeholder }) => (
          <Field key={key} label={label}>
            <input
              value={links[key] ?? ""}
              onChange={(e) => setLinks({ ...links, [key]: e.target.value })}
              className={inputClassName}
              placeholder={placeholder}
            />
            {err(`links.${key}`)}
          </Field>
        ))}
      </div>

      <div className="space-y-4">
        <Field label="Community contact email (optional)">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClassName} maxLength={200} />
          <p className="text-xs text-slate-500">Shown only to visitors who pass a check, never as plain text.</p>
          {err("email")}
        </Field>
        <Field label="Your name or contact (optional)">
          <input value={submitterContact} onChange={(e) => setSubmitterContact(e.target.value)} className={inputClassName} maxLength={300} />
          <p className="text-xs text-slate-500">Only for us, in case we have a question. Never shown on the site.</p>
        </Field>
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={linksConsent} onChange={(e) => setLinksConsent(e.target.checked)} className="mt-1" />
          <span>
            I&apos;m an organizer of this community, or I&apos;ve checked that it&apos;s fine to share these links here.
            <span className="text-rose-700"> *</span>
          </span>
        </label>
        {err("linksConsent")}
        <Turnstile
          key={turnstileKey}
          siteKey={siteKey}
          onSuccess={setToken}
          onExpire={() => setToken("")}
          onError={() => setToken("")}
          options={{ theme: "light" }}
        />
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        <button
          type="submit"
          disabled={isSubmitting || !token}
          className="rounded-full bg-(--color-ink) px-6 py-3 text-sm font-semibold text-(--color-mist) disabled:opacity-60"
        >
          {isSubmitting ? "Sending..." : "Submit community"}
        </button>
        <p className="text-xs text-slate-400">
          By submitting you agree that we publish the listing after review. See our{" "}
          <Link href="/terms" className="underline hover:text-slate-600">terms</Link> and{" "}
          <Link href="/privacy" className="underline hover:text-slate-600">privacy policy</Link>.
        </p>
      </div>
    </form>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-rose-700"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

const inputClassName =
  "w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-sm text-slate-950 outline-none ring-0 transition focus:border-(--color-pine)";
