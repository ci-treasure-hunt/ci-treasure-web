import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { escapeHtml, toFlag } from '../_shared/announce-format.ts'

// I-029 stage 1 (2026-10-15): when a community goes live, Steve posts what Jan used to type by
// hand.
//   1. Communities topic (t.me/citreasurehunt/13): "✨☝️🇫🇷 Oriu (Poitiers) new on the list☝️✨"
//   2. Chat links topic (t.me/citreasurehunt/30), only if the community has a chat group:
//      "✨☝️🇬🇧 Oxford Contact Dance (WhatsApp) new on the list☝️✨"
//   3. Admin group, copy-paste topic (t.me/c/3802325852/84): the ready-made lines for the
//      regional community list and the chat lists, one message per line so each can be copied
//      whole on a phone. Steve can't edit the lists themselves yet (they're Jan's messages, and a
//      bot can only edit its own); that is stage 3 in docs/issues/i-029-tg-community-lists.md.
//
// Invite links: the Telegram lists show every invite we hold, published on the website or not
// (Jan, 2026-10-15). The public lines (1, 2) carry no links at all; only the admin paste lines do.

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

// communities.region (lib/community-regions.ts) → the regional list it belongs in. The Telegram
// lists group a little more coarsely than the website's regions. Balkans and Russia & Belarus
// have no list of their own; Central & Eastern Europe is the closest.
const REGION_LIST: Record<string, string> = {
  'North America': 'US & Canada',
  'Central America & Caribbean': 'Latin America & Caribbean',
  'South America': 'Latin America & Caribbean',
  'Nordics & Baltics': 'Nordics & Baltics',
  'Central & Eastern Europe': 'Central & Eastern Europe',
  'Balkans': 'Central & Eastern Europe',
  'Russia & Belarus': 'Central & Eastern Europe',
  'Western Europe': 'Western Europe',
  'Southern Europe': 'Southern Europe',
  'Africa': 'Rest of EMEA',
  'West Asia & Caucasus': 'Rest of EMEA',
  'East Asia': 'Asia-Pacific',
  'Southeast Asia': 'Asia-Pacific',
  'South Asia': 'Asia-Pacific',
  'Central Asia': 'Asia-Pacific',
  'Oceania': 'Asia-Pacific',
  'Worldwide / International': 'Overview (Worldwide resources)',
}

// Which WhatsApp list a country goes in. Same Americas and Asia-Pacific sets as announce-event's
// CONTINENT_COUNTRIES (lib/continents.ts); everything else is Europe, Middle East & Africa.
const AMERICAS_APAC = new Set([
  'AG','AR','BB','BO','BR','BS','BZ','CA','CL','CO','CR','CU','DM','DO','EC','GD',
  'GT','GY','HN','HT','JM','KN','LC','MX','NI','PA','PE','PR','PY','SR','SV','TT',
  'US','UY','VC','VE',
  'AF','BD','BT','IN','LK','MV','NP','PK',
  'BN','ID','KH','LA','MM','MY','PH','SG','TH','TL','VN',
  'CN','HK','JP','KP','KR','MN','MO','TW',
  'KG','KZ','TJ','TM','UZ',
  'AU','FJ','NZ','PG','SB','TO','VU','WS',
])

const PLATFORM_LABEL: Record<string, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  line: 'LINE',
}

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })

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

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function countryName(iso: string | null): string | null {
  if (!iso) return null
  try { return countryNames.of(iso) ?? iso } catch { return iso }
}

// "Oriu (Poitiers)" but "Contact Improv Chiemgau", not "Contact Improv Chiemgau (Chiemgau)": the
// city is added only when the name doesn't already say where the group is. Country-level "cities"
// (city = "France", "United Kingdom") never get a suffix either.
function displayName(c: Community): string {
  const city = c.city?.trim()
  if (!city) return c.name
  const n = norm(c.name)
  const cty = norm(city)
  const country = countryName(c.country)
  if (n.includes(cty)) return c.name
  if (country && norm(country) === cty) return c.name
  if (['uk', 'usa', 'us', 'worldwide', 'online'].includes(cty)) return c.name
  return `${c.name} (${city})`
}

function flagFor(c: Community): string {
  return c.country ? toFlag(c.country) : '🌐'
}

