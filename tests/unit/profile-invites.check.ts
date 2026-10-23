/**
 * Profile group invites: behavioural checks for the rules that keep a person's chat-group invite
 * links out of the public profile fields (profiles.links, the social columns) and into the
 * Turnstile-gated profile_invites.
 *
 * Run:  npx tsx tests/unit/profile-invites.check.ts        (exits non-zero on failure)
 *
 * Same shape as phone-contacts.check.ts, and run by the same "Unit checks" step in checks.yml.
 */
import { parseProfileLinks } from "@/lib/profile-links";
import { resolveProfileInvites } from "@/lib/profile-invites";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}

const WA = "https://chat.whatsapp.com/B6VOTzVPbpDFuzLdZxEmRu";
const TG = "https://t.me/+KbawKvElsGMwNTcy";

console.log("--- parseProfileLinks drops group invites ---");
check(
  "WhatsApp group in extra links is not stored publicly",
  parseProfileLinks([
    { type: "other", url: WA, label: "My group" },
    { type: "website", url: "https://example.com", label: "" },
  ]),
  { items: [{ type: "website", url: "https://example.com" }] },
);
check("Telegram private invite dropped", parseProfileLinks([{ type: "telegram", url: TG, label: "" }]), null);
check(
  "public Telegram username kept",
  parseProfileLinks([{ type: "telegram", url: "@cityjam", label: "" }]),
  { items: [{ type: "telegram", url: "https://t.me/cityjam" }] },
);

console.log("--- resolveProfileInvites ---");
check("editor row kept", resolveProfileInvites([{ url: WA }]), { invites: [{ platform: "whatsapp", url: WA }], invalid: [] });
check("non-invite row reported", resolveProfileInvites([{ url: "https://example.com" }]), {
  invites: [],
  invalid: ["https://example.com"],
});
check("invite pasted into a public field is moved", resolveProfileInvites([], ["https://site.org", TG]), {
  invites: [{ platform: "telegram", url: TG }],
  invalid: [],
});
check(
  "editor row wins over a moved link of the same platform",
  resolveProfileInvites([{ url: WA }], ["https://chat.whatsapp.com/Other123"]),
  { invites: [{ platform: "whatsapp", url: WA }], invalid: [] },
);
check("phone link is not an invite", resolveProfileInvites([], ["https://t.me/+4915112345678"]), {
  invites: [],
  invalid: [],
});
check("empty rows ignored", resolveProfileInvites([{ url: "  " }, null, "x"]), { invites: [], invalid: [] });

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
