// Admin Telegram notifications that are called from server code only.
//
// I-166 F3: this deliberately has NO "use server" directive. Every exported async function in a
// "use server" module becomes a callable HTTP endpoint that anyone who learns its action id can
// POST to, and the authorization of whatever calls it internally does not protect it.
// notifyAdminTeacherAdded lived in app/events/actions.ts, which is such a module. It takes five
// caller-supplied strings and posts them into the admin group, interpolating one into a URL that
// Telegram auto-links, so as a reachable endpoint it would have been an unauthenticated way to put
// arbitrary text and arbitrary links into a channel we trust.
//
// It was not actually reachable, because Next.js only registers an action as an endpoint when it
// is referenced from a client boundary and this one is only ever called server-side (checked
// against the build's server-reference-manifest.json: 44 registered actions, this not among them).
// The problem was that it would have armed itself silently the first time anyone imported it into
// a client component. Living here, it cannot.
//
// Anything added to this file must stay server-only. If a notification ever genuinely needs to be
// triggered from the browser, it needs its own authorization check, not a move back into an
// actions module.

const EVENT_THREAD_ID = Number(process.env.TELEGRAM_EVENT_THREAD_ID ?? 685);

export async function notifyAdminTeacherAdded(
  organizerName: string,
  teacherName: string,
  role: string,
  eventTitle: string,
  shortId: string,
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return;

  const text = `👥 ${organizerName} added ${teacherName} as ${role} to ${eventTitle} — https://citreasurehunt.com/events/${shortId}`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: EVENT_THREAD_ID,
      text,
      link_preview_options: { is_disabled: true },
    }),
  });
}
