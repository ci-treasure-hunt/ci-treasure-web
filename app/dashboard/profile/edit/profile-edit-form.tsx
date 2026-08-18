"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile, setProfileDeactivated, requestProfileDeletion, type ProfileUpdateData } from "./actions";
import { CONTINENT_COUNTRIES } from "@/lib/continents";
import { getCountryLabel, disciplineLabel } from "@/lib/event-display";
import { SELF_SELECTABLE_PRACTICES } from "@/lib/practices";
import { compressImageForUpload } from "@/lib/client-image-compress";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/upload-limits";

const inputClassName =
  "w-full rounded-2xl border border-(--color-sand-strong) bg-white px-4 py-3 text-sm text-slate-950 outline-none ring-0 transition focus:border-(--color-pine)";

type ProfileRow = {
  name: string;
  slug: string;
  bio: string | null;
  city: string | null;
  country: string | null;
  is_nomadic: boolean;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  youtube: string | null;
  telegram: string | null;
  newsletter: string | null;
  public_email: string | null;
  image_url: string | null;
  image_credit: string | null;
  image_status: string;
  is_organizer: boolean;
  is_teacher: boolean;
  is_musician: boolean;
  discipline: string[] | null;
  updated_at: string;
};

type LockedRoles = {
  organizer: boolean;
  teacher: boolean;
  musician: boolean;
};