function link(label: string, url: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`
}

// One line in the regional community list, same order of links as Jan's lists:
// "🌀 Name: Website | Telegram | WhatsApp | Facebook | Instagram | Calendar | Newsletter | Youtube"
function communityListLine(c: Community, invites: Invite[]): string {
  const parts: string[] = []
  if (c.website) parts.push(link('Website', c.website))
  else if (c.other_resource) parts.push(link('Website', c.other_resource))
  const tg = invites.find(i => i.platform === 'telegram')?.url ?? c.telegram_group
  if (tg) parts.push(link('Telegram', tg))
  if (c.telegram_channel) parts.push(link('Telegram Channel', c.telegram_channel))
  for (const p of ['whatsapp', 'signal', 'line']) {
    const inv = invites.find(i => i.platform === p)
    if (inv) parts.push(link(PLATFORM_LABEL[p], inv.url))
  }
  if (c.whatsapp_channel) parts.push(link('WhatsApp Channel', c.whatsapp_channel))
  if (c.facebook_group && c.facebook_page) {
    parts.push(link('Facebook Group', c.facebook_group), link('Facebook Page', c.facebook_page))
  } else if (c.facebook_group || c.facebook_page) {
    parts.push(link('Facebook', (c.facebook_group ?? c.facebook_page)!))
  }
  if (c.instagram) parts.push(link('Instagram', c.instagram.startsWith('http') ? c.instagram : `https://${c.instagram}`))
  if (c.calendar) parts.push(link('Calendar', c.calendar))
  if (c.newsletter) parts.push(link('Newsletter', c.newsletter))
  if (c.youtube) parts.push(link('Youtube', c.youtube))
  if (c.website && c.other_resource) parts.push(link('More', c.other_resource))
  const emoji = TYPE_EMOJI[c.type ?? DEFAULT_TYPE] ?? '🌀'
  return `${emoji} ${escapeHtml(c.name)}: ${parts.join(' | ') || '(no links)'}`
}

function chatListName(c: Community, platform: string, isChannel: boolean): string {
  if (platform === 'telegram') {
    const area = AMERICAS_APAC.has(c.country ?? '')
      ? (REGION_LIST[c.region ?? ''] === 'Asia-Pacific' ? 'Asia-Pacific' : 'Americas')
      : 'Europe, Middle East & Africa'
    return isChannel ? 'Telegram list → Telegram Channels' : `Telegram list → Telegram Groups ${area}`
  }
  if (platform === 'whatsapp') {
    return AMERICAS_APAC.has(c.country ?? '')
      ? 'WhatsApp Americas & Asia-Pacific'
      : 'WhatsApp Europe, Middle East & Africa'
  }
  return `Signal & LINE & Messenger list → ${PLATFORM_LABEL[platform]} groups`
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

  // Preview mode: {"preview": true, "community_id": "..."} posts everything into the admin paste
  // topic only, including what the two public lines would say, and records nothing. For testing,
  // and for re-creating the paste lines of an existing community.
  const preview = body.preview === true
  let id: string | undefined = preview ? body.community_id : body.record?.id

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
    .from('community_invites').select('platform, url').eq('community_id', c.id)
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

  // 1 + 2: public lines
  const sent: { entity_type: string; chat_id: number; thread_id: number; message_id: number }[] = []
  if (!preview) {
    const m1 = await send(CHAT_ID, COMMUNITY_THREAD_ID, communityLine)
    if (m1 === null) return new Response('telegram error', { status: 500 })
    sent.push({ entity_type: 'community', chat_id: Number(CHAT_ID), thread_id: COMMUNITY_THREAD_ID, message_id: m1 })
    if (chatLine) {
      const m2 = await send(CHAT_ID, CHATS_THREAD_ID, chatLine)
      if (m2 !== null) sent.push({ entity_type: 'community_chat', chat_id: Number(CHAT_ID), thread_id: CHATS_THREAD_ID, message_id: m2 })
    }
  }

  // 3: admin paste lines. A header saying where each line goes, then one message per line.
  const listName = REGION_LIST[c.region ?? ''] ?? `(no list for region "${c.region ?? 'none'}", pick by hand)`
  const country = countryName(c.country)
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' })
  const header = [
    `${preview ? '🔍 PREVIEW · ' : ''}📋 <b>${name}</b> ${flag}`,
    `citreasurehunt.com/communities/${escapeHtml(c.slug)}`,
    '',
    `🗂 Community list → <b>${escapeHtml(listName)}</b>${country ? ` · ${flag} ${escapeHtml(country)}` : ''}`,
    ...chats.map(ch => `⚡️ Chat list → <b>${escapeHtml(chatListName(c, ch.platform, ch.isChannel))}</b>`),
    '',
    `Last updated: ${today}`,
    ...(preview ? ['', 'Public lines would be:', communityLine, ...(chatLine ? [chatLine] : [])] : []),
  ].join('\n')

  const pasteMessages = [
    header,
    communityListLine(c, invites),
    ...chats.map(ch => `${flag}${typeEmoji} ${link(displayName(c), ch.url)}`),
  ]
  for (const text of pasteMessages) {
    const m = await send(ADMIN_CHAT_ID, ADMIN_PASTE_THREAD_ID, text)
    if (m !== null && !preview) {
      sent.push({ entity_type: 'community_admin', chat_id: Number(ADMIN_CHAT_ID), thread_id: ADMIN_PASTE_THREAD_ID, message_id: m })
    }
  }

  if (sent.length) {
    await supabase.from('tg_announcements').insert(sent.map(s => ({ ...s, entity_id: c.id })))
  }

  console.log(`${preview ? 'Previewed' : 'Announced'} community: ${c.slug}`)
  return new Response('ok', { status: 200 })
})
