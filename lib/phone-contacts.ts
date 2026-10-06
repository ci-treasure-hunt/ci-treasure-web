// Phone-based contacts (WhatsApp, Telegram/Signal by number, plain phone). Pure helpers, safe on
// both client and server. Storage and the gated reveal live in lib/entity-phone-contacts.ts and
// lib/protected-phone-contact-action.ts.
//
// The rule these encode (ci-treasure-hunt/docs/web/link-types.md): a link that carries a phone number
// never goes into public `links` or a social column. It is stored digits-only in
// entity_phone_contacts and revealed behind Turnstile, like contact emails. Username links
// (t.me/<name>, Signal username links) are not phone numbers and stay public.

export const PHONE_CONTACT_CHANNELS = ["whatsapp", "telegram", "signal", "phone"] as const;
export type PhoneContactChannel = (typeof PHONE_CONTACT_CHANNELS)[number];

export const PHONE_CONTACT_CHANNEL_LABELS: Record<PhoneContactChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  signal: "Signal",
  phone: "Phone",
};

// Form shape: `number` is whatever the user typed until it is saved.
export type PhoneContactInput = {
  channel: PhoneContactChannel;
  number: string;
  label: string;
};

// One sentence every form shows above the editor, so people know the number is not published openly.
export const PHONE_CONTACTS_HINT =
  "Only if people can register or reach you this way. Use the full international number with country code. " +
  "It is not shown openly: visitors see it after a quick bot check, like the contact email.";

export const MAX_PHONE_CONTACTS = 5;
const MAX_LABEL_LENGTH = 40;

export function emptyPhoneContact(): PhoneContactInput {
  return { channel: "whatsapp", number: "", label: "" };
}

// "+54 9 3548 41-4151", "0049 151 2345678", "(351) 964 568 343" -> international digits, no '+'.
// Mirrors the DB check on entity_phone_contacts.number (E.164: 7-15 digits, no leading 0), so a
// number that passes here never fails the insert. Returns null for anything else, including a
// national number without a country code ("0151 ..."), which wa.me cannot dial.
export function normalizePhoneNumber(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/[a-z]/i.test(trimmed)) return null;
  let digits = trimmed.replace(/[\s().\-/]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  return /^[1-9][0-9]{6,14}$/.test(digits) ? digits : null;
}

function isChannel(value: unknown): value is PhoneContactChannel {
  return typeof value === "string" && (PHONE_CONTACT_CHANNELS as readonly string[]).includes(value);
}

// Recognises a link that carries a phone number. Covers the forms organizers actually paste:
// wa.me/<n> (with or without ?text=), api.whatsapp.com/send?phone=<n>, whatsapp://send?phone=<n>,
// t.me/+<digits> / telegram.me/+<digits>, signal.me/#p/+<n>, tel:<n>, sms:<n>.
//
// Note t.me/+<letters> is a private group invite (community_invites), not a phone number: only an
// all-digit tail counts here.
export function phoneContactFromUrl(raw: string): { channel: PhoneContactChannel; number: string } | null {
  const value = raw.trim();
  if (!value) return null;

  const scheme = value.match(/^(tel|sms):(.+)$/i);
  if (scheme) {
    const number = normalizePhoneNumber(decodeURIComponent(scheme[2]).split(/[?;,]/)[0]);
    return number ? { channel: "phone", number } : null;
  }

  const whatsappScheme = value.match(/^whatsapp:\/\/send\/?\?(.*)$/i);
  if (whatsappScheme) {
    const number = normalizePhoneNumber(new URLSearchParams(whatsappScheme[1]).get("phone") ?? "");
    return number ? { channel: "whatsapp", number } : null;
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = decodeURIComponent(url.pathname);

  if (host === "wa.me") {
    const number = normalizePhoneNumber(path.replace(/^\//, "").split("/")[0]);
    return number ? { channel: "whatsapp", number } : null;
  }
  if ((host === "api.whatsapp.com" || host === "web.whatsapp.com") && /^\/send\/?$/i.test(path)) {
    const number = normalizePhoneNumber(url.searchParams.get("phone") ?? "");
    return number ? { channel: "whatsapp", number } : null;
  }
  if (host === "t.me" || host === "telegram.me") {
    const tail = path.match(/^\/\+([0-9]+)\/?$/);
    const number = tail ? normalizePhoneNumber(tail[1]) : null;
    return number ? { channel: "telegram", number } : null;
  }
  if (host === "signal.me") {
    const tail = decodeURIComponent(url.hash).match(/^#p\/(\+?[0-9 ]+)$/);
    const number = tail ? normalizePhoneNumber(tail[1]) : null;
    return number ? { channel: "signal", number } : null;
  }
  return null;
}

export function isPhoneContactUrl(raw: string): boolean {
  return phoneContactFromUrl(raw) !== null;
}

// For forms with plain link columns (venue website/socials): blanks any field holding a phone link
// and hands those links back, so the caller can pass them to resolvePhoneContacts as extraUrls.
export function stripPhoneLinks<K extends string>(
  fields: Record<K, string>,
): { fields: Record<K, string>; phoneUrls: string[] } {
  const phoneUrls: string[] = [];
  const clean = { ...fields };
  for (const key of Object.keys(clean) as K[]) {
    if (isPhoneContactUrl(clean[key])) {
      phoneUrls.push(clean[key]);
      clean[key] = "";
    }
  }
  return { fields: clean, phoneUrls };
}

export type CleanPhoneContact ={ channel: PhoneContactChannel; number: string; label: string | null };

// Turns form rows plus any phone links an organizer pasted elsewhere (Links, a social field) into
// the set to store. Blank rows are ignored; a row with something typed that is not a usable
// international number is reported back rather than silently dropped, so the organizer can fix it.
// Duplicates (same channel and number) collapse to the first, keeping its label.
export function resolvePhoneContacts(
  rows: unknown,
  extraUrls: string[] = [],
): { contacts: CleanPhoneContact[]; invalid: string[] } {
  const contacts: CleanPhoneContact[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  const push = (channel: PhoneContactChannel, number: string, label: string | null) => {
    const key = `${channel}:${number}`;
    if (seen.has(key)) return;
    seen.add(key);
    contacts.push({ channel, number, label });
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<PhoneContactInput>;
    const rawNumber = typeof r.number === "string" ? r.number : "";
    if (!rawNumber.trim()) continue;
    const channel = isChannel(r.channel) ? r.channel : "whatsapp";
    // Someone pasting a full wa.me link into the number box is fine too.
    const number = phoneContactFromUrl(rawNumber)?.number ?? normalizePhoneNumber(rawNumber);
    if (!number) {
      invalid.push(rawNumber.trim());
      continue;
    }
    const label = typeof r.label === "string" ? r.label.trim().slice(0, MAX_LABEL_LENGTH) : "";
    push(channel, number, label || null);
  }

  for (const raw of extraUrls) {
    const found = phoneContactFromUrl(raw);
    if (found) push(found.channel, found.number, null);
  }

  return { contacts: contacts.slice(0, MAX_PHONE_CONTACTS), invalid };
}

export function phoneContactsErrorMessage(invalid: string[]): string {
  return (
    `Please check the contact number${invalid.length > 1 ? "s" : ""} ${invalid.map((n) => `"${n}"`).join(", ")}: ` +
    "use the full international format with country code, e.g. +49 151 2345678."
  );
}
