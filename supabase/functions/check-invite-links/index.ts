import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { escapeHtml } from '../_shared/announce-format.ts'

// I-029 (2026-10-17): weekly check (in daily slices) of every WhatsApp and Telegram link of a published community.
// Groups reset or revoke their invite links, and a dead link in Steve's lists or on the website
// wastes the reader's click. The public invite pages tell us cheaply whether a link still works:
//   WhatsApp  chat.whatsapp.com/<code>   live: the page names the group; dead: empty og:title
//   Telegram  t.me/+<code>, t.me/<name>  live: "N members" / "N subscribers"; dead: "Join group chat
//                                        on Telegram" (revoked invite) or "Telegram: Contact @x"
//                                        (the name no longer belongs to a group or channel)
// Anything else (rate limit, timeout, a page we don't recognise) counts as unknown and changes
// nothing. Signal can't be checked: the group name is encrypted in the link itself.
//
// community_invites rows get broken_since set (dead) or cleared (working again). Links stored on the
// community row (public telegram_group / telegram_channel) are only reported. A short report goes
// to the admin copy-paste topic when something changed. Body {"dryRun": true} reports without
// writing. Scheduled daily by pg_cron (migration 20261017200000), a seventh of the links each day.

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const WEBHOOK_SECRET = Deno.env.get('ANNOUNCE_WEBHOOK_SECRET')!
const ADMIN_CHAT_ID = Deno.env.get('TELEGRAM_ADMIN_CHAT_ID')!
const ADMIN_PASTE_THREAD_ID = Number(Deno.env.get('TELEGRAM_ADMIN_PASTE_THREAD_ID')!)

// If more than this share of the checked links looks dead in one run, the sites are more likely
// blocking us than the groups all dying at once: report, write nothing.
const MAX_DEAD_SHARE = 0.25

type State = 'live' | 'dead' | 'unknown'

async function check(url: string): Promise<State> {
  const u = /^https?:\/\//i.test(url) ? url : `https://${url}`
  let html: string
  try {
    const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
    if (res.status !== 200) return 'unknown'
    html = await res.text()
  } catch {
    return 'unknown'
  }
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1]
  if (title === undefined) return 'unknown'
  if (/chat\.whatsapp\.com/i.test(u)) return title.trim() ? 'live' : 'dead'
  if (/t\.me\//i.test(u)) {
    if (/tgme_page_extra">\s*[\d\s]+(members|subscribers)/.test(html)) return 'live'
    if (title === 'Join group chat on Telegram' || title.startsWith('Telegram: Contact @')) return 'dead'
  }
  return 'unknown'
}

async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) console.error(`${method} failed:`, JSON.stringify(data))
}

type Link = { slug: string; name: string; platform: string; url: string; communityId: string; brokenSince: string | null; kind: 'invite' | 'column' }

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${WEBHOOK_SECRET}`) return new Response('unauthorized', { status: 401 })
  const body = await req.json().catch(() => ({}))
  const dryRun = body.dryRun === true
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: rows, error } = await supabase.from('communities')
    .select('id, slug, name, telegram_group, telegram_channel, community_invites(platform, url, broken_since)')
    .eq('status', 'published').is('deleted_at', null)
  if (error) return new Response(`db error: ${error.message}`, { status: 500 })

  const links: Link[] = []
  for (const c of rows ?? []) {
    for (const i of (c.community_invites ?? []) as { platform: string; url: string; broken_since: string | null }[]) {
      if (i.platform === 'whatsapp' || i.platform === 'telegram') {
        links.push({ slug: c.slug, name: c.name, platform: i.platform, url: i.url, communityId: c.id, brokenSince: i.broken_since, kind: 'invite' })
      }
    }
    for (const col of ['telegram_group', 'telegram_channel'] as const) {
      if (c[col]) links.push({ slug: c.slug, name: c.name, platform: col, url: c[col]!, communityId: c.id, brokenSince: null, kind: 'column' })
    }
  }

  // WhatsApp throttles a server that asks about many groups in a row (its page then comes back
  // without the group name, which counts as unknown). So each day checks one seventh of the links,
  // one at a time: every link once a week, ~25 a day. {"all": true} checks everything (expect
  // unknowns), {"day": 0-6} a given day's share.
  const day = Number.isInteger(body.day) ? body.day : new Date().getUTCDay()
  const share = (url: string) => [...url].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 7
  const todays = body.all === true ? links : links.filter(l => share(l.url) === day)
  links.length = 0
  links.push(...todays)
  const states: State[] = []
  for (const l of links) {
    states.push(await check(l.url))
    await new Promise(r => setTimeout(r, 1000))
  }

  const checked = states.filter(s => s !== 'unknown').length
  const dead = links.filter((_, i) => states[i] === 'dead')
  const unknown = links.filter((_, i) => states[i] === 'unknown')
  const suspicious = checked > 0 && dead.length / checked > MAX_DEAD_SHARE

  const newlyDead = links.filter((l, i) => l.kind === 'invite' && states[i] === 'dead' && !l.brokenSince)
  const revived = links.filter((l, i) => l.kind === 'invite' && states[i] === 'live' && l.brokenSince)
  const deadColumns = links.filter((l, i) => l.kind === 'column' && states[i] === 'dead')

  if (!dryRun && !suspicious) {
    const now = new Date().toISOString()
    for (const l of newlyDead) {
      await supabase.from('community_invites').update({ broken_since: now }).eq('community_id', l.communityId).eq('platform', l.platform)
    }
    for (const l of revived) {
      await supabase.from('community_invites').update({ broken_since: null }).eq('community_id', l.communityId).eq('platform', l.platform)
    }
  }

  const line = (l: Link) => `• ${escapeHtml(l.name)} (${l.platform.replace('_', ' ')}): <a href="https://citreasurehunt.com/admin/communities/${l.communityId}/edit">edit</a>`
  const report: string[] = []
  if (suspicious) {
    report.push(`⚠️ Link check: ${dead.length} of ${checked} links look dead, too many to be real. Nothing was marked; the sites may be blocking the check.`)
  } else {
    if (newlyDead.length) report.push(`🔗 Expired invite links, now hidden and asking readers for the new one:`, ...newlyDead.map(line))
    if (revived.length) report.push(`✅ Working again, shown again:`, ...revived.map(line))
    if (deadColumns.length) report.push(`🔗 Dead public Telegram links on the community itself (not changed, please check):`, ...deadColumns.map(line))
  }
  if (report.length && !dryRun) {
    await tg('sendMessage', {
      chat_id: ADMIN_CHAT_ID, message_thread_id: ADMIN_PASTE_THREAD_ID, text: report.join('\n'),
      parse_mode: 'HTML', link_preview_options: { is_disabled: true },
    })
  }

  return Response.json({
    dryRun, total: links.length, checked, unknown: unknown.length, suspicious,
    newlyDead: newlyDead.map(l => `${l.slug} ${l.platform}`),
    revived: revived.map(l => `${l.slug} ${l.platform}`),
    deadColumns: deadColumns.map(l => `${l.slug} ${l.platform} ${l.url}`),
    stillDead: dead.filter(l => l.kind === 'invite' && l.brokenSince).map(l => `${l.slug} ${l.platform}`),
    unknownLinks: unknown.map(l => `${l.slug} ${l.platform} ${l.url}`),
  })
})
