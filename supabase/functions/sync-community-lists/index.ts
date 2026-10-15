import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { escapeHtml, toFlag } from '../_shared/announce-format.ts'

// I-029 stage 3: Steve maintains the Telegram community lists (topic 13) and chat-link lists
// (topic 30) himself. Renders every list from the communities table, compares it with the text he
// last posted (tg_list_messages), and posts or edits only what changed. A bot can only edit its own
// messages, so the lists are posted by Steve once and edited in place from then on, which keeps
// their t.me links valid. Spec: ci-treasure-hunt/docs/issues/i-029-tg-community-lists.md.
//
// POST body: {"target": "preview" | "live"}
//   preview: the admin group's mock topics (communities 913, chats 915), for dry runs
//   live:    the public group's topics 13 and 30
// Auth: the same bearer secret as the announce functions.
//
// The two overview messages (t.me/citreasurehunt/13/14 and 30/64) stay Jan's: they're linked from
// the welcome message and shared elsewhere, so reposting them would break those links. When a list
// message is posted for the first time, Steve sends Jan the updated overview block to paste.

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const WEBHOOK_SECRET = Deno.env.get('ANNOUNCE_WEBHOOK_SECRET')!
const PUBLIC_CHAT_ID = Deno.env.get('TELEGRAM_PUBLIC_CHAT_ID')!
const ADMIN_CHAT_ID = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID')!
const ADMIN_PASTE_THREAD_ID = Number(Deno.env.get('TELEGRAM_ADMIN_PASTE_THREAD_ID')!)

const TARGETS = {
  live: { chatId: PUBLIC_CHAT_ID, communities: 13, chats: 30, linkBase: 'https://t.me/citreasurehunt' },
  preview: { chatId: ADMIN_CHAT_ID, communities: 913, chats: 915, linkBase: 'https://t.me/c/3802325852' },
} as const

const COMMUNITY_OVERVIEW = 'https://t.me/citreasurehunt/13/14'
const CHAT_OVERVIEW = 'https://t.me/citreasurehunt/30/64'
const RULE = '——————————————————————-'

// Telegram drops formatting after 100 entities in one message, and every link is one. A list is
// split into parts at country boundaries before that; WARN_LINKS warns Jan early.
const MAX_LINKS = 95
const WARN_LINKS = 85
const MAX_CHARS = 3900

// ---------------------------------------------------------------------------------------------
// Lists. `countries` fixes the order of country sections; countries of a list's `regions` that
// aren't named are appended alphabetically, so a community from a new country still lands
// somewhere sensible. `areas` are city values of multi-country groups shown at the top
// ("CI Latinoamérica", city "Latin America"). Decided with Jan 2026-10-15.
type ListDef = {
  key: string
  title: string
  globe: string
  group: 'AMERICAS' | 'EUROPE, MIDDLE EAST & AFRICA' | 'ASIA-PACIFIC'
  countries: string[]
  regions?: string[]
  areas?: string[]
  alphabetical?: boolean
}

