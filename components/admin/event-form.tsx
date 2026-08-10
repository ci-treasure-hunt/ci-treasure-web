"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";

import { CountryPicker } from "@/components/shared/country-picker";
import { CurrencyPicker } from "@/components/shared/currency-picker";
import { VenuePicker } from "@/components/shared/venue-picker";
import { compressImageForUpload } from "@/lib/client-image-compress";
import {
  EVENT_STATUS_OPTIONS,
  EVENT_TYPE_OPTIONS,
  LINK_TYPE_OPTIONS,
  ORGANIZER_ROLE_OPTIONS,
  TEACHER_ROLE_OPTIONS,
  createEmptyEventFormData,
  type AdminEventFormData,
  type AdminLinkItem,
  type AdminPersonItem,
  type AdminPriceItem,
} from "@/lib/admin-events";

type ProfileSearchResult = {
  id: string;
  name: string;
  isTeacher: boolean;
  isOrganizer: boolean;
  isMusician: boolean;
};

function emptyPriceItem(): AdminPriceItem {
  return { amount: "", currency: "EUR", description: "" };
}

function emptyLinkItem(): AdminLinkItem {
  return { type: "registration", url: "" };
}

export function EventForm({
  initialEvent,
  mode,
}: {
  initialEvent?: AdminEventFormData;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [form, setForm] = useState<AdminEventFormData>(initialEvent ?? createEmptyEventFormData());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();

  const endpoint = mode === "create" ? "/api/admin/events" : `/api/admin/events/${form.id}`;

  async function saveEvent() {
    setSaveError(null);
    setSaveSuccess(null);

    const response = await fetch(endpoint, {
      method: mode === "create" ? "POST" : "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(form),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSaveError(payload.error ?? "Could not save event.");
      return;
    }

    if (mode === "create" && payload.id) {
      router.push(`/admin/events/${payload.id}/edit?saved=1`);
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
            {mode === "create" ? "New event" : "Edit event"}
          </p>
          <h2 className="font-serif text-3xl text-slate-950">
            {mode === "create" ? "Create event draft" : form.title || "Edit event"}
          </h2>
        </div>

        <div className="mt-10 space-y-12">
          {/* General Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">General</h3>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Title">
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClassName} />
              </Field>
              <Field label="Type">
                <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className={inputClassName}>
                  {EVENT_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={inputClassName}>
                  {EVENT_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Timezone">
                <input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} className={inputClassName} />
              </Field>
              <Field label="Start date">
                <input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} className={inputClassName} />
              </Field>
              <Field label="End date">
                <input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} className={inputClassName} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Description">
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                    className={`${inputClassName} min-h-40`}
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
              <div className="md:col-span-2">
                <Field label="Venue">
                  <VenuePicker
                    venueId={form.venueId}
                    venueLabel={form.venueLabel}
                    freeText={form.venueName}
                    onSelect={(venue) =>
                      setForm({
                        ...form,
                        venueId: venue?.id ?? null,
                        venueLabel: venue ? `${venue.name} — ${venue.city}, ${venue.country}` : "",
                      })
                    }
                    onFreeTextChange={(value) => setForm({ ...form, venueName: value })}
                    city={form.city}
                    country={form.country}
                    allowCreate
                    inputClassName={inputClassName}
                  />
                </Field>
                <p className="mt-1 text-xs text-slate-500">
                  Pick an existing venue, create a new one inline, or type a plain address if
                  there&apos;s no venue name.
                </p>
              </div>
              <Field label="Contact email (shown publicly on the event page)">
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
                  className={inputClassName}
                  placeholder="hello@event.com"
                />
              </Field>
            </div>
          </div>

          {/* Media Section */}
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Media</h3>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <Field label="Event Image">
                  <div className="flex flex-col gap-3">
                    <div className="relative group">
                      <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          try {
                            const compressed = await compressImageForUpload(file);
                            // TEMP diagnostic (2026-08-10): confirm the compressed Blob is
                            // intact before it ever leaves the browser, to isolate whether
                            // corruption happens client-side (canvas re-encode) or server-side.
                            const compressedBytes = new Uint8Array(await compressed.arrayBuffer());
                            const digest = await crypto.subtle.digest("SHA-256", compressedBytes);
                            const hashHex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
                            const magicHex = Array.from(compressedBytes.slice(0, 8)).map((b) => b.toString(16).padStart(2, "0")).join("");
                            console.log("[diag] compressed blob", { size: compressed.size, type: compressed.type, magicHex, hashHex });

                            const formData = new FormData();
                            formData.append("file", compressed);
                            const response = await fetch("/api/admin/event-image", { method: "POST", body: formData });
                            const result = await response.json();
                            if (!response.ok) throw new Error(result.error || "Failed to upload image.");
                            console.log("[diag] server responded", result);
                            setForm({ ...form, imageUrl: result.url });
                          } catch (error) {
                            setSaveError("Failed to upload image.");
                            console.error(error);
                          }
                        }}
                      />
                      <div className="flex items-center justify-center w-full h-32 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 transition group-hover:border-slate-300 group-hover:bg-slate-100">
                        <div className="flex flex-col items-center gap-2 text-slate-500">
                          <Upload className="size-6" />
                          <span className="text-sm font-medium">Click or drag to upload</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-slate-100" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">or use URL</span>
                      <div className="h-px flex-1 bg-slate-100" />
                    </div>
                    <input
                      value={form.imageUrl}
                      placeholder="https://..."
                      onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
                      className={inputClassName}
                    />
                  </div>
                </Field>
              </div>

              {form.imageUrl ? (
                <div className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Preview</span>
                  <div className="relative aspect-video rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden group">
                    <img
                      src={form.imageUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, imageUrl: "" })}
                      className="absolute top-2 right-2 size-8 flex items-center justify-center rounded-full bg-slate-900/50 text-white opacity-0 group-hover:opacity-100 transition backdrop-blur-sm"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center aspect-video rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-slate-400 text-sm">
                  No image selected
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-6">
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={form.hide} onChange={(event) => setForm({ ...form, hide: event.target.checked })} />
            Hide event
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={form.cancelled} onChange={(event) => setForm({ ...form, cancelled: event.target.checked })} />
            Cancelled
          </label>
        </div>

        {form.cancelled ? (
          <div className="mt-4">
            <Field label="Cancelled text">
              <textarea
                value={form.cancelledText}
                onChange={(event) => setForm({ ...form, cancelledText: event.target.value })}
                className={`${inputClassName} min-h-28`}
              />
            </Field>
          </div>
        ) : null}
      </section>

      <JsonListSection
        title="Pricing"
        description="Amounts are entered in major units and converted to minor units on save."
        items={form.priceItems}
        onAdd={() => setForm({ ...form, priceItems: [...form.priceItems, emptyPriceItem()] })}
        onRemove={(index) => setForm({ ...form, priceItems: form.priceItems.filter((_, itemIndex) => itemIndex !== index) })}
        renderItem={(item, index) => (
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto]">
            <input
              value={item.amount}
              onChange={(event) => updateArrayItem(form.priceItems, index, { amount: event.target.value }, (priceItems) => setForm({ ...form, priceItems }))}
              className={inputClassName}
              placeholder="320"
            />
            <CurrencyPicker
              value={item.currency}
              onChange={(code) => updateArrayItem(form.priceItems, index, { currency: code }, (priceItems) => setForm({ ...form, priceItems }))}
              inputClassName={inputClassName}
            />
            <input
              value={item.description}
              onChange={(event) => updateArrayItem(form.priceItems, index, { description: event.target.value }, (priceItems) => setForm({ ...form, priceItems }))}
              className={inputClassName}
              placeholder="Standard"
            />
          </div>
        )}
      />

      <JsonListSection
        title="Links"
        description="Add registration, website, and social links shown on the event page."
        items={form.linkItems}
        onAdd={() => setForm({ ...form, linkItems: [...form.linkItems, emptyLinkItem()] })}
        onRemove={(index) => setForm({ ...form, linkItems: form.linkItems.filter((_, itemIndex) => itemIndex !== index) })}
        renderItem={(item, index) => (
          <div className="grid gap-3 md:grid-cols-[1fr_3fr_auto]">
            <select
              value={item.type}
              onChange={(event) => updateArrayItem(form.linkItems, index, { type: event.target.value }, (linkItems) => setForm({ ...form, linkItems }))}
              className={inputClassName}
            >
              {/* Keep an existing-but-uncommon type (e.g. facebook_page) selectable rather
                  than silently reassigning it to the first option on save. */}
              {(LINK_TYPE_OPTIONS as readonly string[]).includes(item.type) ? null : <option value={item.type}>{item.type}</option>}
              {LINK_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <input
              value={item.url}
              onChange={(event) => updateArrayItem(form.linkItems, index, { url: event.target.value }, (linkItems) => setForm({ ...form, linkItems }))}
              className={inputClassName}
              placeholder="https://..."
            />
          </div>
        )}
      />

      <PeoplePicker
        title="Teachers"
        roleOptions={TEACHER_ROLE_OPTIONS}
        searchRole="teacher"
        items={form.teachers}
        onChange={(teachers) => setForm({ ...form, teachers })}
      />

      <PeoplePicker
        title="Organizers"
        roleOptions={ORGANIZER_ROLE_OPTIONS}
        searchRole="organizer"
        items={form.organizers}
        onChange={(organizers) => setForm({ ...form, organizers })}
      />

      <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
        {saveError ? <p className="text-sm text-rose-700">{saveError}</p> : null}
        {saveSuccess ? <p className="text-sm text-emerald-700">{saveSuccess}</p> : null}
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => startSaveTransition(() => void saveEvent())}
            className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist) disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/events")}
            className="rounded-full border border-(--color-sand-strong) px-5 py-3 text-sm font-semibold text-slate-800"
          >
            Back to events
          </button>
        </div>
      </section>
    </div>
  );
}

