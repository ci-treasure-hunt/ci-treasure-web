import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// I-171 Stage 5, DEC-3b (2026-11-12): "Still running?" reminders for open-ended recurring series.
//
// A series is open-ended when event_series.recurrence_rule is set (the organizer picked "It keeps
// going, no end date", or an admin set a pattern). Nothing extends it automatically: about four
// weeks before its last date, and again one week before, the owner gets an email with a one-click
// link to /series/renew/<token>, where a button adds the next six months (lib/series-renewal.ts in
// the web app). No answer, and the dates run out; the nightly archive job ends the listing.
//
// Owner: the user who owns the series' last date (events.user_id), else the series creator, else
// a signed-up organizer linked to the last date. A series without one gets no email; it shows up
// under "Ending within four weeks" in /admin/series instead.
//
// State per series in event_series_renewals (deny-all, service role): token, reminder_count,
// last_date. A different last date than the one reminded about (dates added by hand) starts over.
// Body {"dryRun": true} reports who would be emailed without sending or writing. Scheduled daily
// at 07:00 UTC by pg_cron (migration 20261112120000), same bearer secret as check-invite-links.

const WEBHOOK_SECRET = Deno.env.get('ANNOUNCE_WEBHOOK_SECRET')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const ADMIN_CHAT_ID = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID')
const ADMIN_PASTE_THREAD_ID = Number(Deno.env.get('TELEGRAM_ADMIN_PASTE_THREAD_ID') ?? '')
const SITE = 'https://citreasurehunt.com'
const FROM = 'CI Treasure Hunt <hello@citreasurehunt.com>'

const FIRST_REMINDER_DAYS = 28
const SECOND_REMINDER_DAYS = 7

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

function formatDay(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

function emailText(title: string, lastDate: string, link: string, second: boolean) {
  return [
    'Hi,',
    '',
    `${title} is listed on CI Treasure Hunt until ${formatDay(lastDate)}.`,
    second
      ? 'That is next week, so this is our last reminder.'
      : 'Since it has no end date, we check in before the dates run out.',
    '',
    'Is it still running? One click adds the next six months, with the same day, time, place and teachers:',
    link,
    '',
    'If it has stopped, you do not need to do anything: the listing simply ends after its last date.',
    'You can also extend it any time from your dashboard.',
    '',
    'Thank you for keeping the listing up to date!',
    'Jan, CI Treasure Hunt',
  ].join('\n')
}

async function sendEmail(to: string, subject: string, text: string): Promise<string | null> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, text }),
  })
  if (res.ok) return null
  return `Resend ${res.status}: ${await res.text().catch(() => '')}`
}

async function tgReport(text: string) {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) return
  const body: Record<string, unknown> = { chat_id: ADMIN_CHAT_ID, text, disable_web_page_preview: true }
  if (Number.isFinite(ADMIN_PASTE_THREAD_ID) && ADMIN_PASTE_THREAD_ID > 0) body.message_thread_id = ADMIN_PASTE_THREAD_ID
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).catch(() => {})
}

type Outcome = { series: string; lastDate: string; reminder: number; to?: string; result: string }

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const dryRun = Boolean(body?.dryRun)
  if (!RESEND_API_KEY && !dryRun) return new Response('RESEND_API_KEY is not set', { status: 500 })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const today = todayIso()
  const outcomes: Outcome[] = []

  const { data: seriesRows, error } = await supabase
    .from('event_series')
    .select('id, title, created_by, recurrence_rule')
    .not('recurrence_rule', 'is', null)
  if (error) return new Response(error.message, { status: 500 })

  for (const series of seriesRows ?? []) {
    const { data: last } = await supabase
      .from('events')
      .select('id, start_date, user_id, title')
      .eq('series_id', series.id)
      .neq('status', 'rejected')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!last || last.start_date < today) continue
    const daysLeft = daysBetween(today, last.start_date)
    if (daysLeft > FIRST_REMINDER_DAYS) continue

    const { data: state } = await supabase
      .from('event_series_renewals')
      .select('reminder_count, last_date')
      .eq('series_id', series.id)
      .maybeSingle()
    const sent = state && state.last_date === last.start_date ? state.reminder_count : 0
    const reminder = sent === 0 ? 1 : sent === 1 && daysLeft <= SECOND_REMINDER_DAYS ? 2 : 0
    if (!reminder) continue

    // Owner: the last date's submitter, the series creator, or a signed-up organizer of the last date.
    let ownerId: string | null = last.user_id ?? series.created_by ?? null
    if (!ownerId) {
      const { data: orgs } = await supabase
        .from('event_organizers')
        .select('profiles(user_id)')
        .eq('event_id', last.id)
        .not('organizer_id', 'is', null)
      for (const o of (orgs ?? []) as Array<{ profiles: { user_id: string | null } | Array<{ user_id: string | null }> | null }>) {
        const p = Array.isArray(o.profiles) ? o.profiles[0] : o.profiles
        if (p?.user_id) { ownerId = p.user_id; break }
      }
    }
    if (!ownerId) {
      outcomes.push({ series: series.title, lastDate: last.start_date, reminder, result: 'no owner (admin view)' })
      continue
    }
    const { data: owner } = await supabase.auth.admin.getUserById(ownerId)
    const to = owner?.user?.email
    if (!to) {
      outcomes.push({ series: series.title, lastDate: last.start_date, reminder, result: 'owner has no email' })
      continue
    }

    if (dryRun) {
      outcomes.push({ series: series.title, lastDate: last.start_date, reminder, to, result: 'would send' })
      continue
    }

    const token = crypto.randomUUID()
    const failure = await sendEmail(
      to,
      reminder === 2 ? `Last reminder: is ${series.title} still running?` : `Still running? ${series.title}`,
      emailText(series.title, last.start_date, `${SITE}/series/renew/${token}`, reminder === 2),
    )
    if (failure) {
      console.error(series.id, failure)
      outcomes.push({ series: series.title, lastDate: last.start_date, reminder, to, result: failure })
      continue
    }
    const { error: upsertError } = await supabase.from('event_series_renewals').upsert({
      series_id: series.id,
      token,
      reminder_count: reminder,
      reminded_at: new Date().toISOString(),
      last_date: last.start_date,
      updated_at: new Date().toISOString(),
    })
    outcomes.push({
      series: series.title, lastDate: last.start_date, reminder, to,
      result: upsertError ? `sent, but state not saved: ${upsertError.message}` : 'sent',
    })
  }

  if (!dryRun && outcomes.length) {
    await tgReport(
      ['🔁 Series renewal reminders', ...outcomes.map((o) => `• ${o.series} (last ${o.lastDate}), reminder ${o.reminder}: ${o.result}`)].join('\n'),
    )
  }

  return new Response(JSON.stringify({ dryRun, today, outcomes }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
})
