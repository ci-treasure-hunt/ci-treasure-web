"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createEvent, updateEvent } from "@/app/events/actions";
import { disciplineLabel } from "@/lib/event-display";
import { CountryPicker } from "@/components/shared/country-picker";
import { CurrencyPicker } from "@/components/shared/currency-picker";
import { VenuePicker } from "@/components/shared/venue-picker";
import { InlineTeacherPicker } from "@/components/organizer/inline-teacher-picker";
import { compressImageForUpload } from "@/lib/client-image-compress";
import {
  EVENT_TYPE_OPTIONS,
  LEVEL_OPTIONS,
  LINK_TYPE_OPTIONS,
  TIMEZONE_OPTIONS,
  createEmptyOrganizerEventFormData,
  type AdminLinkItem,
  type AdminPriceItem,
  type OrganizerEventFormData,
} from "@/lib/organizer-events";

const inputClassName =
  "w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-sm text-slate-950 outline-none ring-0 transition focus:border-(--color-pine)";

function emptyPriceItem(): AdminPriceItem {
  return { amount: "", currency: "EUR", description: "" };
}
function emptyLinkItem(): AdminLinkItem {
  return { type: "registration", url: "" };
}

// Current UTC offset for a zone, e.g. "GMT+2". Computed live so DST stays correct.
function tzOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

function tzLabel(tz: string): string {
  const off = tzOffset(tz);
  return off ? `${tz} (${off})` : tz;
}

