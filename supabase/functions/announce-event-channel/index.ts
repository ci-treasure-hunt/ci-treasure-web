import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildRichCaption, TEACHER_ROLES } from '../_shared/announce-format.ts'

const BOT_TOKEN    = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const CHANNEL_CHAT = '@citreasurelist'

// Public channel — richer than the group message (I-018a's announce-event): a photo card with
// price/level/teachers, not a terse one-liner. See docs/issues/i-138-multichannel-event-distribution.md
// for the full design rationale (why each field is/isn't included, why each emoji was picked).
// Caption format shared with announce-event's workshop path — see _shared/announce-format.ts.

Deno.serve(async (req) => {
  const { record: event, old_record } = await req.json()

  // Only fire on first transition to 'published' — same guard as announce-event (I-018a).
  if (old_record?.status === 'published' || event?.status !== 'published') {
    return new Response('skip', { status: 200 })
  }

  // Hard safety gate: never post a cancelled event, regardless of anything else.
  if (event.cancelled) {
    return new Response('skip: cancelled', { status: 200 })
  }

  // Never announce backfilled/past events — same guard as announce-event (I-018a).
  const today = new Date().toISOString().slice(0, 10)
  if (event.start_date < today) {
    return new Response('skip: past event', { status: 200 })
  }

  // No image, no post — this format is photo-first, unlike the group's text-only message.
  if (!event.image_url) {
    return new Response('skip: no image', { status: 200 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Dedup, and distinguish from the group's tg_announcements rows so cleanup-tg-messages
  // (which deletes anything older than 7 days) doesn't sweep up permanent channel posts —
  // see the fix to that function in this same change.
  const { data: existing } = await supabase
    .from('tg_announcements')
    .select('id')
    .eq('entity_type', 'event_channel')
    .eq('entity_id', event.id)
    .limit(1)

  if (existing?.length) {
    return new Response('already announced', { status: 200 })
  }

  // Series de-dup: same guard as announce-event — see that file for the full reasoning. Once any
  // sibling in the same series has been announced (on this channel), later siblings stay silent.
  if (event.series_id) {
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
        .eq('entity_type', 'event_channel')
        .in('entity_id', siblingIds)
        .limit(1)
      if (siblingAnnounced?.length) {
        return new Response('skip: series sibling already announced', { status: 200 })
      }
    }
  }

  // Venue name (if flagged show_in_announce) is shown alongside the city — same convention as
  // announce-event and announce-event-cancelled. Revised 2026-08-12: restored the ", City"
  // suffix dropped 2026-08-10 (NLit/Fools' Valley) — that assumed a show_in_announce venue is
  // always more recognizable than its town, which broke down for venues like Dance Base/Laban
  // Building whose name doesn't place them for readers outside that local CI scene.
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

  const { data: teacherRows } = await supabase
    .from('event_teachers')
    .select('role, profiles(name)')
    .eq('event_id', event.id)

  // profiles(name) is a to-one join, but the untyped Supabase client infers it as an array —
  // runtime shape is a single object (per the ?.name access), so cast rather than fight it.
  type TeacherRow = { role: string; profiles: { name: string } | null }
  const teacherNames = [...new Set(
    ((teacherRows ?? []) as unknown as TeacherRow[])
      .filter(row => TEACHER_ROLES.has(row.role))
      .map(row => row.profiles?.name)
      .filter(Boolean),
  )]

  const caption = buildRichCaption(event, teacherNames, location)

  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHANNEL_CHAT,
      photo: event.image_url,
      caption,
      parse_mode: 'HTML',
    }),
  })
  const tgData = await tgRes.json()

  if (!tgData.ok) {
    console.error('Telegram error:', JSON.stringify(tgData))
    return new Response('telegram error', { status: 500 })
  }

  await supabase.from('tg_announcements').insert({
    entity_type: 'event_channel',
    entity_id:   event.id,
    chat_id:     tgData.result.chat.id,
    message_id:  tgData.result.message_id,
  })

  console.log(`Channel-announced: ${event.short_id} — ${event.title}`)
  return new Response('ok', { status: 200 })
})
