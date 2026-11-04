"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Turnstile } from "@marsidev/react-turnstile";

import { submitEventStep1, type EventStep1Input } from "@/app/events/actions";
import { CountryPicker } from "@/components/shared/country-picker";
import { VenuePicker } from "@/components/shared/venue-picker";
import { disciplineLabel } from "@/lib/event-display";
import { EVENT_TYPE_OPTIONS, REPEAT_OPTIONS, type DropInAnswer, type RepeatMode } from "@/lib/organizer-events";

// I-192 stage 3, step 1 of adding an event: only what, when, where and a link, so anyone can pass
// an event on in a minute. Saved as pending right away (app/events/actions.ts submitEventStep1);
// organizers and teachers add the details afterwards in the edit form.

// Plain words for the type list; the stored values stay as they are.
const TYPE_LABELS: Record<string, string> = {
  jam: "Jam",
  class: "Class",
  lab: "Lab",
  underscore: "Underscore",
  cdp: "CDP (Contact Dance Practice)",
  performance: "Performance",
  lecture: "Talk / lecture",
  workshop: "Workshop",
  long_jam: "Long jam (several days)",
  training: "Training",
  festival: "Festival",
  camp: "Camp",
  retreat: "Retreat",
  intensive: "Intensive",
  residency: "Residency",
  other: "Other",
};

type Mode = { signedIn: boolean; hasProfile: boolean };