const LISTS: ListDef[] = [
  { key: 'us-canada', title: 'US & CANADA', globe: '🌎', group: 'AMERICAS', countries: ['CA', 'US'], regions: ['North America'] },
  { key: 'latin-america', title: 'LATIN AMERICA & CARIBBEAN', globe: '🌎', group: 'AMERICAS', countries: [], regions: ['Central America & Caribbean', 'South America'], areas: ['Latin America'], alphabetical: true },
  { key: 'nordics-baltics', title: 'NORDICS & BALTICS', globe: '🌍', group: 'EUROPE, MIDDLE EAST & AFRICA', countries: ['IS', 'NO', 'SE', 'DK', 'FI', 'EE', 'LV', 'LT'], regions: ['Nordics & Baltics'] },
  { key: 'uk-ireland', title: 'UK & IRELAND', globe: '🌍', group: 'EUROPE, MIDDLE EAST & AFRICA', countries: ['GB', 'IE'] },
  { key: 'france-benelux', title: 'FRANCE & BENELUX', globe: '🌍', group: 'EUROPE, MIDDLE EAST & AFRICA', countries: ['FR', 'BE', 'NL', 'LU'], regions: ['Western Europe'] },
  { key: 'germany', title: 'GERMANY', globe: '🌍', group: 'EUROPE, MIDDLE EAST & AFRICA', countries: ['DE'] },
  { key: 'austria-switzerland', title: 'AUSTRIA & SWITZERLAND', globe: '🌍', group: 'EUROPE, MIDDLE EAST & AFRICA', countries: ['AT', 'CH', 'LI'] },
  { key: 'central-eastern-europe', title: 'CENTRAL & EASTERN EUROPE', globe: '🌍', group: 'EUROPE, MIDDLE EAST & AFRICA', countries: [], regions: ['Central & Eastern Europe', 'Balkans'], alphabetical: true },
  { key: 'spain-portugal', title: 'SPAIN & PORTUGAL', globe: '🌍', group: 'EUROPE, MIDDLE EAST & AFRICA', countries: ['ES', 'PT', 'AD'] },
  { key: 'italy-greece-malta', title: 'ITALY, GREECE & MALTA', globe: '🌍', group: 'EUROPE, MIDDLE EAST & AFRICA', countries: ['IT', 'GR', 'MT', 'SM', 'CY'], regions: ['Southern Europe'] },
  { key: 'russia-caucasus-mideast-africa', title: 'RUSSIA, CAUCASUS, MIDDLE EAST & AFRICA', globe: '🌍', group: 'EUROPE, MIDDLE EAST & AFRICA', countries: ['RU', 'BY', 'GE', 'AM', 'AZ', 'TR', 'IL', 'AE'], regions: ['Russia & Belarus', 'West Asia & Caucasus', 'Africa'] },
  { key: 'asia', title: 'ASIA', globe: '🌏', group: 'ASIA-PACIFIC', countries: [], regions: ['East Asia', 'Southeast Asia', 'South Asia', 'Central Asia'], areas: ['Asia'], alphabetical: true },
  { key: 'australia-nz', title: 'AUSTRALIA & NEW ZEALAND', globe: '🌏', group: 'ASIA-PACIFIC', countries: ['AU', 'NZ'], regions: ['Oceania'] },
]

// Countries wide east-to-west are ordered east to west (Jan's US list runs Boston … LA);
// everywhere else north to south.
const EAST_TO_WEST = new Set(['US', 'CA', 'AU', 'RU'])

// Same symbols as the overview's legend. General gets 🌀 in the community lists (as Jan's do),
// but nothing on chat-list lines.
const TYPE_EMOJI: Record<string, string> = {
  'General CI Community': '🌀', 'Jam Series': '🔄', 'Collective': '👥', 'Festival': '🎪', 'CI Training': '🎓',
  'Teacher Network or Channel': '👤', 'Studio or Space': '🏠', 'Other': '📦',
}

// Country names as Jan writes them, where Intl differs.
const COUNTRY_NAME: Record<string, string> = {
  GB: 'UK', US: 'United States', CZ: 'Czech Republic', HK: 'Hong Kong (China)', AE: 'UAE', TR: 'Turkey', KR: 'South Korea',
  RU: 'Russia', MD: 'Moldova',
}
const intlNames = new Intl.DisplayNames(['en'], { type: 'region' })
function countryName(iso: string): string {
  if (COUNTRY_NAME[iso]) return COUNTRY_NAME[iso]
  try { return intlNames.of(iso) ?? iso } catch { return iso }
}

