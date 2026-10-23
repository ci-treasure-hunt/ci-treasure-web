"use client";

import { invitePlatformOf } from "@/lib/community-links";

// One per platform (profile_invites is unique on profile_id + platform), so four rows at most.
const MAX_GROUP_INVITES = 4;

const PLATFORM_LABELS = { telegram: "Telegram", whatsapp: "WhatsApp", signal: "Signal", line: "LINE" } as const;

type GroupInvitesEditorProps = {
  value: { url: string }[];
  onChange: (next: { url: string }[]) => void;
  inputClassName: string;
};

// Row editor for a person's own chat-group invites (profile_invites), same shape as
// PhoneContactsEditor: rows and the add button only, the surrounding form supplies the section.
// The platform is read from the URL, so a row shows what it is as soon as a valid link is in it.
export function GroupInvitesEditor({ value, onChange, inputClassName }: GroupInvitesEditorProps) {
  return (
    <div className="space-y-3">
      {value.map((row, index) => {
        const platform = invitePlatformOf(row.url.trim());
        return (
          <div key={index} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <input
                type="url"
                value={row.url}
                onChange={(e) => onChange(value.map((r, i) => (i === index ? { url: e.target.value } : r)))}
                className={inputClassName}
                placeholder="https://chat.whatsapp.com/..."
                aria-label="Group invite link"
              />
              {row.url.trim() ? (
                <p className={`mt-1 text-xs ${platform ? "text-slate-500" : "text-rose-700"}`}>
                  {platform
                    ? `${PLATFORM_LABELS[platform]} group`
                    : "Not a group invite link (WhatsApp group, Telegram +/joinchat, Signal group or LINE group)."}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              className="text-sm font-semibold text-rose-700 md:px-2"
            >
              Remove
            </button>
          </div>
        );
      })}
      {value.length < MAX_GROUP_INVITES ? (
        <button
          type="button"
          onClick={() => onChange([...value, { url: "" }])}
          className="rounded-full border border-(--color-sand-strong) px-4 py-2 text-sm font-semibold"
        >
          Add group
        </button>
      ) : null}
    </div>
  );
}
