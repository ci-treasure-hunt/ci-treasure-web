"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { CountryPicker } from "@/components/shared/country-picker";
import {
  ACTIVITY_LEVELS,
  COMMUNITY_STATUSES,
  COMMUNITY_TYPES,
  FOCUS_OPTIONS,
  FRIENDLINESS_OPTIONS,
  LANGUAGE_OPTIONS,
  createEmptyCommunityFormData,
  type AdminCommunityFormData,
} from "@/lib/admin-communities";
import { COMMUNITY_REGIONS } from "@/lib/community-regions";

const PLATFORM_LABEL: Record<string, string> = {
  telegram: "Telegram group",
  whatsapp: "WhatsApp group",
  signal: "Signal group",
  line: "LINE group",
};

type LinkKey =
  | "website" | "newsletter" | "instagram" | "facebookGroup" | "facebookPage" | "telegramGroup"
  | "telegramChannel" | "whatsappGroup" | "whatsappChannel" | "signalGroup" | "youtube" | "calendar"
  | "other";

const LINK_FIELDS: Array<{ key: LinkKey; label: string; placeholder: string }> = [
  { key: "website", label: "Website", placeholder: "https://..." },
  { key: "newsletter", label: "Mailing list / newsletter", placeholder: "https://..." },
  { key: "telegramGroup", label: "Telegram group", placeholder: "https://t.me/..." },
  { key: "telegramChannel", label: "Telegram channel", placeholder: "https://t.me/..." },
  { key: "whatsappGroup", label: "WhatsApp group", placeholder: "https://chat.whatsapp.com/..." },
  { key: "whatsappChannel", label: "WhatsApp channel", placeholder: "https://whatsapp.com/channel/..." },
  { key: "facebookGroup", label: "Facebook group", placeholder: "https://facebook.com/groups/..." },
  { key: "facebookPage", label: "Facebook page", placeholder: "https://facebook.com/..." },
  { key: "signalGroup", label: "Signal group", placeholder: "https://signal.group/..." },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/..." },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/..." },
  { key: "calendar", label: "Calendar", placeholder: "https://..." },
  { key: "other", label: "Other platform or resource", placeholder: "https://..." },
];

