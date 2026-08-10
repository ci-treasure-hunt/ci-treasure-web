import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildRichCaption, TEACHER_ROLES, slugify } from '../_shared/announce-format.ts'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const CHAT_ID   = Deno.env.get('TELEGRAM_PUBLIC_CHAT_ID')!
const FESTIVAL_THREAD_ID  = Number(Deno.env.get('TELEGRAM_PUBLIC_THREAD_ID')!)
const WORKSHOP_THREAD_IDS: Record<string, number> = {
  americas: Number(Deno.env.get('TELEGRAM_WORKSHOP_AMERICAS_THREAD_ID')!),
  emea:     Number(Deno.env.get('TELEGRAM_WORKSHOP_EMEA_THREAD_ID')!),
  apac:     Number(Deno.env.get('TELEGRAM_WORKSHOP_APAC_THREAD_ID')!),
}

// Same three business regions as lib/continents.ts's CONTINENT_COUNTRIES — duplicated here
// because edge functions run standalone in Deno and can't import from lib/. Keep in sync if
// that list changes.
const CONTINENT_COUNTRIES: Record<string, string[]> = {
  americas: [
    "AG","AR","BB","BO","BR","BS","BZ","CA","CL","CO","CR","CU","DM","DO","EC","GD",
    "GT","GY","HN","HT","JM","KN","LC","MX","NI","PA","PE","PR","PY","SR","SV","TT",
    "US","UY","VC","VE",
  ],
  emea: [
    "AD","AL","AT","BA","BE","BG","BY","CH","CY","CZ","DE","DK","EE","ES","FI","FR",
    "GB","GR","HR","HU","IE","IS","IT","LI","LT","LU","LV","MC","MD","ME","MK","MT",
    "NL","NO","PL","PT","RO","RS","SE","SI","SK","SM","UA","XK",
    "AM","AZ","GE","RU",
    "TR",
    "AE","BH","IQ","IR","IL","JO","KW","LB","OM","PS","QA","SA","SY","YE",
    "AO","BF","BI","BJ","BW","CD","CF","CG","CI","CM","CV","DJ","DZ","EG","ER","ET",
    "GA","GH","GM","GN","GQ","GW","KE","KM","LR","LS","LY","MA","MG","ML","MR","MU",
    "MW","MZ","NA","NE","NG","RW","SC","SD","SL","SN","SO","SS","ST","SZ","TD","TG",
    "TN","TZ","UG","ZA","ZM","ZW",
  ],
  apac: [
    "AF","BD","BT","IN","LK","MV","NP","PK",
    "BN","ID","KH","LA","MM","MY","PH","SG","TH","TL","VN",
    "CN","HK","JP","KP","KR","MN","MO","TW",
    "KG","KZ","TJ","TM","UZ",
    "AU","FJ","NZ","PG","SB","TO","VU","WS",
  ],
}

function regionFor(country: string): string | null {
  for (const [region, codes] of Object.entries(CONTINENT_COUNTRIES)) {
    if (codes.includes(country)) return region
  }
  return null
}

// Day-span (inclusive), not nights: Thu-Sun = 4 days = festival topic; Fri-Sun = 3 days =
// regional workshop topic. Decided 2026-07-14.
function daySpan(start: string, end: string | null): number {
  if (!end) return 1
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1
}