function JsonListSection<T>({
  title,
  description,
  items,
  onAdd,
  onRemove,
  renderItem,
}: {
  title: string;
  description: string;
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-serif text-2xl text-slate-950">{title}</h3>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <button type="button" onClick={onAdd} className="rounded-full border border-(--color-sand-strong) px-4 py-2 text-sm font-semibold">
          Add row
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((item, index) => (
            <div key={index} className="rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-4">
              <div className="grid gap-3">
                {renderItem(item, index)}
                <div>
                  <button type="button" onClick={() => onRemove(index)} className="text-sm font-semibold text-rose-700">
                    Delete row
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No rows yet.</p>
        )}
      </div>
    </section>
  );
}

function PeoplePicker({
  title,
  roleOptions,
  searchRole,
  items,
  onChange,
}: {
  title: string;
  roleOptions: readonly string[];
  searchRole: "teacher" | "organizer";
  items: AdminPersonItem[];
  onChange: (items: AdminPersonItem[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, startCreateTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

  async function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);

    if (abortRef.current) {
      abortRef.current.abort();
    }

    if (nextQuery.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(`/api/admin/profiles/search?role=${searchRole}&q=${encodeURIComponent(nextQuery.trim())}`, {
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({ results: [] }));
      if (!response.ok) {
        throw new Error(payload.error ?? "Search failed.");
      }
      setResults(payload.results ?? []);
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        setSearchError(error.message);
      }
    } finally {
      if (abortRef.current === controller) {
        setIsSearching(false);
      }
    }
  }

  function addExisting(result: ProfileSearchResult) {
    if (items.some((item) => item.profileId === result.id)) {
      return;
    }
    onChange([...items, { profileId: result.id, name: result.name, role: roleOptions[0] }]);
    setQuery("");
    setResults([]);
  }

  async function createProfile() {
    const name = query.trim();
    if (!name) {
      return;
    }

    const response = await fetch("/api/admin/profiles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, kind: searchRole }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSearchError(payload.error ?? "Could not create profile.");
      return;
    }

    onChange([...items, { profileId: payload.profile.id, name: payload.profile.name, role: roleOptions[0] }]);
    setQuery("");
    setResults([]);
  }

  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <h3 className="font-serif text-2xl text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">Search existing profiles, or create a missing one inline.</p>

      <div className="mt-4 rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-4">
        <div className="flex flex-col gap-3">
          <input
            value={query}
            onChange={(event) => void handleQueryChange(event.target.value)}
            className={inputClassName}
            placeholder={`Search ${searchRole} profiles`}
          />
          {searchError ? <p className="text-sm text-rose-700">{searchError}</p> : null}
          {isSearching ? <p className="text-sm text-slate-500">Searching...</p> : null}
          {results.length ? (
            <div className="flex flex-col gap-2">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => addExisting(result)}
                  className="rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-left text-sm font-medium text-slate-900"
                >
                  {result.name}
                </button>
              ))}
            </div>
          ) : null}
          {query.trim() ? (
            <button
              type="button"
              onClick={() => startCreateTransition(() => void createProfile())}
              className="self-start rounded-full border border-(--color-sand-strong) px-4 py-2 text-sm font-semibold"
            >
              {isCreating ? "Creating..." : `Create "${query.trim()}"`}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((item, index) => (
            <div key={`${item.profileId}-${index}`} className="rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-4">
              <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto] md:items-center">
                <div>
                  <p className="font-medium text-slate-950">{item.name}</p>
                </div>
                <select
                  value={item.role}
                  onChange={(event) => updateArrayItem(items, index, { role: event.target.value }, onChange)}
                  className={inputClassName}
                >
                  {roleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} className="text-sm font-semibold text-rose-700">
                  Remove
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No {title.toLowerCase()} linked yet.</p>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function updateArrayItem<T extends object>(
  items: T[],
  index: number,
  patch: Partial<T>,
  onChange: (items: T[]) => void,
) {
  onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
}

const inputClassName =
  "w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-sm text-slate-950 outline-none ring-0 transition focus:border-(--color-pine)";