export function OrganizerEventForm({
  mode,
  eventId,
  initial,
  availablePractices,
}: {
  mode: "create" | "edit";
  eventId?: string;
  initial?: OrganizerEventFormData;
  availablePractices: string[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<OrganizerEventFormData>(
    initial ?? createEmptyOrganizerEventFormData(),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function set<K extends keyof OrganizerEventFormData>(key: K, value: OrganizerEventFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function togglePractice(value: string) {
    setForm((prev) => ({
      ...prev,
      discipline: prev.discipline.includes(value)
        ? prev.discipline.filter((d) => d !== value)
        : [...prev.discipline, value],
    }));
  }

  function save() {
    setError(null);
    setSuccess(null);
    setWarning(null);
    startSaving(async () => {
      const result =
        mode === "create" ? await createEvent(form) : await updateEvent(eventId!, form);
      if (!result.success) {
        setError(result.error ?? "Could not save.");
        return;
      }
      // A rehost warning means the event image didn't come through — stay on the page so
      // it's actually seen instead of redirecting straight past it (create mode otherwise
      // jumps to /dashboard immediately).
      if (mode === "create" && !result.warning) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      setSuccess(mode === "create" ? "Event submitted." : "Saved.");
      if (result.warning) setWarning(result.warning);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">General</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Title *">
            <input value={form.title} onChange={(e) => set("title", e.target.value)} className={inputClassName} />
          </Field>
          <Field label="Type">
            <select value={form.type} onChange={(e) => set("type", e.target.value)} className={inputClassName}>
              {EVENT_TYPE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start date *">
            <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputClassName} />
          </Field>
          <Field label="End date *">
            <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={inputClassName} />
          </Field>
          <Field label="Timezone">
            <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)} className={inputClassName}>
              {/* Keep the current value selectable even if it isn't in the curated list. */}
              {(TIMEZONE_OPTIONS as readonly string[]).includes(form.timezone) || !form.timezone
                ? null
                : <option value={form.timezone}>{tzLabel(form.timezone)}</option>}
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tzLabel(tz)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Level">
            <select value={form.level} onChange={(e) => set("level", e.target.value)} className={inputClassName}>
              {LEVEL_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o === "" ? "— unspecified —" : o}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Languages">
            <input value={form.languages} onChange={(e) => set("languages", e.target.value)} className={inputClassName} placeholder="en, de" />
          </Field>
          <Field label="Features">
            <input value={form.features} onChange={(e) => set("features", e.target.value)} className={inputClassName} placeholder="live_music, nature, residential" />
          </Field>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Practice *</h3>
        <p className="mt-1 text-sm text-slate-600">
          Select every practice taught at this event. Contact Improvisation is checked by
          default — untick it only if this event doesn&apos;t include CI at all. Missing a
          practice? Message us and we&apos;ll add it as an option.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {availablePractices.map((p) => (
            <label
              key={p}
              className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                form.discipline.includes(p)
                  ? "border-(--color-pine) bg-(--color-pine)/10 text-(--color-pine)"
                  : "border-(--color-sand-strong) text-slate-700 hover:border-(--color-pine)"
              }`}
            >
              <input
                type="checkbox"
                checked={form.discipline.includes(p)}
                onChange={() => togglePractice(p)}
                className="sr-only"
              />
              {disciplineLabel(p)}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Location</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="City *">
            <input
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              className={inputClassName}
              autoComplete="off"
              name="ci-th-city"
            />
          </Field>
          <Field label="Country *">
            <CountryPicker value={form.country} onChange={(code) => set("country", code)} inputClassName={inputClassName} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Venue">
              <VenuePicker
                venueId={form.venueId}
                venueLabel={form.venueLabel}
                freeText={form.venueName}
                onSelect={(venue) =>
                  setForm((prev) => ({
                    ...prev,
                    venueId: venue?.id ?? null,
                    venueLabel: venue ? `${venue.name} — ${venue.city}, ${venue.country}` : "",
                  }))
                }
                onFreeTextChange={(value) => set("venueName", value)}
                city={form.city}
                country={form.country}
                inputClassName={inputClassName}
              />
            </Field>
            <p className="mt-1 text-xs text-slate-500">
              Pick an existing venue if it's already listed, or type a name/address — used to
              place the event on the map.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Details</h3>
        <div className="mt-4 space-y-4">
          <Field label="Description (Markdown supported)">
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} className={`${inputClassName} min-h-40`} />
          </Field>
          <Field label="Contact email (shown publicly on the event page)">
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              className={inputClassName}
              placeholder="hello@yourevent.com"
            />
          </Field>
          <Field label="Image">
            <div className="flex flex-col gap-3">
              <div className="relative group">
                <input
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImageUploadError(null);
                    try {
                      const compressed = await compressImageForUpload(file);
                      const uploadData = new FormData();
                      uploadData.append("file", compressed);
                      const response = await fetch("/api/organizer/event-image", { method: "POST", body: uploadData });
                      const result = await response.json();
                      if (!response.ok) throw new Error(result.error || "Failed to upload image.");
                      set("imageUrl", result.url);
                    } catch (err) {
                      setImageUploadError(err instanceof Error ? err.message : "Failed to upload image.");
                    }
                  }}
                />
                <div className="flex h-32 w-full items-center justify-center rounded-2xl border-2 border-dashed border-(--color-sand-strong) bg-(--color-mist) transition group-hover:border-(--color-pine)">
                  <div className="flex flex-col items-center gap-2 text-slate-500">
                    <span className="text-sm font-medium">Click or drag to upload</span>
                  </div>
                </div>
              </div>
              {imageUploadError ? <p className="text-sm text-rose-700">{imageUploadError}</p> : null}
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-(--color-sand-strong)" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">or use URL</span>
                <div className="h-px flex-1 bg-(--color-sand-strong)" />
              </div>
              <input value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} className={inputClassName} placeholder="https://…" />
            </div>
          </Field>
          {form.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.imageUrl} alt="Preview" className="max-h-48 rounded-2xl border border-(--color-sand-strong) object-cover" />
          ) : null}
        </div>
      </section>

      {mode === "edit" ? (
        <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Cancellation</h3>
          <label className="mt-4 flex items-center gap-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.cancelled}
              onChange={(e) => set("cancelled", e.target.checked)}
              className="h-4 w-4"
            />
            This event is cancelled
          </label>
          <p className="mt-1 text-sm text-slate-500">
            A cancelled event stays in the system but is hidden from the public calendar.
          </p>
          {form.cancelled ? (
            <div className="mt-4">
              <Field label="Cancellation note (shown if the event page is viewed)">
                <textarea
                  value={form.cancelledText}
                  onChange={(e) => set("cancelledText", e.target.value)}
                  className={`${inputClassName} min-h-24`}
                  placeholder="e.g. Cancelled due to low enrollment. Refunds have been issued."
                />
              </Field>
            </div>
          ) : null}
        </section>
      ) : null}

      <ArraySection
        title="Pricing"
        description="Amounts in major units (e.g. 150 for €150). Left blank rows are ignored."
        items={form.priceItems}
        onAdd={() => set("priceItems", [...form.priceItems, emptyPriceItem()])}
        onRemove={(i) => set("priceItems", form.priceItems.filter((_, idx) => idx !== i))}
        render={(item, i) => (
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr]">
            <input value={item.amount} onChange={(e) => set("priceItems", patch(form.priceItems, i, { amount: e.target.value }))} className={inputClassName} placeholder="150" />
            <CurrencyPicker
              value={item.currency}
              onChange={(code) => set("priceItems", patch(form.priceItems, i, { currency: code }))}
              inputClassName={inputClassName}
            />
            <input value={item.description} onChange={(e) => set("priceItems", patch(form.priceItems, i, { description: e.target.value }))} className={inputClassName} placeholder="Standard" />
          </div>
        )}
      />

      <ArraySection
        title="Links"
        description="Registration, website, and social links shown on the event page."
        items={form.linkItems}
        onAdd={() => set("linkItems", [...form.linkItems, emptyLinkItem()])}
        onRemove={(i) => set("linkItems", form.linkItems.filter((_, idx) => idx !== i))}
        render={(item, i) => (
          <div className="grid gap-3 md:grid-cols-[1fr_3fr]">
            <select value={item.type} onChange={(e) => set("linkItems", patch(form.linkItems, i, { type: e.target.value }))} className={inputClassName}>
              {/* Keep an existing-but-uncommon type (e.g. facebook_page) selectable rather
                  than silently reassigning it to the first option on save. */}
              {(LINK_TYPE_OPTIONS as readonly string[]).includes(item.type) ? null : <option value={item.type}>{item.type}</option>}
              {LINK_TYPE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <input value={item.url} onChange={(e) => set("linkItems", patch(form.linkItems, i, { url: e.target.value }))} className={inputClassName} placeholder="https://…" />
          </div>
        )}
      />

      {mode === "create" ? (
        <InlineTeacherPicker items={form.teachers} onChange={(teachers) => set("teachers", teachers)} />
      ) : null}

      <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
        {warning ? <p className="text-sm text-amber-700">{warning}</p> : null}
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={save}
            className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist) disabled:opacity-60"
          >
            {isSaving ? "Saving…" : mode === "create" ? "Submit event" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-full border border-(--color-sand-strong) px-5 py-3 text-sm font-semibold text-slate-800"
          >
            Back to dashboard
          </button>
        </div>
        {mode === "create" ? (
          <p className="mt-3 text-xs text-slate-500">
            New events are reviewed by an admin before going live, unless your profile is already trusted.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function patch<T extends object>(items: T[], index: number, p: Partial<T>): T[] {
  return items.map((item, i) => (i === index ? { ...item, ...p } : item));
}

function ArraySection<T>({
  title,
  description,
  items,
  onAdd,
  onRemove,
  render,
}: {
  title: string;
  description: string;
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  render: (item: T, index: number) => React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-serif text-2xl text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <button type="button" onClick={onAdd} className="shrink-0 rounded-full border border-(--color-sand-strong) px-4 py-2 text-sm font-semibold">
          Add row
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((item, index) => (
            <div key={index} className="rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-4">
              {render(item, index)}
              <button type="button" onClick={() => onRemove(index)} className="mt-3 text-sm font-semibold text-rose-700">
                Delete row
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No rows yet.</p>
        )}
      </div>
    </section>
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