Deno.serve(async (req) => {

  const { record: event, old_record } = await req.json()

  // Only fire when status transitions to 'published' for the first time
  if (old_record?.status === 'published' || event?.status !== 'published') {
    return new Response('skip', { status: 200 })
  }

  // Never announce backfilled/past events — this channel is for genuinely new, upcoming
  // events. A publish on something that already happened (e.g. a backfilled series module)
  // would read as "New:" on an event nobody can still attend.
  const today = new Date().toISOString().slice(0, 10)
  if (event.start_date < today) {
    return new Response('skip: past event', { status: 200 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Dedup: skip if already announced (e.g. webhook fired twice)
  const { data: existing } = await supabase
    .from('tg_announcements')
    .select('id')
    .eq('entity_type', 'event')
    .eq('entity_id', event.id)
    .limit(1)

  if (existing?.length) {
    return new Response('already announced', { status: 200 })
  }

  // Series de-dup: once any sibling in the same series has been announced, later siblings stay
  // silent here. Prevents a repeating-format series (e.g. a retreat run bimonthly under one
  // series_id) from posting one near-identical "New:" per date — found live 2026-07-25 adding
  // an 8-date Deep Contact retreat series. Only applies to series_type = 'recurring' (identical
  // format each time); 'sequential' series (distinct teacher/theme per module, e.g. Wallin Works,
  // Tom Goldhand's "Deep Dive into CI") skip this check and announce every module — found live
  // 2026-08-01 when FlAF/PwPl (modules 2-3 of Deep Dive into CI) were silently skipped after
  // module 1 announced, even though each module is materially different content.
  const { data: seriesRow } = event.series_id
    ? await supabase.from('event_series').select('series_type').eq('id', event.series_id).single()
    : { data: null }
  if (event.series_id && seriesRow?.series_type === 'recurring') {
    const { data: siblings } = await supabase
      .from('events')
      .select('id')
      .eq('series_id', event.series_id)
      .neq('id', event.id)
    const siblingIds = (siblings ?? []).map((s) => s.id)
    if (siblingIds.length) {
      const { data: siblingAnnounced } = await supabase
        .from('tg_announcements')
        .select('id')
        .eq('entity_type', 'event')
        .in('entity_id', siblingIds)
        .limit(1)
      if (siblingAnnounced?.length) {
        return new Response('skip: series sibling already announced', { status: 200 })
      }
    }
  }

  // Legacy Telegram Markdown treats _ * ` [ as formatting characters — an unescaped one
  // in organizer-controlled text (title, venue name) can break message parsing (send
  // fails) or bleed formatting into surrounding text. [ ] are replaced rather than
  // escaped since they sit inside the link label syntax itself.
  const escapeMarkdown = (s: string) => s.replace(/\[/g, '(').replace(/\]/g, ')').replace(/([_*`])/g, '\\$1')

  // Use "announce_name (if set) or venue name" for known venues; city otherwise. Revised
  // 2026-08-10 (NLit/Fools' Valley): dropped the ", City" suffix that was here from
  // 2026-07-23 — a venue distinctive enough to be flagged show_in_announce is, by definition,
  // more recognizable than the town it happens to sit in, so appending the city read as
  // redundant. Matches announce-event-cancelled's location logic, which never had the suffix.
  let location: string = event.city
  if (event.venue_id) {
    const { data: venue } = await supabase
      .from('venues')
      .select('show_in_announce, name, announce_name')
      .eq('id', event.venue_id)
      .single()
    if (venue?.show_in_announce) {
      location = venue.announce_name ?? venue.name
    }
  }

  // 4+ days -> festival topic, short one-liner. Fewer -> regional workshop topic by
  // event.country; falls back to the festival topic if the country isn't in any region
  // bucket (unmapped code) so an event never silently fails to announce.
  const days = daySpan(event.start_date, event.end_date)
  const isFestival = days >= 4
  const threadId = isFestival
    ? FESTIVAL_THREAD_ID
    : WORKSHOP_THREAD_IDS[regionFor(event.country) ?? ''] ?? FESTIVAL_THREAD_ID

  let tgRes: Response

  if (isFestival) {
    // Unchanged short one-liner — festivals already have a de facto "list" (this topic
    // itself reads as a running index), so a terse pointer is enough.
    const title = escapeMarkdown(event.title)
    const url   = `https://citreasurehunt.com/events/${event.short_id}-${slugify(event.title)}`
    const disciplines: string[] = event.discipline ?? []
    const isCi = disciplines.includes('contact_improvisation')
    const disciplineTag = !isCi && disciplines.length ? `[${disciplines.join(', ')}] ` : ''
    const text = `New: ${disciplineTag}${toFlag(event.country)} ${formatDates(event.start_date, event.end_date)} — [${title}](${url}), ${escapeMarkdown(location)}`

    tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        message_thread_id: threadId,
        text,
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      }),
    })
  } else {
    // 2026-07-22: 2-3 day workshops have no equivalent "list" anywhere else to fall back
    // on, so they get the same rich photo-card format as the public channel instead of a
    // terse line — see docs/issues/i-085-organizer-outreach.md discussion. Falls back to a
    // text-only sendMessage with the same caption when there's no image, rather than
    // skipping outright (unlike the channel's photo-first design) — a workshop with no
    // photo still deserves a real announcement, since this topic is its only visibility.
    const { data: teacherRows } = await supabase
      .from('event_teachers')
      .select('role, profiles(name)')
      .eq('event_id', event.id)
    const teacherNames = [...new Set(
      (teacherRows ?? [])
        .filter((row: { role: string }) => TEACHER_ROLES.has(row.role))
        // deno-lint-ignore no-explicit-any
        .map((row: any) => row.profiles?.name)
        .filter(Boolean),
    )]
    const caption = buildRichCaption(event, teacherNames, location)

    tgRes = event.image_url
      ? await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            message_thread_id: threadId,
            photo: event.image_url,
            caption,
            parse_mode: 'HTML',
          }),
        })
      : await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: CHAT_ID,
            message_thread_id: threadId,
            text: caption,
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
          }),
        })
  }

  const tgData = await tgRes.json()

  if (!tgData.ok) {
    console.error('Telegram error:', JSON.stringify(tgData))
    return new Response('telegram error', { status: 500 })
  }

  await supabase.from('tg_announcements').insert({
    entity_type: 'event',
    entity_id:   event.id,
    chat_id:     Number(CHAT_ID),
    thread_id:   threadId,
    message_id:  tgData.result.message_id,
  })

  console.log(`Announced: ${event.short_id} — ${event.title}`)
  return new Response('ok', { status: 200 })
})

function toFlag(code: string): string {
  return [...code.toUpperCase()].map(c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397),
  ).join('')
}

function formatDates(start: string, end: string | null): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const s = new Date(start + 'T00:00:00Z')
  const sm = MONTHS[s.getUTCMonth()], sd = s.getUTCDate()
  if (!end || end === start) return `${sm} ${sd}`
  const e  = new Date(end + 'T00:00:00Z')
  const em = MONTHS[e.getUTCMonth()], ed = e.getUTCDate()
  return s.getUTCMonth() === e.getUTCMonth()
    ? `${sm} ${sd}-${ed}`
    : `${sm} ${sd}-${em} ${ed}`
}