export function ProfileEditForm({
  profile,
  lockedRoles,
  isDeactivated,
  deletionRequested,
}: {
  profile: ProfileRow;
  lockedRoles: LockedRoles;
  isDeactivated: boolean;
  deletionRequested: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState<ProfileUpdateData>({
    bio: profile.bio || "",
    city: profile.city || "",
    country: profile.country || "",
    is_nomadic: profile.is_nomadic,
    website: profile.website || "",
    facebook: profile.facebook || "",
    instagram: profile.instagram || "",
    youtube: profile.youtube || "",
    telegram: profile.telegram || "",
    newsletter: profile.newsletter || "",
    public_email: profile.public_email || "",
    is_organizer: profile.is_organizer || lockedRoles.organizer,
    is_teacher: profile.is_teacher || lockedRoles.teacher,
    is_musician: profile.is_musician || lockedRoles.musician,
    discipline: profile.discipline ?? [],
  });

  const allCountries = Object.values(CONTINENT_COUNTRIES).flat().sort((a, b) =>
    getCountryLabel(a).localeCompare(getCountryLabel(b))
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setSuccess(false);
    setError(null);
  }

  function handleNomadicToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    setForm(prev => ({
      ...prev,
      is_nomadic: checked,
      // Nomadic and a fixed city/country can't coexist (enforced in the DB too) -- clear the
      // fields the moment the toggle flips so the form never shows a state it can't save.
      city: checked ? "" : prev.city,
      country: checked ? "" : prev.country,
    }));
    setSuccess(false);
    setError(null);
  }

  const [dangerPending, startDangerTransition] = useTransition();
  const [dangerError, setDangerError] = useState<string | null>(null);
  const [deactivated, setDeactivated] = useState(isDeactivated);
  const [deletionRequestedState, setDeletionRequestedState] = useState(deletionRequested);
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);

  function handleToggleDeactivate() {
    setDangerError(null);
    startDangerTransition(async () => {
      const result = await setProfileDeactivated(!deactivated);
      if (result.success) {
        setDeactivated(!deactivated);
        router.refresh();
      } else {
        setDangerError(result.error || "Failed to update");
      }
    });
  }

  function handleRequestDeletion() {
    setDangerError(null);
    startDangerTransition(async () => {
      const result = await requestProfileDeletion();
      if (result.success) {
        setDeletionRequestedState(true);
        setConfirmingDeletion(false);
      } else {
        setDangerError(result.error || "Failed to submit request");
      }
    });
  }

  function handleRoleToggle(role: "is_organizer" | "is_teacher" | "is_musician") {
    setForm(prev => ({ ...prev, [role]: !prev[role] }));
    setSuccess(false);
    setError(null);
  }

  // Capped at 3 (added 2026-08-18): 573 of 588 teachers who've picked any practice already use
  // 3 or fewer (351 pick just one), so 3 covers the real distribution — the two outliers seen
  // live (4 and 7 picks) read as "everything I've ever studied" rather than "what I teach", which
  // is what this field is actually for. Enforced client-side only (no DB constraint) so an admin
  // can still hand-set a genuine 4+ case, e.g. a teacher with real diplomas in several modalities.
  function handlePracticeToggle(value: string) {
    setForm(prev => {
      const has = prev.discipline.includes(value);
      if (!has && prev.discipline.length >= 3) return prev;
      return {
        ...prev,
        discipline: has
          ? prev.discipline.filter((d) => d !== value)
          : [...prev.discipline, value],
      };
    });
    setSuccess(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await updateProfile(form);
      if (result.success) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(result.error || "Failed to update profile");
      }
    });
  }

  return (
    <div className="space-y-6">
      <PhotoUploadSection
        imageUrl={profile.image_url}
        imageUpdatedAt={profile.updated_at}
        imageCredit={profile.image_credit}
        imageStatus={profile.image_status}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Basic Info</h3>
        <div className="mt-4 space-y-4">
          <Field label="Name">
            <input
              value={profile.name}
              disabled
              className={`${inputClassName} bg-slate-50 text-slate-500 cursor-not-allowed`}
            />
            <p className="mt-1 text-xs text-slate-500">
              To update your name, contact us at <a href="mailto:hello@citreasurehunt.com" className="underline">hello@citreasurehunt.com</a>. We keep names in standard capitalization (e.g. &quot;Jane Doe&quot;, not &quot;jane doe&quot;) for consistency across the site.
            </p>
          </Field>
          <Field label="Bio">
            <textarea
              name="bio"
              value={form.bio}
              onChange={handleChange}
              className={`${inputClassName} min-h-32`}
              placeholder="Tell us about yourself..."
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="City">
              <input
                name="city"
                value={form.city}
                onChange={handleChange}
                disabled={form.is_nomadic}
                className={form.is_nomadic ? `${inputClassName} bg-slate-50 text-slate-400 cursor-not-allowed` : inputClassName}
                placeholder="e.g. Berlin"
              />
            </Field>
            <Field label="Country">
              <select
                name="country"
                value={form.country}
                onChange={handleChange}
                disabled={form.is_nomadic}
                className={form.is_nomadic ? `${inputClassName} bg-slate-50 text-slate-400 cursor-not-allowed` : inputClassName}
              >
                <option value="">Select a country</option>
                {allCountries.map(code => (
                  <option key={code} value={code}>
                    {getCountryLabel(code)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex items-start gap-3 rounded-2xl border border-(--color-sand-strong) bg-(--color-sand)/30 px-4 py-3">
            <input
              type="checkbox"
              checked={form.is_nomadic}
              onChange={handleNomadicToggle}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">
              <span className="font-medium">🌍 I don&apos;t have one home base (nomadic)</span>
              <br />
              <span className="text-slate-500">
                For teachers who genuinely move between places rather than being based somewhere.
                Checking this clears city/country above — we&apos;ll show &quot;Nomadic&quot;
                instead of a location. If you mostly live in one place but travel a lot for
                teaching, leave this unchecked and enter that city instead.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Roles</h3>
        <div className="mt-4 space-y-2">
          <RoleCheckbox
            label="Organizer"
            checked={form.is_organizer}
            locked={lockedRoles.organizer}
            onToggle={() => handleRoleToggle("is_organizer")}
          />
          <RoleCheckbox
            label="Teacher"
            checked={form.is_teacher}
            locked={lockedRoles.teacher}
            onToggle={() => handleRoleToggle("is_teacher")}
          />
          <RoleCheckbox
            label="Musician"
            checked={form.is_musician}
            locked={lockedRoles.musician}
            onToggle={() => handleRoleToggle("is_musician")}
          />
          {(lockedRoles.organizer || lockedRoles.teacher || lockedRoles.musician) && (
            <p className="text-xs text-slate-500">
              Roles you&apos;re already linked to on an event are on automatically and can&apos;t
              be unchecked here.
            </p>
          )}
        </div>
      </section>

      {/* Practice self-select (I-135) — teachers only, since practices are what you teach.
          Controlled vocabulary from SELF_SELECTABLE_PRACTICES; the server re-validates against
          the same list, so a teacher can only ever store an approved practice (no free text). */}
      {form.is_teacher && (
        <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            What you teach {form.discipline.length > 0 ? `(${form.discipline.length} of 3)` : null}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Pick only the practices you actively teach, the ones you&apos;d be invited for on a
            workshop or festival programme. Most teachers pick one or two; you can select up to
            three. Things you&apos;ve trained in but don&apos;t currently teach belong in your
            bio instead. If you genuinely teach more than three, or a practice you teach
            isn&apos;t in this list, email us at{" "}
            <a href="mailto:hello@citreasurehunt.com" className="underline">hello@citreasurehunt.com</a>.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SELF_SELECTABLE_PRACTICES.map((p) => {
              const checked = form.discipline.includes(p);
              const disabled = !checked && form.discipline.length >= 3;
              return (
                <label
                  key={p}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    checked
                      ? "cursor-pointer border-(--color-pine) bg-(--color-pine)/10 text-(--color-pine)"
                      : disabled
                        ? "cursor-not-allowed border-(--color-sand-strong) text-slate-400"
                        : "cursor-pointer border-(--color-sand-strong) text-slate-700 hover:border-(--color-pine)"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => handlePracticeToggle(p)}
                    className="sr-only"
                  />
                  {disciplineLabel(p)}
                </label>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Contact & Social</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Public Email">
            <input
              type="email"
              name="public_email"
              value={form.public_email}
              onChange={handleChange}
              className={inputClassName}
              placeholder="hello@example.com"
            />
          </Field>
          <Field label="Website">
            <input
              type="url"
              name="website"
              value={form.website}
              onChange={handleChange}
              className={inputClassName}
              placeholder="https://..."
            />
          </Field>
          <Field label="Facebook">
            <input
              type="url"
              name="facebook"
              value={form.facebook}
              onChange={handleChange}
              className={inputClassName}
              placeholder="https://facebook.com/..."
            />
          </Field>
          <Field label="Instagram">
            <input
              name="instagram"
              value={form.instagram}
              onChange={handleChange}
              className={inputClassName}
              placeholder="@handle or URL"
            />
          </Field>
          <Field label="YouTube">
            <input
              type="url"
              name="youtube"
              value={form.youtube}
              onChange={handleChange}
              className={inputClassName}
              placeholder="https://youtube.com/..."
            />
          </Field>
          <Field label="Telegram">
            <input
              name="telegram"
              value={form.telegram}
              onChange={handleChange}
              className={inputClassName}
              placeholder="@handle or URL"
            />
          </Field>
          <Field label="Newsletter">
            <input
              type="url"
              name="newsletter"
              value={form.newsletter}
              onChange={handleChange}
              className={inputClassName}
              placeholder="https://..."
            />
          </Field>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        {error && (
          <p className="text-sm font-medium text-rose-600 bg-rose-50 p-4 rounded-2xl border border-rose-100">
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm font-medium text-emerald-600 bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
            Profile updated successfully!
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-(--color-ink) px-8 py-3 text-sm font-semibold text-(--color-mist) shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save changes"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-full border border-(--color-sand-strong) px-8 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back
          </button>
        </div>
      </div>
      </form>

      <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50/50 p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-rose-700">Danger zone</h3>
        <div className="mt-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">
                {deactivated ? "Your profile is deactivated" : "Deactivate your profile"}
              </p>
              <p className="text-xs text-slate-600">
                {deactivated
                  ? "It's hidden from public view. You can reactivate it anytime — nothing was deleted."
                  : "Hides your public profile page. Reversible anytime, and your event links are kept."}
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleDeactivate}
              disabled={dangerPending}
              className="shrink-0 rounded-full border border-rose-300 bg-white px-5 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
            >
              {deactivated ? "Reactivate profile" : "Deactivate profile"}
            </button>
          </div>

          <div className="border-t border-rose-200 pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">Delete your profile permanently</p>
                <p className="text-xs text-slate-600">
                  {deletionRequestedState
                    ? "Request received. It's reviewed by hand, so it may take a little time."
                    : "This can't be undone by you. We review each request by hand before deleting anything."}
                </p>
              </div>
              {!deletionRequestedState && (
                confirmingDeletion ? (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={handleRequestDeletion}
                      disabled={dangerPending}
                      className="rounded-full bg-rose-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:opacity-50"
                    >
                      Confirm request
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDeletion(false)}
                      className="rounded-full border border-(--color-sand-strong) px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingDeletion(true)}
                    disabled={dangerPending}
                    className="shrink-0 rounded-full border border-rose-300 bg-white px-5 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    Request permanent deletion
                  </button>
                )
              )}
            </div>
          </div>

          {dangerError && (
            <p className="text-sm font-medium text-rose-700 bg-rose-100 p-3 rounded-2xl border border-rose-200">
              {dangerError}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function PhotoUploadSection({
  imageUrl,
  imageUpdatedAt,
  imageCredit,
  imageStatus,
}: {
  imageUrl: string | null;
  imageUpdatedAt: string;
  imageCredit: string | null;
  imageStatus: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [credit, setCredit] = useState(imageCredit || "");
  const [isCompressing, setIsCompressing] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(false);
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    setIsCompressing(true);
    const compressed = await compressImageForUpload(file).finally(() => setIsCompressing(false));

    // Checked after compression, not before: the raw file off a phone camera is routinely
    // well over MAX_UPLOAD_BYTES on its own, but the resized/re-encoded version almost
    // always isn't. Rejecting on the original size would turn away photos that are actually
    // fine to upload.
    if (compressed.size > MAX_UPLOAD_BYTES) {
      setError(`File too large (max ${MAX_UPLOAD_MB}MB after compression)`);
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }
    setSelectedFile(compressed);
    setPreviewUrl(URL.createObjectURL(compressed));
  }

  function handleUpload() {
    if (!selectedFile) return;
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.set("file", selectedFile);
    formData.set("credit", credit);

    startTransition(async () => {
      try {
        const response = await fetch("/api/dashboard/profile-photo", { method: "POST", body: formData });
        const result = await response.json();
        if (result.success) {
          setSuccess(true);
          setSelectedFile(null);
          setPreviewUrl(null);
          router.refresh();
        } else {
          setError(result.error || "Failed to upload photo");
        }
      } catch {
        setError("Upload failed — please try again.");
      }
    });
  }

  // Cache-bust with updated_at: upload always writes to the same deterministic path
  // (upsert), so after a re-upload the browser would otherwise keep showing whatever
  // it cached at that exact URL from the previous attempt (found live 2026-08-10 —
  // same bug as app/admin/profile-photos/actions.ts).
  const displayUrl = previewUrl || (imageUrl ? `${imageUrl}?v=${new Date(imageUpdatedAt).getTime()}` : null);

  return (
    <section className="rounded-[1.75rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_55px_rgba(106,75,25,0.08)]">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Photo</h3>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl border border-(--color-sand-strong) bg-(--color-sand)/30">
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={displayUrl} alt="Profile photo" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
              No photo
            </div>
          )}
        </div>
        <div className="flex-1 space-y-3">
          {imageUrl && imageStatus === "pending" && !selectedFile && (
            <p className="text-xs font-medium text-amber-700 bg-amber-50 px-3 py-2 rounded-xl border border-amber-100">
              Your photo is awaiting review and isn&apos;t public yet.
            </p>
          )}
          {imageStatus === "rejected" && !selectedFile && (
            <p className="text-xs font-medium text-rose-700 bg-rose-50 px-3 py-2 rounded-xl border border-rose-100">
              Your previous photo wasn&apos;t approved. Upload a new one to try again.
            </p>
          )}
          <Field label="Upload a photo">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-full text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-(--color-ink) file:px-4 file:py-2 file:text-xs file:font-semibold file:text-(--color-mist)"
            />
            <p className="mt-1 text-xs text-slate-500">JPEG, PNG, or WEBP. Resized automatically before upload.</p>
          </Field>
          <Field label="Credit (optional)">
            <input
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              className={inputClassName}
              placeholder="e.g. Photo by Jane Doe"
            />
          </Field>
          {error && (
            <p className="text-sm font-medium text-rose-600 bg-rose-50 p-3 rounded-2xl border border-rose-100">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm font-medium text-emerald-600 bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
              Photo uploaded — it&apos;s now awaiting review.
            </p>
          )}
          <button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || isPending || isCompressing}
            className="rounded-full bg-(--color-ink) px-6 py-2.5 text-sm font-semibold text-(--color-mist) shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? "Uploading..." : isCompressing ? "Processing..." : "Upload photo"}
          </button>
        </div>
      </div>
    </section>
  );
}

function RoleCheckbox({
  label,
  checked,
  locked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  locked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex items-center gap-2 text-sm ${locked ? "text-slate-400" : "text-slate-700"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={locked}
        onChange={onToggle}
        className="h-4 w-4"
      />
      {label}
      {locked && <span className="text-xs">(linked to an event)</span>}
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}