// Which chat list section a country falls in.
const AMERICAS = new Set(['AG','AR','BB','BO','BR','BS','BZ','CA','CL','CO','CR','CU','DM','DO','EC','GD','GT','GY','HN','HT','JM','KN','LC','MX','NI','PA','PE','PR','PY','SR','SV','TT','US','UY','VC','VE'])
const APAC = new Set(['AF','BD','BT','IN','LK','MV','NP','PK','BN','ID','KH','LA','MM','MY','PH','SG','TH','TL','VN','CN','HK','JP','KP','KR','MN','MO','TW','KG','KZ','TJ','TM','UZ','AU','FJ','NZ','PG','SB','TO','VU','WS'])
function area(c: Community): 'Americas' | 'Asia-Pacific' | 'EMEA' | 'Worldwide' {
  if (!c.country) {
    const city = norm(c.city ?? '')
    if (city.includes('latin') || city.includes('america')) return 'Americas'
    if (city.includes('asia') || city.includes('pacific')) return 'Asia-Pacific'
    return 'Worldwide'
  }
  if (AMERICAS.has(c.country)) return 'Americas'
  if (APAC.has(c.country)) return 'Asia-Pacific'
  return 'EMEA'
}

// ---------------------------------------------------------------------------------------------
type Community = {
  id: string; slug: string; name: string; type: string | null; city: string | null; country: string | null
  region: string | null; lat: number | null; lng: number | null
  website: string | null; telegram_group: string | null; telegram_channel: string | null; whatsapp_channel: string | null
  facebook_group: string | null; facebook_page: string | null; instagram: string | null; youtube: string | null
  calendar: string | null; newsletter: string | null; other_resource: string | null; other_resource_label: string | null
  invites: { platform: string; url: string }[]
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

// Same rule as announce-community: add the city unless the name already says where.
function displayName(c: Community): string {
  const city = c.city?.trim()
  if (!city) return c.name
  const cty = norm(city)
  if (norm(c.name).includes(cty)) return c.name
  if (c.country && norm(countryName(c.country)) === cty) return c.name
  if (c.country && norm(intlNames.of(c.country) ?? '') === cty) return c.name
  if (['uk', 'usa', 'us', 'worldwide', 'online', 'nationwide'].includes(cty)) return c.name
  return `${c.name} (${city})`
}

// Country-wide groups first: the city is the country itself, or the name carries the country.
function isCountryWide(c: Community): boolean {
  if (!c.country) return true
  const names = [countryName(c.country), intlNames.of(c.country) ?? ''].map(norm).filter(Boolean)
  const city = norm(c.city ?? '')
  return !city || names.includes(city) || names.some(n => norm(c.name).includes(n))
}

const isMessenger = (u: string) => /messenger\.com|m\.me\//i.test(u)
const withScheme = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`)
const a = (label: string, url: string) => `<a href="${escapeHtml(withScheme(url))}">${escapeHtml(label)}</a>`

function communityLine(c: Community): string {
  const inv = (p: string) => c.invites.find(i => i.platform === p)?.url
  const parts: string[] = []
  if (c.website) parts.push(a('Website', c.website))
  const tg = inv('telegram') ?? c.telegram_group
  if (tg && c.telegram_channel) parts.push(a('Telegram Group', tg), a('Telegram Channel', c.telegram_channel))
  else if (tg) parts.push(a('Telegram', tg))
  else if (c.telegram_channel) parts.push(a('Telegram', c.telegram_channel))
  if (inv('whatsapp')) parts.push(a('WhatsApp', inv('whatsapp')!))
  if (c.whatsapp_channel) parts.push(a('WhatsApp Channel', c.whatsapp_channel))
  if (inv('signal')) parts.push(a('Signal', inv('signal')!))
  if (inv('line')) parts.push(a('LINE', inv('line')!))
  if (c.facebook_group && c.facebook_page) parts.push(a('Facebook Group', c.facebook_group), a('Facebook Page', c.facebook_page))
  else if (c.facebook_group || c.facebook_page) parts.push(a('Facebook', (c.facebook_group ?? c.facebook_page)!))
  if (c.instagram) parts.push(a('Instagram', c.instagram))
  if (c.youtube) parts.push(a('Youtube', c.youtube))
  if (c.calendar) parts.push(a('Calendar', c.calendar))
  if (c.newsletter) parts.push(a('Newsletter', c.newsletter))
  if (c.other_resource) {
    parts.push(a(c.other_resource_label ?? (isMessenger(c.other_resource) ? 'Messenger' : 'More'), c.other_resource))
  }
  const emoji = TYPE_EMOJI[c.type ?? ''] ?? '🌀'
  return `${emoji} ${escapeHtml(displayName(c))}: ${parts.join(' | ') || '(no links yet)'}`
}

function sortWithinCountry(list: Community[], iso: string | null): Community[] {
  const eastWest = iso ? EAST_TO_WEST.has(iso) : false
  return [...list].sort((x, y) => {
    const wx = isCountryWide(x) ? 0 : 1, wy = isCountryWide(y) ? 0 : 1
    if (wx !== wy) return wx - wy
    if (eastWest) return (Number(y.lng ?? -999)) - (Number(x.lng ?? -999))
    return (Number(y.lat ?? -999)) - (Number(x.lat ?? -999))
  })
}

// Countries of a list in display order.
function countryOrder(def: ListDef, present: Set<string>): string[] {
  const fixed = def.countries.filter(c => present.has(c))
  const rest = [...present].filter(c => !def.countries.includes(c)).sort((x, y) => countryName(x).localeCompare(countryName(y)))
  return def.alphabetical ? [...fixed, ...rest].sort((x, y) => countryName(x).localeCompare(countryName(y))) : [...fixed, ...rest]
}

function listFor(c: Community): ListDef | null {
  if (!c.country) {
    const city = norm(c.city ?? '')
    return LISTS.find(l => (l.areas ?? []).some(ar => norm(ar) === city)) ?? null
  }
  return LISTS.find(l => l.countries.includes(c.country!)) ??
    LISTS.find(l => (l.regions ?? []).includes(c.region ?? '')) ?? null
}

// ---------------------------------------------------------------------------------------------
type Section = { heading: string | null; lines: string[] }
type Rendered = { key: string; parts: string[]; links: number }

const countLinks = (s: string) => (s.match(/<a href=/g) ?? []).length
const visibleLength = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').length

// Packs sections into as few messages as fit the link and length limits. The header goes on the
// first part only; later parts say "(continued)".
function pack(header: (part: number) => string, sections: Section[]): string[] {
  const parts: string[] = []
  let cur = header(1)
  let started = false
  const flush = () => { parts.push(cur.trimEnd()); cur = header(parts.length + 1); started = false }
  for (const s of sections) {
    // Headings are plain text (country and section names) and need escaping; lines are HTML already.
    const block = [s.heading && escapeHtml(s.heading), ...s.lines].filter(Boolean).join('\n') + `\n${RULE}\n`
    const candidate = cur + block
    if (started && (countLinks(candidate) > MAX_LINKS || visibleLength(candidate) > MAX_CHARS)) flush()
    cur += block
    started = true
  }
  parts.push(cur.trimEnd())
  return parts
}

const DATE_LINE = /^Last updated: .*$/m
function today(): string {
  return new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' })
}

function renderCommunityLists(all: Community[]): Rendered[] {
  const byList = new Map<string, Community[]>()
  const unplaced: Community[] = []
  for (const c of all) {
    if (area(c) === 'Worldwide' && !listFor(c)) continue // worldwide resources live in Jan's overview
    const l = listFor(c)
    if (!l) { unplaced.push(c); continue }
    byList.set(l.key, [...(byList.get(l.key) ?? []), c])
  }
  if (unplaced.length) console.warn('No list for:', unplaced.map(c => `${c.slug} (${c.country}, ${c.region})`).join(', '))

  return LISTS.map(def => {
    const members = byList.get(def.key) ?? []
    const sections: Section[] = []
    const multi = members.filter(c => !c.country)
    if (multi.length) sections.push({ heading: null, lines: multi.map(communityLine) })
    const present = new Set(members.filter(c => c.country).map(c => c.country!))
    for (const iso of countryOrder(def, present)) {
      const inCountry = sortWithinCountry(members.filter(c => c.country === iso), iso)
      sections.push({ heading: `${toFlag(iso)} ${countryName(iso)}`, lines: inCountry.map(communityLine) })
    }
    const header = (part: number) => [
      `${def.globe} ${escapeHtml(def.title)} – CI COMMUNITIES${part > 1 ? ` (continued, ${part})` : ''}`,
      '',
      'Last updated: {DATE}',
      a('back to 🗺 THE CI TREASURE LIST - OVERVIEW', COMMUNITY_OVERVIEW),
      RULE,
      '',
    ].join('\n')
    const parts = pack(header, sections)
    return { key: def.key, parts, links: parts.reduce((n, p) => n + countLinks(p), 0) }
  })
}

// Chat lists: one line per group, flag + linked name.
function chatLine(c: Community, url: string): string {
  const flag = c.country ? toFlag(c.country) : (area(c) === 'Worldwide' ? '🌐' : '🌎')
  const emoji = c.type && c.type !== 'General CI Community' ? (TYPE_EMOJI[c.type] ?? '') : ''
  return `${flag}${emoji} ${a(displayName(c), url)}`
}

function orderForChats(list: Community[]): Community[] {
  // Same order as the community lists: list order, then country order, then within country.
  const listIndex = (c: Community) => { const l = listFor(c); return l ? LISTS.indexOf(l) : -1 }
  return [...list].sort((x, y) => {
    const lx = listIndex(x), ly = listIndex(y)
    if (lx !== ly) return lx - ly
    if ((x.country ?? '') !== (y.country ?? '')) {
      const def = LISTS[lx]
      if (!def) return (x.country ?? '').localeCompare(y.country ?? '')
      const order = countryOrder(def, new Set([x.country, y.country].filter(Boolean) as string[]))
      if (!x.country) return -1
      if (!y.country) return 1
      return order.indexOf(x.country) - order.indexOf(y.country)
    }
    return sortWithinCountry([x, y], x.country)[0] === x ? -1 : 1
  })
}

function renderChatLists(all: Community[]): Rendered[] {
  const ordered = orderForChats(all)
  const tgGroup = (c: Community) => c.invites.find(i => i.platform === 'telegram')?.url ?? c.telegram_group
  const inv = (c: Community, p: string) => c.invites.find(i => i.platform === p)?.url

  const back = a('back to overview of CI chat groups', CHAT_OVERVIEW)
  const make = (key: string, title: string, intro: string[], sections: Section[]): Rendered => {
    const header = (part: number) =>
      [`${escapeHtml(title)}${part > 1 ? ` (continued, ${part})` : ''}`, back, RULE, ...intro, 'Last updated: {DATE}', RULE, ''].join('\n')
    const parts = pack(header, sections.filter(s => s.lines.length))
    return { key, parts, links: parts.reduce((n, p) => n + countLinks(p), 0) }
  }

  const tgSection = (ar: string) => ordered.filter(c => area(c) === ar && tgGroup(c)).map(c => chatLine(c, tgGroup(c)!))
  const telegram = make('chats-telegram', '⚡️ Quick list of CI Telegram groups (TG Channels 👇)', [], [
    { heading: null, lines: tgSection('Worldwide') },
    { heading: 'Telegram Groups Asia-Pacific', lines: tgSection('Asia-Pacific') },
    { heading: 'Telegram Groups Europe, Middle East & Africa', lines: tgSection('EMEA') },
    { heading: 'Telegram Groups Americas', lines: tgSection('Americas') },
    { heading: 'Telegram Channels', lines: ordered.filter(c => c.telegram_channel).map(c => chatLine(c, c.telegram_channel!)) },
  ])

  const privacy = ['⚠️ Privacy notice: WhatsApp groups show all members\' phone numbers to everyone in the group, please join only if you\'re okay with that! ⚠️', RULE]
  const wa = (ar: string) => ordered.filter(c => area(c) === ar && inv(c, 'whatsapp')).map(c => chatLine(c, inv(c, 'whatsapp')!))
  const whatsappAmApac = make('chats-whatsapp-americas-apac', '⚡️ Quick list of CI WhatsApp groups (Americas & Asia-Pacific)', privacy, [
    { heading: 'WhatsApp Groups Americas', lines: wa('Americas') },
    { heading: 'WhatsApp Groups Asia-Pacific', lines: wa('Asia-Pacific') },
  ])
  const whatsappEmea = make('chats-whatsapp-emea', '⚡️ Quick list of CI WhatsApp groups (Europe, Middle East & Africa)', privacy, [
    { heading: 'WhatsApp Groups Europe, Middle East & Africa', lines: [...wa('EMEA'), ...wa('Worldwide')] },
  ])

  const other = make('chats-signal-line-messenger', '⚡️ Quick list of CI Signal / LINE / Facebook Messenger groups', [], [
    { heading: 'Signal groups', lines: ordered.filter(c => inv(c, 'signal')).map(c => chatLine(c, inv(c, 'signal')!)) },
    { heading: 'LINE groups', lines: ordered.filter(c => inv(c, 'line')).map(c => chatLine(c, inv(c, 'line')!)) },
    { heading: 'Facebook Messenger groups', lines: ordered.filter(c => c.other_resource && isMessenger(c.other_resource)).map(c => chatLine(c, c.other_resource!)) },
  ])
  return [telegram, whatsappAmApac, whatsappEmea, other]
}

// ---------------------------------------------------------------------------------------------
async function tg(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: { message_id: number }; description?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) console.error(`${method} failed:`, JSON.stringify(data))
  return data
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${WEBHOOK_SECRET}`) return new Response('unauthorized', { status: 401 })
  const body = await req.json().catch(() => ({}))
  const targetName = body.target === 'live' ? 'live' : 'preview'
  const target = TARGETS[targetName]
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: rows, error } = await supabase.from('communities')
    .select('id, slug, name, type, city, country, region, lat, lng, website, telegram_group, telegram_channel, whatsapp_channel, facebook_group, facebook_page, instagram, youtube, calendar, newsletter, other_resource, other_resource_label, community_invites(platform, url)')
    .eq('status', 'published').is('deleted_at', null)
  if (error) return new Response(`db error: ${error.message}`, { status: 500 })
  const all: Community[] = (rows ?? []).map((r: Record<string, unknown>) => ({ ...(r as unknown as Community), invites: (r.community_invites as Community['invites']) ?? [] }))

  const jobs = [
    ...renderCommunityLists(all).map(r => ({ ...r, thread: target.communities })),
    ...renderChatLists(all).map(r => ({ ...r, thread: target.chats })),
  ]

  const { data: stored } = await supabase.from('tg_list_messages').select('*').eq('chat_id', Number(target.chatId))
  const storedMap = new Map((stored ?? []).map(s => [`${s.list_key}#${s.part}`, s]))

  const log: string[] = []
  const warnings: string[] = []
  const newMessages: string[] = []
  const date = today()

  for (const job of jobs) {
    if (job.links >= WARN_LINKS * job.parts.length) warnings.push(`${job.key}: ${job.links} links in ${job.parts.length} message(s)`)
    for (let i = 0; i < job.parts.length; i++) {
      const part = i + 1
      const textNoDate = job.parts[i]
      const prev = storedMap.get(`${job.key}#${part}`)
      if (prev && prev.posted_text.replace(DATE_LINE, '') === textNoDate.replace('Last updated: {DATE}', '')) continue
      const text = textNoDate.replace('{DATE}', date)
      const links = countLinks(text)
      if (prev) {
        const r = await tg('editMessageText', { chat_id: target.chatId, message_id: prev.message_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
        if (!r.ok) { log.push(`✗ ${job.key} #${part}: ${r.description}`); continue }
        await supabase.from('tg_list_messages').update({ posted_text: text, link_count: links, updated_at: new Date().toISOString() })
          .eq('list_key', job.key).eq('part', part).eq('chat_id', Number(target.chatId))
        log.push(`✎ ${job.key}${job.parts.length > 1 ? ` #${part}` : ''}`)
      } else {
        const r = await tg('sendMessage', { chat_id: target.chatId, message_thread_id: job.thread, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
        if (!r.ok || !r.result) { log.push(`✗ ${job.key} #${part}: ${r.description}`); continue }
        await supabase.from('tg_list_messages').insert({ list_key: job.key, part, chat_id: Number(target.chatId), thread_id: job.thread, message_id: r.result.message_id, posted_text: text, link_count: links })
        storedMap.set(`${job.key}#${part}`, { message_id: r.result.message_id })
        log.push(`＋ ${job.key}${job.parts.length > 1 ? ` #${part}` : ''}`)
        newMessages.push(job.key)
      }
      await sleep(1500) // stay well under Telegram's per-group rate limit
    }
    // A list that shrank by a part: leave the old part, tell Jan.
    for (const [k] of storedMap) {
      const [key, p] = k.split('#')
      if (key === job.key && Number(p) > job.parts.length) warnings.push(`${job.key}: part ${p} is no longer needed, delete it by hand`)
    }
  }

  // Overview blocks for Jan to paste, whenever a list message is new (first run, or a list split).
  const msgLink = (key: string, part = 1) => {
    const s = storedMap.get(`${key}#${part}`)
    const thread = key.startsWith('chats-') ? target.chats : target.communities
    return s ? `${target.linkBase}/${thread}/${s.message_id}` : null
  }
  const report: string[] = [`🤖 List sync (${targetName}) · ${date}`, ...(log.length ? log : ['no changes'])]
  if (warnings.length) report.push('', '⚠️ ' + warnings.join('\n⚠️ '))
  await tg('sendMessage', { chat_id: ADMIN_CHAT_ID, message_thread_id: ADMIN_PASTE_THREAD_ID, text: escapeHtml(report.join('\n')), parse_mode: 'HTML' })

  if (newMessages.length) {
    const groups: string[] = []
    for (const g of ['AMERICAS', 'EUROPE, MIDDLE EAST & AFRICA', 'ASIA-PACIFIC'] as const) {
      const globe = g === 'AMERICAS' ? '🌎' : g === 'ASIA-PACIFIC' ? '🌏' : '🌍'
      const lines = LISTS.filter(l => l.group === g).map(l => {
        const link = msgLink(l.key)
        const name = l.title.split(' ').map(w => (['&', 'US', 'UK'].includes(w) ? w : w[0] + w.slice(1).toLowerCase())).join(' ')
        return link ? `→ ${a(name, link)}` : `→ ${escapeHtml(name)}`
      })
      groups.push(`${globe} ${escapeHtml(g)}\n${lines.join('\n')}`)
    }
    const overview = ['📋 Community overview, the "Find your CI community!" part:', '', ...groups.join('\n\n').split('\n')].join('\n')
    const chatLinks = [
      ['Telegram', 'chats-telegram'], ['WhatsApp Americas & Asia-Pacific', 'chats-whatsapp-americas-apac'],
      ['WhatsApp Europe, Middle East & Africa', 'chats-whatsapp-emea'], ['Signal & LINE & Facebook Messenger', 'chats-signal-line-messenger'],
    ].map(([label, key]) => { const l = msgLink(key); return l ? `- ${a(label, l)}` : `- ${escapeHtml(label)}` })
    const chatOverview = ['📋 Chat overview, the list of lists:', '', ...chatLinks].join('\n')
    await tg('sendMessage', { chat_id: ADMIN_CHAT_ID, message_thread_id: ADMIN_PASTE_THREAD_ID, text: overview, parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
    await tg('sendMessage', { chat_id: ADMIN_CHAT_ID, message_thread_id: ADMIN_PASTE_THREAD_ID, text: chatOverview, parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
  }

  return new Response(JSON.stringify({ target: targetName, log, warnings }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
