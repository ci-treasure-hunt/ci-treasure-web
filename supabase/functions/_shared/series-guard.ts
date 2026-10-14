import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Series de-dup for announce-event (entity_type 'event') and announce-event-channel
// ('event_channel'). Decided 2026-10-14 (I-171 DEC-7b): a later date of a series stays silent only
// when an already-announced sibling has the same title AND the same credited people. That is what
// "near-identical post" actually means, and it no longer depends on series_type:
//
// - Deep Contact Retreaton, a weekly jam: same title, same people -> suppressed (the 2026-07-25
//   spam this guard was written for).
// - CI on Saturday at SerVivo: one series, a different guest teacher each date -> announced. The
//   old any-sibling rule silently swallowed V4cx/lhUg because the September date had posted.
// - Sequential modules (Deep Dive into CI) and yearly editions: distinct titles -> announced. The
//   group already special-cased sequential via series_type; the channel never did and suppressed
//   them too. series_type was also the reason the Deep Contact guard never fired while it was
//   mistyped, which is why the rule stopped reading it.
//
// Includes announcement rows whose message was since deleted (cleanup-tg-messages), same as before:
// "already announced once" is the fact that matters, not whether the post is still up.
//
// Also counts an *earlier-dated* identical sibling that is already published, announced or not
// (added the same day, I-171 Stage 4). A trusted organizer's weekly jam, or an admin publishing a
// batch of dates, flips many rows to published in one statement; their webhooks then run in
// parallel and none sees another's tg_announcements row yet. Ordering by start date makes it
// deterministic: only the earliest date of the batch posts.
export async function sameSiblingAlreadyAnnounced(
  supabase: SupabaseClient,
  event: { id: string; title: string; start_date: string; series_id?: string | null },
  entityType: 'event' | 'event_channel',
): Promise<boolean> {
  if (!event.series_id) return false

  const normalize = (title: string) => title.trim().toLowerCase()
  const { data: siblings } = await supabase
    .from('events')
    .select('id, title, start_date, status')
    .eq('series_id', event.series_id)
    .neq('id', event.id)
  const sameTitle = (siblings ?? []).filter((s) => normalize(s.title) === normalize(event.title))
  const sameTitleIds = sameTitle.map((s) => s.id as string)
  if (!sameTitleIds.length) return false
  const earlierPublishedIds = sameTitle
    .filter((s) => s.status === 'published' && s.start_date < event.start_date)
    .map((s) => s.id as string)

  const { data: announced } = await supabase
    .from('tg_announcements')
    .select('entity_id')
    .eq('entity_type', entityType)
    .in('entity_id', sameTitleIds)
  const announcedIds = [...new Set([...(announced ?? []).map((a) => a.entity_id as string), ...earlierPublishedIds])]
  if (!announcedIds.length) return false

  const { data: credits } = await supabase
    .from('event_teachers')
    .select('event_id, teacher_id')
    .in('event_id', [event.id, ...announcedIds])
  const peopleOf = (eventId: string) =>
    (credits ?? [])
      .filter((c) => c.event_id === eventId)
      .map((c) => c.teacher_id as string)
      .sort()
      .join(',')

  const mine = peopleOf(event.id)
  return announcedIds.some((id) => peopleOf(id) === mine)
}
