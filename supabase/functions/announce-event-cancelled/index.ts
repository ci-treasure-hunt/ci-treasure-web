import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { slugify } from '../_shared/announce-format.ts'

const BOT_TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const CHAT_ID       = Deno.env.get('TELEGRAM_PUBLIC_CHAT_ID')!
const FESTIVAL_THREAD_ID = Number(Deno.env.get('TELEGRAM_PUBLIC_THREAD_ID')!)
const WORKSHOP_THREAD_IDS: Record<string, number> = {
  americas: Number(Deno.env.get('TELEGRAM_WORKSHOP_AMERICAS_THREAD_ID')!),
  emea:     Number(Deno.env.get('TELEGRAM_WORKSHOP_EMEA_THREAD_ID')!),
  apac:     Number(Deno.env.get('TELEGRAM_WORKSHOP_APAC_THREAD_ID')!),
}
const CHANNEL_CHAT = '@citreasurelist'

// Reacts to an event's first transition to cancelled = true (I-138 follow-up, 2026-07-21).
// Two independent effects, both best-effort — one failing doesn't block the other:
// 1. Group (thread-based, ephemeral): post a new "CANCELLED:" announcement, same style as
//    announce-event's "New:" — but ONLY if the event was actually announced there before
//    (checked via tg_announcements, not just status), otherwise this would read as
//    "cancelled: [event nobody ever saw]", more confusing than helpful.
// 2. Channel (@citreasurelist, permanent feed): edit the existing photo caption in place to
//    show a cancellation banner — same "visible marker, not silent removal" convention the
//    website uses (I-113's cancelled badge). Only if a channel post exists for this event.
//
// Duplicated helpers (CONTINENT_COUNTRIES, toFlag, formatDates, TYPE_EMOJI) rather than pulled
// from _shared/announce-format.ts — same convention as announce-event/announce-event-channel,
// which also keep their own copies of these. Only `slugify` is imported from _shared, to keep
// the event-URL-building logic in one place after it drifted out of sync here (2026-07-30).

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

function daySpan(start: string, end: string | null): number {
  if (!end) return 1
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T00:00:00Z')
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1
}

const TYPE_EMOJI: Record<string, string> = {
  jam: '🕺', long_jam: '🕺', workshop: '🛠', training: '🎓', festival: '🎪',
  retreat: '🌿', camp: '⛺', intensive: '💫', residency: '🏡', class: '📚',
  lab: '🔬', underscore: '⭕', cdp: '🌀', performance: '🎭', lecture: '🎤', other: '📌',
}

// The backslash MUST be in the escaped set, and in the same single pass as the others (I-165,
// flagged by CodeQL js/incomplete-sanitization). Without it the escaping is self-defeating: a
// title of "Contact \_Jam\_ Berlin" escapes to "Contact \\_Jam\\_ Berlin", which Telegram reads
// as a literal backslash followed by an *unescaped* underscore, so the organizer-controlled text
// still opens italics. Kept identical to the copy in announce-event/index.ts.
const escapeMarkdown = (s: string) => s.replace(/\[/g, '(').replace(/\]/g, ')').replace(/([\\_*`])/g, '\\$1')

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

Deno.serve(async (req) => {
  const { record: event, old_record } = await req.json()

  // Only fire on first transition to cancelled = true.
  if (old_record?.cancelled === true || event?.cancelled !== true) {
    return new Response('skip', { status: 200 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Shared location lookup (venue name + city if flagged show_in_announce, else city alone).
  // 2026-08-12: venue name is shown alongside the city, not instead of it — see
  // announce-event/index.ts for why the venue-only form was reverted.
  let location: string = event.city
  if (event.venue_id) {
    const { data: venue } = await supabase
      .from('venues')
      .select('show_in_announce, name, announce_name')
      .eq('id', event.venue_id)
      .single()
    if (venue?.show_in_announce) {
      location = `${venue.announce_name ?? venue.name}, ${event.city}`
    }
  }

  // --- Effect 1: group announcement, only if the event was actually announced there before ---
  const { data: groupAnnounced } = await supabase
    .from('tg_announcements')
    .select('id')
    .eq('entity_type', 'event')
    .eq('entity_id', event.id)
    .limit(1)

  const { data: alreadyCancelledPost } = await supabase
    .from('tg_announcements')
    .select('id')
    .eq('entity_type', 'event_cancelled')
    .eq('entity_id', event.id)
    .limit(1)

  if (groupAnnounced?.length && !alreadyCancelledPost?.length) {
    const title = escapeMarkdown(event.title)
    const loc   = escapeMarkdown(location)
    const url   = `https://citreasurehunt.com/events/${event.short_id}-${slugify(event.title)}`
    const reason = event.cancelled_text ? ` — ${event.cancelled_text}` : ''
    const text = `❌ CANCELLED: ${toFlag(event.country)} ${formatDates(event.start_date, event.end_date)} — [${title}](${url}), ${loc}${reason}`

    const days = daySpan(event.start_date, event.end_date)
    const threadId = days >= 4
      ? FESTIVAL_THREAD_ID
      : WORKSHOP_THREAD_IDS[regionFor(event.country) ?? ''] ?? FESTIVAL_THREAD_ID

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
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
    const tgData = await tgRes.json()
    if (tgData.ok) {
      await supabase.from('tg_announcements').insert({
        entity_type: 'event_cancelled',
        entity_id:   event.id,
        chat_id:     Number(CHAT_ID),
        thread_id:   threadId,
        message_id:  tgData.result.message_id,
      })
    } else {
      console.error('Group cancellation post failed:', JSON.stringify(tgData))
    }
  }

  // --- Effect 2: edit the channel post in place, only if one exists ---
  const { data: channelPost } = await supabase
    .from('tg_announcements')
    .select('message_id')
    .eq('entity_type', 'event_channel')
    .eq('entity_id', event.id)
    .limit(1)
    .maybeSingle()

  if (channelPost?.message_id) {
    const emoji = TYPE_EMOJI[event.type] ?? '📌'
    const lines = [
      '❌ CANCELLED',
      `${emoji} ${event.title}`,
      `${toFlag(event.country)} ${location}`,
      `📅 ${formatDates(event.start_date, event.end_date)}`,
    ]
    if (event.cancelled_text) lines.push('', event.cancelled_text)
    const caption = `${lines.join('\n')}\n\nhttps://citreasurehunt.com/events/${event.short_id}-${slugify(event.title)}`

    const editRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHANNEL_CHAT,
        message_id: channelPost.message_id,
        caption,
      }),
    })
    const editData = await editRes.json()
    if (!editData.ok) {
      console.error('Channel cancellation edit failed:', JSON.stringify(editData))
    }
  }

  return new Response('ok', { status: 200 })
})
