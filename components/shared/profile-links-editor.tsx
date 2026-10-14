"use client";

import {
  MAX_PROFILE_LINKS,
  PROFILE_LINK_TYPES,
  PROFILE_LINK_TYPE_LABELS,
  emptyProfileLink,
  type ProfileLinkInput,
} from "@/lib/profile-links";

type ProfileLinksEditorProps = {
  value: ProfileLinkInput[];
  onChange: (next: ProfileLinkInput[]) => void;
  inputClassName: string;
};

// Row editor for profiles.links, same shape as PhoneContactsEditor: renders only the rows and the
// add button, so it sits inside whichever card the profile form wraps it in.
export function ProfileLinksEditor({ value, onChange, inputClassName }: ProfileLinksEditorProps) {
  function update(index: number, patch: Partial<ProfileLinkInput>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      {value.map((row, index) => (
        <div key={index} className="grid gap-3 md:grid-cols-[9rem_1fr_1fr_auto] md:items-center">
          <select
            value={row.type}
            onChange={(e) => update(index, { type: e.target.value })}
            className={inputClassName}
            aria-label="Link type"
          >
            {PROFILE_LINK_TYPES.map((t) => (
              <option key={t} value={t}>
                {PROFILE_LINK_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            value={row.url}
            onChange={(e) => update(index, { url: e.target.value })}
            className={inputClassName}
            placeholder={row.type === "instagram" || row.type === "telegram" ? "@handle or URL" : "https://..."}
            aria-label="Link"
          />
          <input
            value={row.label}
            onChange={(e) => update(index, { label: e.target.value })}
            className={inputClassName}
            placeholder="Label (optional), e.g. Personal"
            aria-label="Label (optional)"
            maxLength={40}
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            className="text-sm font-semibold text-rose-700 md:px-2"
          >
            Remove
          </button>
        </div>
      ))}
      {value.length < MAX_PROFILE_LINKS ? (
        <button
          type="button"
          onClick={() => onChange([...value, emptyProfileLink()])}
          className="rounded-full border border-(--color-sand-strong) px-4 py-2 text-sm font-semibold"
        >
          Add link
        </button>
      ) : null}
    </div>
  );
}
