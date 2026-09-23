/**
 * I-111: behavioural checks for classifyCommunityLinks (lib/community-links.ts), the helper that
 * keeps private group invites out of public `communities` columns.
 *
 * Run:  npx tsx tests/unit/community-links.check.ts        (exits non-zero on failure)
 *
 * Same shape as url-safety.check.ts, and run by the same "Unit checks" step in checks.yml.
 */
import { classifyCommunityLinks, invitePlatformOf, inviteFlags } from "@/lib/community-links";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}

console.log("--- invitePlatformOf ---");
check("telegram +invite", invitePlatformOf("https://t.me/+AbCdEf123"), "telegram");
check("telegram joinchat", invitePlatformOf("https://t.me/joinchat/AbCdEf"), "telegram");
check("telegram.me joinchat", invitePlatformOf("https://telegram.me/joinchat/AbC"), "telegram");
check("telegram no scheme", invitePlatformOf("t.me/+AbC"), "telegram");
check("telegram public username is NOT an invite", invitePlatformOf("https://t.me/berlinjam"), null);
check("whatsapp group", invitePlatformOf("https://chat.whatsapp.com/Kx12abc"), "whatsapp");
check("whatsapp channel is NOT an invite", invitePlatformOf("https://whatsapp.com/channel/0029Va"), null);
check("whatsapp channel www is NOT an invite", invitePlatformOf("https://www.whatsapp.com/channel/0029Va"), null);
check("signal group", invitePlatformOf("https://signal.group/#CjQKIE"), "signal");
check("line group", invitePlatformOf("https://line.me/ti/g/AbC123"), "line");
check("line group old R form", invitePlatformOf("https://line.me/R/ti/g/AbC123"), "line");
check("line official account is NOT an invite", invitePlatformOf("https://line.me/R/ti/p/@ciclub"), null);
check("ordinary website", invitePlatformOf("https://example.org/jam"), null);
check("garbage", invitePlatformOf("not a link at all"), null);

console.log("--- privacy: an invite in ANY field ends up private, never in a column ---");
const fields = [
  "website", "newsletter", "instagram", "facebook_group", "facebook_page", "telegram_group",
  "telegram_channel", "whatsapp_group", "whatsapp_channel", "signal_group", "youtube", "calendar",
  "other",
] as const;
for (const field of fields) {
  const r = classifyCommunityLinks({ [field]: "https://chat.whatsapp.com/SECRET123" });
  const leaked = Object.values(r.columns).some((v) => v?.includes("SECRET123"));
  check(`whatsapp invite in ${field}: not in any column`, leaked, false);
  check(`whatsapp invite in ${field}: kept as invite`, r.invites.whatsapp, "https://chat.whatsapp.com/SECRET123");
}
{
  const r = classifyCommunityLinks({ other: "https://line.me/ti/g/SECRETLINE" });
  check("LINE invite in other: not in other_resource", r.columns.other_resource, null);
  check("LINE invite in other: kept as invite", r.invites.line, "https://line.me/ti/g/SECRETLINE");
}
{
  const r = classifyCommunityLinks({ telegram_channel: "t.me/+SECRETTG" });
  check("telegram invite in channel box: not in telegram_channel", r.columns.telegram_channel, null);
  check("telegram invite in channel box: kept as invite (normalised)", r.invites.telegram, "https://t.me/+SECRETTG");
}

console.log("--- public links land in their columns ---");
{
  const r = classifyCommunityLinks({
    website: "example.org",
    instagram: "https://instagram.com/cijam",
    telegram_group: "https://t.me/berlinjam",
    telegram_channel: "https://t.me/berlinjamnews",
    whatsapp_channel: "https://whatsapp.com/channel/0029Va",
    other: "https://line.me/R/ti/p/@ciclub",
  });
  check("website normalised to https", r.columns.website, "https://example.org/");
  check("instagram kept", r.columns.instagram, "https://instagram.com/cijam");
  check("public telegram group", r.columns.telegram_group, "https://t.me/berlinjam");
  check("public telegram channel", r.columns.telegram_channel, "https://t.me/berlinjamnews");
  check("whatsapp channel", r.columns.whatsapp_channel, "https://whatsapp.com/channel/0029Va");
  check("LINE official account stays public in other", r.columns.other_resource, "https://line.me/R/ti/p/@ciclub");
  check("no invites", r.invites, {});
  check("no errors", r.errors, {});
  check("linkCount counts columns", r.linkCount, 6);
}

