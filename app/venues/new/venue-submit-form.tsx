"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { CountryPicker } from "@/components/shared/country-picker";
import { compressImageForUpload } from "@/lib/client-image-compress";
import { PHOTO_ACCEPT, PHOTO_CONSENT_TEXT } from "@/lib/community-photo-options";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import { submitVenue, type VenueSubmitResult } from "@/lib/venue-submit-action";

type Done = Extract<VenueSubmitResult, { ok: true }> & { photoFailed: boolean };

export function VenueSubmitForm() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoCredit, setPhotoCredit] = useState("");
  const [photoConsent, setPhotoConsent] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Done | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  // Sent to /api/venues/photo once the venue exists, with the one-off ticket the action returned.
  // A failed photo never fails the submission.
  async function uploadPhoto(venueId: string, ticket: string): Promise<boolean> {
    if (!photo) return true;
    try {
      const compressed = await compressImageForUpload(photo);
      if (compressed.size > MAX_UPLOAD_BYTES) return false;
      const body = new FormData();
      body.append("venueId", venueId);
      body.append("file", compressed);
      body.append("credit", photoCredit);
      body.append("consent", String(photoConsent));
      body.append("ticket", ticket);
      const res = await fetch("/api/venues/photo", { method: "POST", body });
      return res.ok;
    } catch {
      return false;
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (photo && !photoConsent) {
      setFieldErrors({ photoConsent: "Please confirm you may share this photo, or remove it." });
      return;
    }
    if (photo && photo.size > 25 * 1024 * 1024) {
      setFieldErrors({ photo: "This photo file is very large (over 25MB). Please choose a smaller one." });
      return;
    }
    startTransition(async () => {
      const result = await submitVenue({
        name,
        address,
        city,
        country,
        website,
        instagram,
        facebook,
        description,
        email,
        consent,
      });
      if (result.ok) {
        const photoOk = result.venueId && result.photoTicket ? await uploadPhoto(result.venueId, result.photoTicket) : true;
        setDone({ ...result, photoFailed: !photoOk });
        return;
      }
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
    });
  }

  if (done) {
    return (
      <div className="space-y-3">
        <h2 className="font-serif text-2xl text-slate-950">Thank you!</h2>
        {done.outcome === "listed" ? (
          <p className="text-slate-700">
            {done.venueName} is already listed:{" "}
            <Link href={`/venues/${done.venueSlug}`} className="font-semibold text-(--color-pine) underline">
              see its page
            </Link>
            . If something there is out of date, write to us at{" "}
            <a href="mailto:hello@citreasurehunt.com" className="underline">hello@citreasurehunt.com</a>.
          </p>
        ) : done.outcome === "updated" ? (
          <p className="text-slate-700">
            We already had {done.venueName} and have added your details to it. Organizers can pick it for their events
            now, and we&apos;ll look at giving it its own page.
          </p>
        ) : (
          <p className="text-slate-700">
            {done.venueName} is in. Organizers can pick it for their events right away, and we&apos;ll look at giving it its
            own page.
          </p>
        )}
        {photo && done.photoFailed ? (
          <p className="text-sm text-amber-700">
            Your photo couldn&apos;t be uploaded, but the venue was saved. You can send the photo to hello@citreasurehunt.com.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-4 pt-2">
          <Link href="/events/new" className="text-sm font-semibold text-(--color-pine) underline">
            Add an event there
          </Link>
          <Link href="/venues" className="text-sm font-semibold text-(--color-pine) underline">
            Back to venues
          </Link>
        </div>
      </div>
    );
  }

  const err = (key: string) =>
    fieldErrors[key] ? <p className="text-xs text-rose-700">{fieldErrors[key]}</p> : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-4">
        <Field label="Venue name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClassName} maxLength={150} />
          {err("name")}
        </Field>
        <Field label="Street address" required>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClassName}
            maxLength={300}
            placeholder="e.g. Sedanstraße 22, 79098 Freiburg"
            autoComplete="off"
            name="ci-th-venue-street"
          />
          {err("address")}
        </Field>
        <Field label="City" required>
          <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClassName} maxLength={120} autoComplete="off" />
          {err("city")}
        </Field>
        <Field label="Country" required>
          <CountryPicker value={country} onChange={setCountry} inputClassName={inputClassName} />
          {err("country")}
        </Field>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-700">Links</p>
          <p className="mt-1 text-xs text-slate-500">A website is what gets a venue its own page here.</p>
        </div>
        <Field label="Website">
          <input value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClassName} placeholder="https://..." />
          {err("website")}
        </Field>
        <Field label="Instagram">
          <input value={instagram} onChange={(e) => setInstagram(e.target.value)} className={inputClassName} placeholder="https://instagram.com/..." />
          {err("instagram")}
        </Field>
        <Field label="Facebook">
          <input value={facebook} onChange={(e) => setFacebook(e.target.value)} className={inputClassName} placeholder="https://facebook.com/..." />
          {err("facebook")}
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputClassName} min-h-28`}
            maxLength={2000}
            placeholder="What kind of space it is, the rooms and floor, what happens there."
          />
        </Field>
        <Field label="Venue contact email (optional)">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClassName} maxLength={200} />
          <p className="text-xs text-slate-500">Shown only to visitors who pass a check, never as plain text.</p>
          {err("email")}
        </Field>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-700">Photo of the space (optional)</p>
          <p className="mt-1 text-xs text-slate-500">
            The room or the building works best. Please no flyers. We look at it before it goes on a page.
          </p>
        </div>
        <input
          type="file"
          accept={PHOTO_ACCEPT}
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-(--color-mist) file:px-4 file:py-2 file:text-sm file:font-medium"
        />
        {err("photo")}
        {photo ? (
          <>
            <Field label='Photographer (shown as "Photo by ...")'>
              <input value={photoCredit} onChange={(e) => setPhotoCredit(e.target.value)} className={inputClassName} maxLength={200} />
            </Field>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={photoConsent} onChange={(e) => setPhotoConsent(e.target.checked)} className="mt-1" />
              <span>
                {PHOTO_CONSENT_TEXT}
                <span className="text-rose-700"> *</span>
              </span>
            </label>
            {err("photoConsent")}
          </>
        ) : null}
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
          <span>
            I run this space, teach or organize there, or I&apos;ve checked that it&apos;s fine to list it.
            <span className="text-rose-700"> *</span>
          </span>
        </label>
        {err("consent")}
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-(--color-ink) px-6 py-3 text-sm font-semibold text-(--color-mist) disabled:opacity-60"
        >
          {isSubmitting ? "Sending..." : "Add venue"}
        </button>
        <p className="text-xs text-slate-400">
          Adding a venue doesn&apos;t make you its editor here; for changes later, write to us. See our{" "}
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
