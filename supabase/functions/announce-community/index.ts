import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { escapeHtml, toFlag } from '../_shared/announce-format.ts'
import { communityDisplayName as displayName } from '../_shared/community-name.ts'

// I-029 (2026-10-15, lists automated 2026-10-17): when a community goes live, Steve posts what Jan
// used to type by hand.
//   1. Communities topic (t.me/citreasurehunt/13): "✨☝️🇫🇷 Oriu (Poitiers) new on the list☝️✨"
//   2. Chat links topic (t.me/citreasurehunt/30), only if the community has a chat group:
//      "✨☝️🇬🇧 Oxford Contact Dance (WhatsApp) new on the list☝️✨"
// The regional lists themselves are Steve's own messages, kept current by sync-community-lists:
// called right after the announcement, plus every 6 hours for edits. The lines carry no links.

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const CHAT_ID = Deno.env.get('TELEGRAM_PUBLIC_CHAT_ID')!
const WEBHOOK_SECRET = Deno.env.get('ANNOUNCE_WEBHOOK_SECRET')!
const COMMUNITY_THREAD_ID = Number(Deno.env.get('TELEGRAM_COMMUNITY_THREAD_ID')!)
const CHATS_THREAD_ID = Number(Deno.env.get('TELEGRAM_CHATS_THREAD_ID')!)
const ADMIN_CHAT_ID = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID')!
const ADMIN_PASTE_THREAD_ID = Number(Deno.env.get('TELEGRAM_ADMIN_PASTE_THREAD_ID')!)

// Same symbols as the "Community types & symbols" block of the list overview
// (t.me/citreasurehunt/13/14). General is the default and gets no extra symbol on the
// announcement line ("🇫🇷 Oriu"), only the others do ("🇪🇸👥 Ara en Moviment").
const TYPE_EMOJI: Record<string, string> = {
  'General CI Community': '🌀',
  'Jam Series': '🔄',
  'Collective': '👥',
  'Festival': '🎪',
  'CI Training': '🎓',
  'Teacher Network or Channel': '👤',
  'Studio or Space': '🏠',
  'Other': '📦',
}
const DEFAULT_TYPE = 'General CI Community'

const PLATFORM_LABEL: Record<string, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  line: 'LINE',
}

type Community = {
  id: string
  slug: string
  name: string
  type: string | null
  city: string | null
  country: string | null
  region: string | null
  status: string
  website: string | null
  telegram_group: string | null
  telegram_channel: string | null
  whatsapp_channel: string | null
  facebook_group: string | null
  facebook_page: string | null
  instagram: string | null
  youtube: string | null
  calendar: string | null
  newsletter: string | null
  other_resource: string | null
}

type Invite = { platform: string; url: string }

function flagFor(c: Community): string {
  return c.country ? toFlag(c.country) : '🌐'
}

async function send(chatId: string, threadId: number, text: string): Promise<number | null> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_thread_id: threadId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    }),
  })
  const data = await res.json()
  if (!data.ok) {
    console.error('Telegram error:', JSON.stringify(data))
    return null
  }
  return data.result.message_id
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }

  const body = await req.json()
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Preview mode: {"preview": true, "community_id": "..."} posts what the two public lines would say
  // into the admin topic only, and records nothing. For testing.
  const preview = body.preview === true
  const id: string | undefined = preview ? body.community_id : body.record?.id

  if (!preview) {
    const { record, old_record, type } = body
    // Only the first transition to published: approval of a pending submission (UPDATE), or a
    // community the admin form creates as published directly (INSERT). Same guard as the trigger.
    if (record?.status !== 'published' || (type === 'UPDATE' && old_record?.status === 'published')) {
      return new Response('skip', { status: 200 })
    }
    // The admin form saves the community row first and its invite links in a second request.
    // pg_net fires after the first commit, so give the invites a moment to land.
    if (type === 'INSERT') await new Promise(r => setTimeout(r, 5000))
  }
  if (!id) return new Response('missing community id', { status: 400 })

  const { data: c } = await supabase.from('communities').select('*').eq('id', id).single<Community>()
  if (!c) return new Response('community not found', { status: 404 })

  if (!preview) {
    const { data: existing } = await supabase
      .from('tg_announcements').select('id')
      .eq('entity_type', 'community').eq('entity_id', c.id).limit(1)
    if (existing?.length) return new Response('already announced', { status: 200 })
  }

  const { data: inviteRows } = await supabase
    .from('community_invites').select('platform, url').eq('community_id', c.id).is('broken_since', null)
  const invites = ((inviteRows ?? []) as Invite[]).filter(i => PLATFORM_LABEL[i.platform])

  const flag = flagFor(c)
  const typeEmoji = c.type && c.type !== DEFAULT_TYPE ? (TYPE_EMOJI[c.type] ?? '') : ''
  const name = escapeHtml(displayName(c))

  // Chat platforms for the chat-links line, in a stable order. A public Telegram group link on the
  // community row counts too, not only invites.
  const chats: { platform: string; url: string; isChannel: boolean }[] = []
  const tgInvite = invites.find(i => i.platform === 'telegram')?.url ?? c.telegram_group
  if (tgInvite) chats.push({ platform: 'telegram', url: tgInvite, isChannel: false })
  if (c.telegram_channel) chats.push({ platform: 'telegram', url: c.telegram_channel, isChannel: true })
  for (const p of ['whatsapp', 'signal', 'line']) {
    const inv = invites.find(i => i.platform === p)
    if (inv) chats.push({ platform: p, url: inv.url, isChannel: false })
  }
  const chatLabels = [...new Set(chats.map(ch => PLATFORM_LABEL[ch.platform]))]

  const communityLine = `✨☝️${flag}${typeEmoji} ${name} new on the list☝️✨`
  const chatLine = chatLabels.length
    ? `✨☝️${flag}${typeEmoji} ${name} (${chatLabels.join(', ')}) new on the list☝️✨`
    : null

  const sent: { entity_type: string; chat_id: number; thread_id: number; message_id: number }[] = []
  if (preview) {
    await send(ADMIN_CHAT_ID, ADMIN_PASTE_THREAD_ID, ['🔍 PREVIEW, the public lines would be:', communityLine, ...(chatLine ? [chatLine] : [])].join('\n'))
  } else {
    const m1 = await send(CHAT_ID, COMMUNITY_THREAD_ID, communityLine)
    if (m1 === null) return new Response('telegram error', { status: 500 })
    sent.push({ entity_type: 'community', chat_id: Number(CHAT_ID), thread_id: COMMUNITY_THREAD_ID, message_id: m1 })
    if (chatLine) {
      const m2 = await send(CHAT_ID, CHATS_THREAD_ID, chatLine)
      if (m2 !== null) sent.push({ entity_type: 'community_chat', chat_id: Number(CHAT_ID), thread_id: CHATS_THREAD_ID, message_id: m2 })
    }
  }

  if (sent.length) {
    await supabase.from('tg_announcements').insert(sent.map(s => ({ ...s, entity_id: c.id })))
  }

  // The new community goes into Steve's lists right away instead of at the next 6-hourly sync.
  if (!preview) {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-community-lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WEBHOOK_SECRET}` },
      body: JSON.stringify({ target: 'live' }),
    }).catch(e => { console.error('list sync failed:', e); return null })
    if (res && !res.ok) console.error('list sync failed:', res.status, await res.text())
  }

  console.log(`${preview ? 'Previewed' : 'Announced'} community: ${c.slug}`)
  return new Response('ok', { status: 200 })
})
