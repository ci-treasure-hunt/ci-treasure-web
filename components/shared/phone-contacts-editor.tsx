"use client";

import {
  MAX_PHONE_CONTACTS,
  PHONE_CONTACT_CHANNELS,
  PHONE_CONTACT_CHANNEL_LABELS,
  emptyPhoneContact,
  type PhoneContactChannel,
  type PhoneContactInput,
} from "@/lib/phone-contacts";

type PhoneContactsEditorProps = {
  value: PhoneContactInput[];
  onChange: (next: PhoneContactInput[]) => void;
  inputClassName: string;
  // Placeholder for the optional name field; differs between an event (several organizers) and a
  // profile (the person themselves, where a label is rarely needed).
  labelPlaceholder?: string;
};

// Row editor for entity_phone_contacts, shared by the organizer event form, the admin event form and
// the profile editor. Each form wraps it in its own section; this renders only the rows and the add
// button, so it fits whichever card style the surrounding form uses.
export function PhoneContactsEditor({
  value,
  onChange,
  inputClassName,
  labelPlaceholder = "Name (optional), e.g. Tina",
}: PhoneContactsEditorProps) {
  function update(index: number, patch: Partial<PhoneContactInput>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      {value.map((row, index) => (
        <div key={index} className="grid gap-3 md:grid-cols-[9rem_1fr_1fr_auto] md:items-center">
          <select
            value={row.channel}
            onChange={(e) => update(index, { channel: e.target.value as PhoneContactChannel })}
            className={inputClassName}
            aria-label="Contact type"
          >
            {PHONE_CONTACT_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {PHONE_CONTACT_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
          <input
            type="tel"
            inputMode="tel"
            value={row.number}
            onChange={(e) => update(index, { number: e.target.value })}
            className={inputClassName}
            placeholder="+49 151 2345678"
            aria-label="Number with country code"
          />
          <input
            value={row.label}
            onChange={(e) => update(index, { label: e.target.value })}
            className={inputClassName}
            placeholder={labelPlaceholder}
            aria-label="Name (optional)"
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
      {value.length < MAX_PHONE_CONTACTS ? (
        <button
          type="button"
          onClick={() => onChange([...value, emptyPhoneContact()])}
          className="rounded-full border border-(--color-sand-strong) px-4 py-2 text-sm font-semibold"
        >
          Add number
        </button>
      ) : null}
    </div>
  );
}

