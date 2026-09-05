/**
 * I-165 — behavioural checks for the two security helpers added by that issue:
 * safeExternalUrl (lib/url-safety.ts, Finding 2) and safeNext (lib/site.ts, Finding 4).
 *
 * Run:  npx tsx tests/unit/url-safety.check.ts        (exits non-zero on failure)
 *
 * NOT WIRED INTO CI, and deliberately not named *.spec.ts — the repo's only runner is Playwright
 * (tests/e2e, testDir './tests/e2e'), which boots a full build+server per run and is the wrong
 * tool for pure-function assertions. Kept as a runnable script rather than deleted because it
 * earned its place: it caught two real bugs in the first "corrected" implementation of
 * safeExternalUrl, both of which had passed review. If a unit runner is ever added, this is the
 * first thing to move into it.
 */
import { safeExternalUrl } from "@/lib/url-safety";
import { safeNext } from "@/lib/site";
import { isPrivateIp } from "@/lib/rehost-image";
import { escapeHtml } from "@/lib/utils";

let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}

console.log("--- safeExternalUrl: must REJECT ---");
check("javascript:", safeExternalUrl("javascript:alert(1)"), null);
check("JavaScript: mixed case", safeExternalUrl("JavaScript:alert(document.cookie)"), null);
check("javascript:while(1)", safeExternalUrl("javascript:while(1)"), null);
check("data: html", safeExternalUrl("data:text/html,<script>alert(1)</script>"), null);
check("vbscript:", safeExternalUrl("vbscript:msgbox(1)"), null);
check("mailto: (must NOT be allowed)", safeExternalUrl("mailto:a@b.com"), null);
check("file:", safeExternalUrl("file:///etc/passwd"), null);
check("empty", safeExternalUrl(""), null);
check("whitespace only", safeExternalUrl("   "), null);
check("null", safeExternalUrl(null), null);

console.log("--- safeExternalUrl: must ACCEPT ---");
check("plain https unchanged", safeExternalUrl("https://ci-cph.dk/events"), "https://ci-cph.dk/events");
check("plain http unchanged", safeExternalUrl("http://example.com/x"), "http://example.com/x");
check("no trailing-slash rewrite", safeExternalUrl("https://example.com"), "https://example.com");
check("bare host prefixed", safeExternalUrl("ci-cph.dk/events"), "https://ci-cph.dk/events");
check("bare host + PORT (regression)", safeExternalUrl("ci-cph.dk:8080/x"), "https://ci-cph.dk:8080/x");
check("protocol-relative made explicit", safeExternalUrl("//evil.com"), "https://evil.com/");
check("backslash form", safeExternalUrl("/\\evil.com"), "https://evil.com/");
check("trims whitespace", safeExternalUrl("  https://example.com/a  "), "https://example.com/a");

console.log("--- safeNext: must FALL BACK ---");
check("the /\\ bug (Finding 4)", safeNext("/\\evil.com"), "/dashboard");
check("protocol-relative", safeNext("//evil.com"), "/dashboard");
check("absolute offsite", safeNext("https://evil.com/x"), "/dashboard");
check("suffix lookalike domain", safeNext("https://citreasurehunt.com.evil.com/x"), "/dashboard");
check("javascript scheme", safeNext("javascript:alert(1)"), "/dashboard");
check("empty", safeNext(""), "/dashboard");
check("null", safeNext(null), "/dashboard");

console.log("--- safeNext: must PASS THROUGH ---");
check("plain path", safeNext("/dashboard"), "/dashboard");
check("admin path", safeNext("/admin/events"), "/admin/events");
check("path with query+hash", safeNext("/events/x?a=1#b"), "/events/x?a=1#b");
check("absolute same-origin -> path", safeNext("https://citreasurehunt.com/admin/events"), "/admin/events");
check("custom fallback honoured", safeNext("//evil.com", "/admin/events"), "/admin/events");

console.log("--- isPrivateIp: SSRF protection ---");
check("loopback ipv4", isPrivateIp("127.0.0.1"), true);
check("loopback ipv6", isPrivateIp("::1"), true);
check("loopback brackets", isPrivateIp("[::1]"), true);
check("unspecified ipv6", isPrivateIp("::"), true);
check("cloud metadata ipv4", isPrivateIp("169.254.169.254"), true);
check("cloud metadata mapped ipv6", isPrivateIp("::ffff:169.254.169.254"), true);
check("cloud metadata mapped ipv6 hex form", isPrivateIp("::ffff:a9fe:a9fe"), true);
check("cloud metadata nat64 dotted", isPrivateIp("64:ff9b::169.254.169.254"), true);
check("cloud metadata nat64 hex form", isPrivateIp("64:ff9b::a9fe:a9fe"), true);
check("cloud metadata mapped ipv6 with brackets", isPrivateIp("[::ffff:169.254.169.254]"), true);
check("loopback mapped ipv6", isPrivateIp("::ffff:127.0.0.1"), true);
check("private 10.0.0.0/8 mapped ipv6", isPrivateIp("::ffff:10.0.0.1"), true);
check("private 192.168.0.0/16 mapped ipv6", isPrivateIp("::ffff:192.168.1.1"), true);
check("private 172.16.0.0/12 mapped ipv6", isPrivateIp("::ffff:172.16.0.1"), true);
check("cgnat range ipv4", isPrivateIp("100.64.0.1"), true);
check("multicast ipv4", isPrivateIp("224.0.0.1"), true);
check("public ipv4", isPrivateIp("8.8.8.8"), false);
check("public ipv4 (1.1.1.1)", isPrivateIp("1.1.1.1"), false);
check("public ipv6 (Google DNS)", isPrivateIp("2001:4860:4860::8888"), false);
check("public mapped ipv6", isPrivateIp("::ffff:8.8.8.8"), false);

console.log("--- escapeHtml: XSS protection ---");
check("escapes script tag", escapeHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
check("escapes quotes", escapeHtml('hello "world" & \'test\''), "hello &quot;world&quot; &amp; &#39;test&#39;");
check("handles null/undefined", escapeHtml(null), "");

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
