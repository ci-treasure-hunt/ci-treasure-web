"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { CountryPicker } from "@/components/shared/country-picker";
import {
  VENUE_VISIBILITY_OPTIONS,
  createEmptyVenueFormData,
  type AdminVenueFormData,
} from "@/lib/admin-venues";

type DedupMatch = { id: string; name: string; city: string; country: string };

export function VenueForm({
  initialVenue,
  mode,
}: {
  initialVenue?: AdminVenueFormData;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [form, setForm] = useState<AdminVenueFormData>(initialVenue ?? createEmptyVenueFormData());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [dedupMatches, setDedupMatches] = useState<DedupMatch[]>([]);
  const dedupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dedup check, create mode only — every other venue-creation path in this project
  // (the addvenue skill, VenuePicker's inline quick-add) requires searching for an
  // existing match first. This full-page form is the one path that previously had no
  // such check at all, letting an admin accidentally create a duplicate venue.
  useEffect(() => {
    if (mode !== "create") return;
    if (dedupTimer.current) clearTimeout(dedupTimer.current);

    const name = form.name.trim();
    if (name.length < 3) return;

    dedupTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/venues/search?q=${encodeURIComponent(name)}`);
        const payload = await response.json().catch(() => ({}));
        setDedupMatches(response.ok ? (payload.results ?? []) : []);
      } catch {
        setDedupMatches([]);
      }
    }, 400);

    return () => {
      if (dedupTimer.current) clearTimeout(dedupTimer.current);
    };
  }, [mode, form.name]);

  const endpoint = mode === "create" ? "/api/admin/venues" : `/api/admin/venues/${form.id}`;

  async function saveVenue() {
    setSaveError(null);
    setSaveSuccess(null);

    const response = await fetch(endpoint, {
      method: mode === "create" ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSaveError(payload.error ?? "Could not save venue.");
      return;
    }

    if (mode === "create" && payload.venue?.id) {
      router.push(`/admin/venues/${payload.venue.id}/edit?saved=1`);
      router.refresh();
      return;
    }

    setSaveSuccess("Saved.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            {mode === "create" ? "New venue" : "Edit venue"}
          </p>
          <h2 className="font-serif text-3xl text-slate-950">
            {mode === "create" ? "Create venue" : form.name || "Edit venue"}
          </h2>
          {mode === "edit" && form.slug ? (
            <p className="text-sm text-slate-500">Slug: {form.slug} (not editable — changing it would break existing links)</p>
          ) : null}
        </div>

        <div className="mt-10 space-y-12">
          {/* General Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">General</h3>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name">
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClassName} />
                {form.name.trim().length >= 3 && dedupMatches.length > 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <p className="font-semibold">Possible existing match — check before creating a duplicate:</p>
                    <ul className="mt-1 space-y-0.5">
                      {dedupMatches.map((match) => (
                        <li key={match.id}>
                          {match.name} — {match.city}, {match.country}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Field>
              <Field label="Visibility">
                <select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value })} className={inputClassName}>
                  {VENUE_VISIBILITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {form.visibility === "public" && !form.website.trim() ? (
                  <p className="text-xs text-amber-700">
                    No website set — the addvenue convention reserves &quot;public&quot; for venues with their own site. Still savable, just flagged.
                  </p>
                ) : null}
              </Field>
              <div className="md:col-span-2">
                <Field label="Description">
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    className={`${inputClassName} min-h-32`}
                  />
                </Field>
              </div>
            </div>
          </div>

          {/* Location Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Location</h3>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="City">
                <input
                  value={form.city}
                  onChange={(event) => setForm({ ...form, city: event.target.value })}
                  className={inputClassName}
                  autoComplete="off"
                  name="ci-th-city"
                />
              </Field>
              <Field label="Country">
                <CountryPicker
                  value={form.country}
                  onChange={(code) => setForm({ ...form, country: code })}
                  inputClassName={inputClassName}
                />
              </Field>
              <Field label="Region (optional)">
                <input value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} className={inputClassName} />
              </Field>
              <div />
              <div className="md:col-span-2">
                <Field label="Address">
                  <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className={inputClassName} />
                </Field>
              </div>
              <Field label="Latitude (leave blank to auto-geocode from address on save)">
                <input value={form.lat} onChange={(event) => setForm({ ...form, lat: event.target.value })} className={inputClassName} placeholder="auto" />
              </Field>
              <Field label="Longitude (leave blank to auto-geocode from address on save)">
                <input value={form.lng} onChange={(event) => setForm({ ...form, lng: event.target.value })} className={inputClassName} placeholder="auto" />
              </Field>
            </div>
          </div>

          {/* Contact & Socials Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Contact &amp; socials</h3>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Website">
                <input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} className={inputClassName} placeholder="https://..." />
              </Field>
              <Field label="Email">
                <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputClassName} />
              </Field>
              <Field label="Newsletter">
                <input value={form.newsletter} onChange={(event) => setForm({ ...form, newsletter: event.target.value })} className={inputClassName} placeholder="https://..." />
              </Field>
              <div />
              <Field label="Instagram">
                <input value={form.instagram} onChange={(event) => setForm({ ...form, instagram: event.target.value })} className={inputClassName} placeholder="https://instagram.com/..." />
              </Field>
              <Field label="Facebook">
                <input value={form.facebook} onChange={(event) => setForm({ ...form, facebook: event.target.value })} className={inputClassName} placeholder="https://facebook.com/..." />
              </Field>
              <Field label="YouTube">
                <input value={form.youtube} onChange={(event) => setForm({ ...form, youtube: event.target.value })} className={inputClassName} placeholder="https://youtube.com/..." />
              </Field>
            </div>
          </div>

          {/* Media Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Media</h3>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <p className="text-sm text-slate-500">
              No upload widget here — new photos still go through <code>enrich_venue_image.py</code> (the addvenue
              skill&apos;s Phase 6), which resizes and produces the medium/small variants the venue card depends on.
              This field is for correcting/pointing at an already-processed image URL.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Image URL">
                <input value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} className={inputClassName} placeholder="https://..." />
              </Field>
              <Field label="Image credit">
                <input value={form.imageCredit} onChange={(event) => setForm({ ...form, imageCredit: event.target.value })} className={inputClassName} placeholder="Photo by ..." />
              </Field>
              {form.imageUrl ? (
                <div className="md:col-span-2">
                  <span className="text-sm font-medium text-slate-700">Preview</span>
                  <div className="mt-2 aspect-video max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.imageUrl} alt="Preview" className="h-full w-full object-cover" />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Curation Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Curation</h3>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={form.showInList} onChange={(event) => setForm({ ...form, showInList: event.target.checked })} />
                Show on /venues directory
              </label>
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={form.showInAnnounce} onChange={(event) => setForm({ ...form, showInAnnounce: event.target.checked })} />
                Show venue name in Telegram announcements
              </label>
            </div>
            {form.showInAnnounce ? (
              <Field label="Announce name (optional override, defaults to venue name)">
                <input value={form.announceName} onChange={(event) => setForm({ ...form, announceName: event.target.value })} className={inputClassName} />
              </Field>
            ) : null}
            <Field label="Admin notes (internal only, never shown publicly)">
              <textarea
                value={form.adminNotes}
                onChange={(event) => setForm({ ...form, adminNotes: event.target.value })}
                className={`${inputClassName} min-h-24`}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
        {saveError ? <p className="text-sm text-rose-700">{saveError}</p> : null}
        {saveSuccess ? <p className="text-sm text-emerald-700">{saveSuccess}</p> : null}
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => startSaveTransition(() => void saveVenue())}
            className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist) disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/venues")}
            className="rounded-full border border-(--color-sand-strong) px-5 py-3 text-sm font-semibold text-slate-800"
          >
            Back to venues
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const inputClassName =
  "w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-sm text-slate-950 outline-none ring-0 transition focus:border-(--color-pine)";