export function EventStep1Form({ availablePractices, mode }: { availablePractices: string[]; mode: Mode }) {
  const router = useRouter();
  const askRole = mode.signedIn && mode.hasProfile;

  const [title, setTitle] = useState("");
  const [type, setType] = useState("workshop");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [repeat, setRepeat] = useState<RepeatMode>("");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [repeatDates, setRepeatDates] = useState("");
  const [dropIn, setDropIn] = useState<DropInAnswer>("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueLabel, setVenueLabel] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [discipline, setDiscipline] = useState<string[]>(["contact_improvisation"]);
  // Most events are CI: show only that until asked, so step 1 stays short.
  const [showAllPractices, setShowAllPractices] = useState(false);
  const [organize, setOrganize] = useState(true);
  const [teach, setTeach] = useState(false);

  const [token, setToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const siteKey = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY;

  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ title: string; slug: string } | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  const singleDay = Boolean(startDate) && (!endDate || endDate === startDate);
  const sharing = !askRole || (!organize && !teach);

  function submit(confirmDuplicate: boolean) {
    setError(null);
    const input: EventStep1Input = {
      title,
      type,
      startDate,
      endDate: endDate || startDate,
      startTime,
      endTime,
      city,
      country,
      venueId,
      venueLabel,
      venueName,
      venueAddress,
      sourceUrl,
      pastedText,
      discipline,
      repeat,
      repeatUntil,
      repeatDates,
      dropIn,
      roles: askRole ? [...(organize ? (["organizer"] as const) : []), ...(teach ? (["teacher"] as const) : [])] : [],
      turnstileToken: mode.signedIn ? undefined : token,
      confirmDuplicate,
    };
    startTransition(async () => {
      const result = await submitEventStep1(input);
      if (result.ok) {
        if (result.next === "edit") router.push(`/events/${result.slug}/edit?step=details`);
        else if (result.next === "thanks") router.push("/events/new/done?state=thanks");
        else
          router.push(
            `/events/new/who?${new URLSearchParams({ e: result.eventId, t: result.ticket, title: result.title })}`,
          );
        return;
      }
      setError(result.error);
      setDuplicate(result.duplicate ?? null);
      if (!mode.signedIn) {
        // A Turnstile token is single-use; get a fresh one for the next attempt.
        setToken("");
        setTurnstileKey((k) => k + 1);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="space-y-8"
    >
      <div className="space-y-4">
        <Field label="Title" required>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClassName} maxLength={200} />
        </Field>
        <Field label="Type" required>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClassName}>
            {EVENT_TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {TYPE_LABELS[o] ?? o}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" required>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
              }}
              className={inputClassName}
            />
          </Field>
          <Field label="End date" required>
            <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={inputClassName} />
          </Field>
          {singleDay ? (
            <>
              <Field label="Start time" required={!sharing}>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClassName} />
              </Field>
              <Field label="End time">
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClassName} />
              </Field>
            </>
          ) : null}
        </div>

        <Group label="Does this repeat?">
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatMode)} className={inputClassName}>
            {REPEAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {repeat === "weekly" || repeat === "biweekly" ? (
            <Field label="Repeat until">
              <input type="date" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} className={inputClassName} />
            </Field>
          ) : null}
          {repeat === "dates" ? (
            <Field label="The other dates, one per line">
              <textarea
                value={repeatDates}
                onChange={(e) => setRepeatDates(e.target.value)}
                rows={3}
                placeholder={"2026-11-07\n2026-12-12"}
                className={`${inputClassName} font-mono`}
              />
            </Field>
          ) : null}
          {repeat && type === "class" ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">Can people come to single dates (drop-in)?</legend>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="dropIn" checked={dropIn === "yes"} onChange={() => setDropIn("yes")} />
                Yes, drop-in is possible
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name="dropIn" checked={dropIn === "no"} onChange={() => setDropIn("no")} />
                No, people book the whole series
              </label>
            </fieldset>
          ) : null}
        </Group>
      </div>

      <div className="space-y-4">
        <Field label="City" required>
          <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClassName} maxLength={120} autoComplete="off" />
        </Field>
        <Group label="Country" required>
          <CountryPicker value={country} onChange={setCountry} inputClassName={inputClassName} />
        </Group>
        {mode.signedIn ? (
          <Group label="Venue">
            <VenuePicker
              venueId={venueId}
              venueLabel={venueLabel}
              freeText={venueName}
              addressText={venueAddress}
              onAddressChange={setVenueAddress}
              onSelect={(venue) => {
                setVenueId(venue?.id ?? null);
                setVenueLabel(venue ? `${venue.name} — ${venue.city}, ${venue.country}` : "");
              }}
              onFreeTextChange={setVenueName}
              city={city}
              country={country}
              inputClassName={inputClassName}
            />
          </Group>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Place (optional)">
              <input value={venueName} onChange={(e) => setVenueName(e.target.value)} className={inputClassName} maxLength={150} placeholder="e.g. Studio Kontakt" />
            </Field>
            <Field label="Street address (optional)">
              <input
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
                className={inputClassName}
                maxLength={300}
                autoComplete="off"
                name="ci-th-event-street"
              />
            </Field>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Field label="Link to the event" required>
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            className={inputClassName}
            placeholder="Website, Facebook event, Telegram post…"
            inputMode="url"
          />
        </Field>
        <Field label="Text of the post (optional)">
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            className={`${inputClassName} min-h-28`}
            maxLength={5000}
          />
          <span className="block text-xs text-slate-500">
            Paste the post or message you saw, if you have it, e.g. from Facebook or Telegram. We only use it to fill in
            the details.
          </span>
        </Field>
        <Group label="Practice">
          <div className="flex flex-wrap gap-2">
            {(showAllPractices
              ? availablePractices
              : availablePractices.filter((p) => p === "contact_improvisation" || discipline.includes(p))
            ).map((p) => (
              <label
                key={p}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                  discipline.includes(p) ? "border-(--color-pine) bg-(--color-pine)/10 text-(--color-pine)" : "border-(--color-sand-strong) text-slate-700"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={discipline.includes(p)}
                  onChange={() => setDiscipline((prev) => (prev.includes(p) ? prev.filter((d) => d !== p) : [...prev, p]))}
                />
                {disciplineLabel(p)}
              </label>
            ))}
            {!showAllPractices ? (
              <button
                type="button"
                onClick={() => setShowAllPractices(true)}
                className="rounded-full px-3 py-1.5 text-sm font-medium text-(--color-pine) underline"
              >
                Other practices…
              </button>
            ) : null}
          </div>
        </Group>
      </div>

      {askRole ? (
        <fieldset className="space-y-2 rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">Your role at this event</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={organize} onChange={(e) => setOrganize(e.target.checked)} />
            I organize it
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={teach} onChange={(e) => setTeach(e.target.checked)} />
            I teach at it
          </label>
          <p className="text-xs text-slate-500">
            {sharing
              ? "Neither: you're passing it on. We check it and add the details."
              : "Next you can add the details: description, prices, teachers, photo."}
          </p>
        </fieldset>
      ) : null}

      {duplicate ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">
          <p>
            This looks like it&apos;s already listed:{" "}
            <Link href={`/events/${duplicate.slug}`} target="_blank" className="font-semibold text-(--color-pine) underline">
              {duplicate.title}
            </Link>
          </p>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={isSubmitting || (!mode.signedIn && !token)}
            className="mt-3 rounded-full border border-(--color-pine) px-4 py-2 text-sm font-semibold text-(--color-pine) disabled:opacity-60"
          >
            It&apos;s a different event, add it
          </button>
        </div>
      ) : null}

      <div className="space-y-3">
        {!mode.signedIn ? (
          <Turnstile
            key={turnstileKey}
            siteKey={siteKey ?? ""}
            onSuccess={setToken}
            onExpire={() => setToken("")}
            onError={() => setToken("")}
            options={{ theme: "light" }}
          />
        ) : null}
        {error && !duplicate ? <p className="text-sm text-rose-700">{error}</p> : null}
        <button
          type="submit"
          disabled={isSubmitting || (!mode.signedIn && !token)}
          className="rounded-full bg-(--color-pine) px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : mode.signedIn && !sharing ? "Save and add details" : "Continue"}
        </button>
        <p className="text-xs text-slate-400">
          Every event is checked by hand before it appears. See our{" "}
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

// A div, not a <label>: wrapping a picker in a label breaks it in Safari (WebKit forwards the tap
// to the first control; found on /communities/new, 2026-10-07).
function Group({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-rose-700"> *</span> : null}
      </p>
      {children}
    </div>
  );
}

const inputClassName =
  "w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-sm text-slate-950 outline-none ring-0 transition focus:border-(--color-pine)";
