import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${SERVICE_KEY}`) {
    return new Response('unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // An allowlist, not a denylist, so a new entity type is never deleted by accident: the
  // group-thread event announcements, and the public "new on the list" community lines (I-029,
  // 2026-10-15; Jan removed his manual ones after a week too). Not deleted: event_channel rows
  // (the public TG channel, I-138, a permanent feed) and community_admin rows (the admin
  // copy-paste lines, which stay until Jan has pasted them).
  const { data: rows, error } = await supabase
    .from('tg_announcements')
    .select('id, chat_id, message_id')
    .in('entity_type', ['event', 'event_cancelled', 'community', 'community_chat'])
    .lt('sent_at', cutoff)
    .is('deleted_at', null)

  if (error) {
    console.error('DB error:', error)
    return new Response('db error', { status: 500 })
  }

  let deleted = 0
  for (const row of rows ?? []) {
    const res  = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: row.chat_id.toString(), message_id: row.message_id }),
    })
    const data = await res.json()

    // ok = deleted; 400 + "not found" = already gone (manually deleted) → treat as done
    // 400 + other description = permission error → log visibly, do NOT mark deleted
    const alreadyGone = !data.ok && data.error_code === 400 &&
      (data.description ?? '').toLowerCase().includes('not found')
    if (data.ok || alreadyGone) {
      await supabase
        .from('tg_announcements')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', row.id)
      deleted++
    } else {
      console.error('TG delete failed:', row.message_id, JSON.stringify(data))
    }
  }

  const summary = `Deleted ${deleted}/${rows?.length ?? 0} messages`
  console.log(summary)
  return new Response(summary, { status: 200 })
})