export function CommunityForm({
  initialCommunity,
  mode,
}: {
  initialCommunity?: AdminCommunityFormData;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [form, setForm] = useState<AdminCommunityFormData>(initialCommunity ?? createEmptyCommunityFormData());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSaving, startSaveTransition] = useTransition();

  const set = <K extends keyof AdminCommunityFormData>(key: K, value: AdminCommunityFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function saveCommunity() {
    setSaveError(null);
    setSaveSuccess(null);
    setFieldErrors({});

    const response = await fetch(mode === "create" ? "/api/admin/communities" : `/api/admin/communities/${form.id}`, {
      method: mode === "create" ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSaveError(payload.error ?? "Could not save community.");
      setFieldErrors(payload.fieldErrors ?? {});
      return;
    }
    if (mode === "create" && payload.community?.id) {
      router.push(`/admin/communities/${payload.community.id}/edit?saved=1`);
      router.refresh();
      return;
    }
    // Links the helper moved (e.g. an invite typed into "Other") are no longer in the box they
    // were typed into; reload so the form shows where things actually ended up.
    setSaveSuccess("Saved.");
    router.refresh();
  }

  const err = (key: string) =>
    fieldErrors[key] ? <p className="text-xs text-rose-700">{fieldErrors[key]}</p> : null;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            {mode === "create" ? "New community" : "Edit community"}
          </p>
          <h2 className="font-serif text-3xl text-slate-950">
            {mode === "create" ? "Create community" : form.name || "Edit community"}
          </h2>
          {mode === "edit" && form.slug ? (
            <p className="text-sm text-slate-500">Slug: {form.slug} (not editable, changing it would break existing links)</p>
          ) : null}
          {form.deletedAt ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Archived {form.deletedAt.slice(0, 10)}. Not shown on the site. Restore it from the community list.
            </p>
          ) : null}
        </div>

        <div className="mt-10 space-y-12">
          <Section title="General">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name">
                <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClassName} />
                {err("name")}
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(e) => set("status", e.target.value as AdminCommunityFormData["status"])} className={inputClassName}>
                  {COMMUNITY_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Only published communities are shown on the site.</p>
              </Field>
              <Field label="Type">
                <select value={form.type} onChange={(e) => set("type", e.target.value)} className={inputClassName}>
                  {COMMUNITY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {form.type === "Teacher Network or Channel" ? (
                  <p className="text-xs text-amber-700">
                    Legacy type. One person&apos;s practice belongs on their profile (headcount rule); keep only for held rows.
                  </p>
                ) : null}
                {err("type")}
              </Field>
              <Field label="Activity level">
                <select value={form.activityLevel} onChange={(e) => set("activityLevel", e.target.value)} className={inputClassName}>
                  <option value="">(not set)</option>
                  {ACTIVITY_LEVELS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
                {err("activityLevel")}
              </Field>
              <div className="md:col-span-2 space-y-2">
                <span className="text-sm font-medium text-slate-700">Focus</span>
                <div className="flex flex-wrap gap-4">
                  {FOCUS_OPTIONS.map((f) => (
                    <label key={f} className="flex items-center gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={form.focus.includes(f)}
                        onChange={(e) =>
                          set("focus", e.target.checked ? [...form.focus, f] : form.focus.filter((x) => x !== f))
                        }
                      />
                      {f}
                    </label>
                  ))}
                </div>
              </div>
              <div className="md:col-span-2">
                <Field label="Languages (comma-separated)">
                  <input value={form.languages} onChange={(e) => set("languages", e.target.value)} className={inputClassName} list="community-languages" placeholder="English, German" />
                  <datalist id="community-languages">
                    {LANGUAGE_OPTIONS.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Description">
                  <textarea value={form.description} onChange={(e) => set("description", e.target.value)} className={`${inputClassName} min-h-32`} />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Location">
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.worldwide} onChange={(e) => set("worldwide", e.target.checked)} />
              Worldwide / several countries (no single country, no map pin)
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={form.worldwide ? "Where (e.g. Worldwide, Latin America)" : "City"}>
                <input value={form.city} onChange={(e) => set("city", e.target.value)} className={inputClassName} autoComplete="off" name="ci-th-city" />
                {err("city")}
              </Field>
              {!form.worldwide ? (
                <Field label="Country">
                  <CountryPicker value={form.country} onChange={(code) => set("country", code)} inputClassName={inputClassName} />
                  {err("country")}
                </Field>
              ) : <div />}
              {!form.worldwide ? (
                <>
                  <Field label="Region (leave empty to derive from the country)">
                    <select value={form.region} onChange={(e) => set("region", e.target.value)} className={inputClassName}>
                      <option value="">(derive from country)</option>
                      {COMMUNITY_REGIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </Field>
                  <div />
                  <div className="md:col-span-2">
                    <Field label="Address for map (optional, improves the pin)">
                      <input value={form.addressForMap} onChange={(e) => set("addressForMap", e.target.value)} className={inputClassName} />
                    </Field>
                  </div>
                  <Field label="Latitude (blank = geocode when the location changes)">
                    <input value={form.lat} onChange={(e) => set("lat", e.target.value)} className={inputClassName} placeholder="auto" />
                  </Field>
                  <Field label="Longitude (blank = geocode when the location changes)">
                    <input value={form.lng} onChange={(e) => set("lng", e.target.value)} className={inputClassName} placeholder="auto" />
                  </Field>
                </>
              ) : null}
            </div>
          </Section>

          <Section title="Links">
            <p className="text-sm text-slate-500">
              Group invite links (WhatsApp group, Telegram +/joinchat, Signal, LINE group) are always moved to the private
              invites below, whichever box they&apos;re typed into. They never appear on the page unless published.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {LINK_FIELDS.map(({ key, label, placeholder }) => (
                <Field key={key} label={label}>
                  <input value={form[key]} onChange={(e) => set(key, e.target.value)} className={inputClassName} placeholder={placeholder} />
                  {err(key)}
                </Field>
              ))}
            </div>

            <div className="space-y-3 rounded-2xl border border-(--color-sand-strong) bg-(--color-mist) p-4">
              <p className="text-sm font-semibold text-slate-800">Private group invites</p>
              {form.invites.length === 0 ? (
                <p className="text-sm text-slate-500">None stored.</p>
              ) : (
                form.invites.map((inv, index) => (
                  <div key={inv.platform} className="flex flex-col gap-2 rounded-xl bg-white p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{PLATFORM_LABEL[inv.platform] ?? inv.platform}</p>
                      <p className="truncate text-xs text-slate-500">{inv.url}</p>
                    </div>
                    <div className="flex shrink-0 gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={inv.published}
                          disabled={inv.remove}
                          onChange={(e) =>
                            set("invites", form.invites.map((x, i) => (i === index ? { ...x, published: e.target.checked } : x)))
                          }
                        />
                        Revealable
                      </label>
                      <label className="flex items-center gap-2 text-rose-700">
                        <input
                          type="checkbox"
                          checked={inv.remove}
                          onChange={(e) =>
                            set("invites", form.invites.map((x, i) => (i === index ? { ...x, remove: e.target.checked } : x)))
                          }
                        />
                        Remove
                      </label>
                    </div>
                  </div>
                ))
              )}
              <p className="text-xs text-slate-500">
                &quot;Revealable&quot; lets visitors reveal the link behind the Turnstile check. Only tick it if the organizer
                agreed, the link is already public elsewhere, or the group itself is public. To replace an invite, paste the
                new link into its box above; a new link starts not revealable.
              </p>
            </div>
          </Section>

          <Section title="Contact">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Community email (shown only behind the reveal check)">
                <input value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClassName} />
              </Field>
              <Field label="Contact person (internal)">
                <input value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} className={inputClassName} />
              </Field>
              <Field label="Submitted by (internal, from the public form)">
                <input value={form.submitterContact} onChange={(e) => set("submitterContact", e.target.value)} className={inputClassName} />
              </Field>
            </div>
          </Section>

          <Section title="Internal">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Audience size estimate">
                <input value={form.audienceSize} onChange={(e) => set("audienceSize", e.target.value)} className={inputClassName} inputMode="numeric" />
                <p className="text-xs text-slate-500">
                  Chat group size where one exists, otherwise the Facebook group size (usually much bigger). Not shown publicly.
                </p>
                {err("audienceSize")}
              </Field>
              <Field label="Friendliness">
                <select value={form.friendliness} onChange={(e) => set("friendliness", e.target.value)} className={inputClassName}>
                  <option value="">(not set)</option>
                  {FRIENDLINESS_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <Field label="Last verified">
                <input type="date" value={form.lastVerified} onChange={(e) => set("lastVerified", e.target.value)} className={inputClassName} />
                {err("lastVerified")}
              </Field>
              <div className="md:col-span-2">
                <Field label="Admin notes (internal only, never shown publicly)">
                  <textarea value={form.adminNotes} onChange={(e) => set("adminNotes", e.target.value)} className={`${inputClassName} min-h-24`} />
                </Field>
              </div>
            </div>
          </Section>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
        {saveError ? <p className="text-sm text-rose-700">{saveError}</p> : null}
        {saveSuccess ? <p className="text-sm text-emerald-700">{saveSuccess}</p> : null}
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => startSaveTransition(() => void saveCommunity())}
            className="rounded-full bg-(--color-ink) px-5 py-3 text-sm font-semibold text-(--color-mist) disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/admin/communities")}
            className="rounded-full border border-(--color-sand-strong) px-5 py-3 text-sm font-semibold text-slate-800"
          >
            Back to communities
          </button>
        </div>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">{title}</h3>
        <div className="h-px flex-1 bg-slate-100" />
      </div>
      {children}
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
