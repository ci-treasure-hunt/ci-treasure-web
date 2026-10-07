/**
 * I-180: behavioural checks for lib/phone-contacts.ts, the helpers that keep phone numbers out of
 * public `links` and social columns and into the Turnstile-gated entity_phone_contacts.
 *
 * Run:  npx tsx tests/unit/phone-contacts.check.ts        (exits non-zero on failure)
 *
 * Same shape as community-links.check.ts, and run by the same "Unit checks" step in checks.yml.
 */
import {
  normalizePhoneNumber,
  phoneContactFromUrl,
  resolvePhoneContacts,
  stripPhoneLinks,
} from "@/lib/phone-contacts";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}

console.log("--- normalizePhoneNumber ---");
check("+ with spaces and dashes", normalizePhoneNumber("+54 9 3548 41-4151"), "5493548414151");
check("00 prefix", normalizePhoneNumber("0049 151 2345678"), "491512345678");
check("brackets", normalizePhoneNumber("(351) 964 568 343"), "351964568343");
check("national number without country code rejected", normalizePhoneNumber("0151 2345678"), null);
check("letters rejected", normalizePhoneNumber("+49 151 CALLME"), null);
check("too short rejected", normalizePhoneNumber("+12345"), null);
check("too long rejected", normalizePhoneNumber("+1234567890123456"), null);
check("empty", normalizePhoneNumber("   "), null);

console.log("--- phoneContactFromUrl ---");
check("wa.me", phoneContactFromUrl("https://wa.me/4915112345678"), { channel: "whatsapp", number: "4915112345678" });
check("wa.me with text", phoneContactFromUrl("wa.me/4915112345678?text=Hi"), { channel: "whatsapp", number: "4915112345678" });
check(
  "api.whatsapp.com/send",
  phoneContactFromUrl("https://api.whatsapp.com/send?phone=4915112345678"),
  { channel: "whatsapp", number: "4915112345678" },
);
check("whatsapp:// scheme", phoneContactFromUrl("whatsapp://send?phone=+4915112345678"), { channel: "whatsapp", number: "4915112345678" });
check("t.me/+<digits>", phoneContactFromUrl("https://t.me/+351964568343"), { channel: "telegram", number: "351964568343" });
check("t.me/+<invite> is not a number", phoneContactFromUrl("https://t.me/+AbC123"), null);
check("t.me/<username> is not a number", phoneContactFromUrl("https://t.me/somejam"), null);
check("signal.me/#p/", phoneContactFromUrl("https://signal.me/#p/+4915112345678"), { channel: "signal", number: "4915112345678" });
check("tel:", phoneContactFromUrl("tel:+49 151 2345678"), { channel: "phone", number: "491512345678" });
check("sms:", phoneContactFromUrl("sms:+491512345678?body=hi"), { channel: "phone", number: "491512345678" });
check("chat.whatsapp.com group is not a number", phoneContactFromUrl("https://chat.whatsapp.com/AbCdEf"), null);
check("ordinary website", phoneContactFromUrl("https://example.com/4915112345678"), null);

console.log("--- malformed percent-encoding never throws ---");
check("stray % in an ordinary link", phoneContactFromUrl("https://example.com/100%zz"), null);
check("broken tel:", phoneContactFromUrl("tel:%E0%A4%A"), null);
check("broken signal hash", phoneContactFromUrl("https://signal.me/#p/%zz"), null);

console.log("--- resolvePhoneContacts ---");
{
  const r = resolvePhoneContacts(
    [
      { channel: "whatsapp", number: "+49 151 2345678", label: "  Tina  " },
      { channel: "whatsapp", number: "", label: "blank row ignored" },
      { channel: "nonsense", number: "+351 964 568 343", label: "" },
    ],
    ["https://wa.me/491512345678", "https://example.com"],
  );
  check(
    "rows cleaned, bad channel -> whatsapp, duplicate link collapsed",
    r.contacts,
    [
      { channel: "whatsapp", number: "491512345678", label: "Tina" },
      { channel: "whatsapp", number: "351964568343", label: null },
    ],
  );
  check("no invalid", r.invalid, []);
}
check("unusable number reported", resolvePhoneContacts([{ channel: "phone", number: "0151 2345678", label: "" }]).invalid, ["0151 2345678"]);
check("non-array input", resolvePhoneContacts("not rows").contacts, []);
check(
  "capped at 5",
  resolvePhoneContacts(Array.from({ length: 8 }, (_, i) => ({ channel: "phone", number: `+4915112345${60 + i}`, label: "" }))).contacts.length,
  5,
);
check(
  "label clipped to 40",
  resolvePhoneContacts([{ channel: "phone", number: "+491512345678", label: "x".repeat(60) }]).contacts[0].label?.length,
  40,
);

console.log("--- stripPhoneLinks ---");
check(
  "phone link blanked and handed back, others kept",
  stripPhoneLinks({ website: "https://wa.me/4915112345678", instagram: "https://instagram.com/x", youtube: "" }),
  { fields: { website: "", instagram: "https://instagram.com/x", youtube: "" }, phoneUrls: ["https://wa.me/4915112345678"] },
);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