console.log("--- wrong box ---");
{
  const r = classifyCommunityLinks({ whatsapp_group: "https://whatsapp.com/channel/0029Va" });
  check("channel link in group box moves to whatsapp_channel", r.columns.whatsapp_channel, "https://whatsapp.com/channel/0029Va");
  check("...without an error", r.errors, {});
}
{
  const r = classifyCommunityLinks({
    whatsapp_group: "https://whatsapp.com/channel/AAA",
    whatsapp_channel: "https://whatsapp.com/channel/BBB",
  });
  check("channel in group box when channel box is taken: error, not overwrite", r.errors.whatsapp_group !== undefined, true);
  check("...channel box value kept", r.columns.whatsapp_channel, "https://whatsapp.com/channel/BBB");
}
{
  const r = classifyCommunityLinks({ whatsapp_channel: "https://chat.whatsapp.com/INV" });
  check("group invite in channel box goes private", r.invites.whatsapp, "https://chat.whatsapp.com/INV");
  check("...and not into whatsapp_channel", r.columns.whatsapp_channel, null);
}
check("non-telegram link in telegram box: error", classifyCommunityLinks({ telegram_group: "https://example.org" }).errors.telegram_group !== undefined, true);
check("non-invite in whatsapp group box: error", classifyCommunityLinks({ whatsapp_group: "https://example.org" }).errors.whatsapp_group !== undefined, true);
check("non-invite in signal box: error", classifyCommunityLinks({ signal_group: "https://example.org" }).errors.signal_group !== undefined, true);
check("non-channel in whatsapp channel box: error", classifyCommunityLinks({ whatsapp_channel: "https://example.org" }).errors.whatsapp_channel !== undefined, true);

console.log("--- validation ---");
{
  const r = classifyCommunityLinks({ newsletter: "jam@example.org" });
  check("email in a link field: error", r.errors.newsletter !== undefined, true);
  check("...and not stored", r.columns.newsletter, null);
}
check("javascript: rejected", classifyCommunityLinks({ website: "javascript:alert(1)" }).columns.website, null);
check("javascript: errors", classifyCommunityLinks({ website: "javascript:alert(1)" }).errors.website !== undefined, true);
check("empty + whitespace ignored", classifyCommunityLinks({ website: "  ", instagram: "" }), {
  columns: {
    website: null, newsletter: null, instagram: null, facebook_group: null, facebook_page: null,
    telegram_group: null, telegram_channel: null, whatsapp_channel: null, youtube: null,
    calendar: null, other_resource: null,
  },
  invites: {},
  errors: {},
  linkCount: 0,
});
{
  const r = classifyCommunityLinks({
    whatsapp_group: "https://chat.whatsapp.com/ONE",
    other: "https://chat.whatsapp.com/TWO",
  });
  check("two different invites for one platform: error", r.errors.other !== undefined, true);
  check("...first one kept", r.invites.whatsapp, "https://chat.whatsapp.com/ONE");
}
{
  const r = classifyCommunityLinks({
    whatsapp_group: "https://chat.whatsapp.com/SAME",
    other: "https://chat.whatsapp.com/SAME",
  });
  check("same invite twice: no error", r.errors, {});
}
{
  const r = classifyCommunityLinks({ telegram_group: "https://t.me/+ONLYINVITE" });
  check("a single Telegram group invite is enough (linkCount 1)", r.linkCount, 1);
}

console.log("--- inviteFlags ---");
check("none", inviteFlags([]), {
  has_invites: false, has_telegram_invite: false, has_whatsapp_invite: false,
  has_signal_invite: false, has_line_invite: false,
});
check("whatsapp + line", inviteFlags(["whatsapp", "line"]), {
  has_invites: true, has_telegram_invite: false, has_whatsapp_invite: true,
  has_signal_invite: false, has_line_invite: true,
});

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
