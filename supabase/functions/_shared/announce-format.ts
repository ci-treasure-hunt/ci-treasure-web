// Shared rich-caption formatting for the two Telegram announcers that use the photo-card
// format: announce-event-channel (always) and announce-event (2026-07-22 — now also used for
// 2-3 day workshop announcements in their regional group topic, not just the public channel).
// Extracted 2026-07-22 rather than duplicated a second time — this logic has already had one
// real bug fixed in it (qIIy's truncation edge case), and duplicating debugged logic risks the
// two copies drifting apart silently.

export const TYPE_EMOJI: Record<string, string> = {
  jam: '✨', long_jam: '✨', workshop: '✋', training: '🎓', festival: '🎪',
  retreat: '🌿', camp: '⛺', intensive: '💫', residency: '🏡', class: '📚',
  lab: '🔬', underscore: '⭕', cdp: '🌀', performance: '🎭', lecture: '🎤', other: '📌',
}

export const LEVEL_LABEL: Record<string, string> = {
  all_levels: 'All levels', mixed: 'Mixed levels', beginner: 'Beginner',
  intermediate: 'Intermediate', advanced: 'Advanced',
}

// Hashtag labels — CamelCase, no spaces (Telegram hashtags break on whitespace/punctuation).
export const TYPE_HASHTAG: Record<string, string> = {
  jam: 'Jam', long_jam: 'LongJam', workshop: 'Workshop', training: 'Training', festival: 'Festival',
  retreat: 'Retreat', camp: 'Camp', intensive: 'Intensive', residency: 'Residency', class: 'Class',
  lab: 'Lab', underscore: 'Underscore', cdp: 'CDP', performance: 'Performance', lecture: 'Lecture',
}

// Every discipline present gets a hashtag, including CI (as #CI) — see the note at the call site
// for why #CI isn't skipped as a "baseline" tag.
export const DISCIPLINE_HASHTAG: Record<string, string> = {
  contact_improvisation: 'CI', somatic_movement: 'SomaticMovement',
  dance_improvisation: 'DanceImprovisation', dance_theatre: 'DanceTheatre',
  authentic_movement: 'AuthenticMovement', bmc: 'BMC', butoh: 'Butoh',
  conscious_dance: 'ConsciousDance', contemporary_dance: 'ContemporaryDance',
  acroyoga: 'AcroYoga', axis_syllabus: 'AxisSyllabus',
}

// Country names for hashtags — covers every country currently in the DB (checked 2026-07-20) plus
// a handful of likely future ones. Falls back to the raw ISO code for anything not listed here, so
// an unmapped country never breaks a post.
export const COUNTRY_NAME: Record<string, string> = {
  DE: 'Germany', US: 'USA', IT: 'Italy', ES: 'Spain', FR: 'France', CA: 'Canada', GB: 'UK',
  NL: 'Netherlands', PT: 'Portugal', GR: 'Greece', NO: 'Norway', ID: 'Indonesia',
  CH: 'Switzerland', TH: 'Thailand', IN: 'India', PL: 'Poland', AT: 'Austria', MD: 'Moldova',
  UA: 'Ukraine', PE: 'Peru', SK: 'Slovakia', DK: 'Denmark', TR: 'Turkey', HR: 'Croatia',
  SE: 'Sweden', LT: 'Lithuania', CZ: 'Czechia', KR: 'SouthKorea', AU: 'Australia', MX: 'Mexico',
  CN: 'China', HU: 'Hungary', FI: 'Finland', AR: 'Argentina', EC: 'Ecuador', BR: 'Brazil',
  BE: 'Belgium', IE: 'Ireland', RO: 'Romania', BG: 'Bulgaria', SI: 'Slovenia', EE: 'Estonia',
  LV: 'Latvia', IS: 'Iceland', JP: 'Japan', IL: 'Israel', ZA: 'SouthAfrica', NZ: 'NewZealand',
  CO: 'Colombia', CL: 'Chile', UY: 'Uruguay', CR: 'CostaRica',
}

// Primary teaching roles for the headline teacher line — excludes musician/guest/assistant,
// which are secondary credits, not what "🧑‍🏫" signals.
export const TEACHER_ROLES = new Set(['teacher', 'facilitator', 'intensive'])

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Matches slugify() in ci-treasure-web/lib/events.ts (SLUG_CHAR_MAP omitted — NFD-normalize
// already strips ł/ø/đ/ð/þ/å-style diacritics down to their base letter for this purpose).
// The site 301-redirects a bare short_id URL to this full slug, so posting the slug directly
// avoids the extra redirect hop on every click.
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function toFlag(code: string): string {
  return [...code.toUpperCase()].map(c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397),
  ).join('')
}

// Shows the year only when it's not the current year — most events post within the year they
// happen, where a bare "Oct 1-3" reads fine, but a Movement Artisans module announced in 2026 for
// Oct 2027 without a year reads as next month, not next year (I-168).
export function formatDates(start: string, end: string | null): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const currentYear = new Date().getUTCFullYear()
  const s = new Date(start + 'T00:00:00Z')
  const sy = s.getUTCFullYear(), sm = MONTHS[s.getUTCMonth()], sd = s.getUTCDate()
  if (!end || end === start) {
    return sy !== currentYear ? `${sm} ${sd}, ${sy}` : `${sm} ${sd}`
  }
  const e  = new Date(end + 'T00:00:00Z')
  const ey = e.getUTCFullYear(), em = MONTHS[e.getUTCMonth()], ed = e.getUTCDate()
  if (sy !== ey) {
    // Crosses a year boundary — always show both years explicitly, since "Dec 29-Jan 10" alone
    // hides that the span crosses into a different year.
    return `${sm} ${sd}, ${sy}-${em} ${ed}, ${ey}`
  }
  const yearSuffix = sy !== currentYear ? `, ${sy}` : ''
  return s.getUTCMonth() === e.getUTCMonth()
    ? `${sm} ${sd}-${ed}${yearSuffix}`
    : `${sm} ${sd}-${em} ${ed}${yearSuffix}`
}

type PriceItem = { amount?: number; currency?: string; description?: string }

const SKIP_KEYWORDS = ['deposit', 'single', 'day pass', 'drop-in', 'work-study']
const MAX_SUFFIX_LEN = 40

// minimumFractionDigits: 0 drops the ".00" on whole amounts (found live: "$420.00–$560.00" reads
// worse than "$420–$560") while still showing real cents when a price genuinely has them.
//
// Intl.NumberFormat throws on a non-ISO-4217 currency string — found live 2026-07-22:
// "Pound"/"pounds" from the self-service form's free-text currency field crashed this whole
// announce function (both announce-event's workshop path and announce-event-channel, since
// both call headlinePrice), silently dropping the announcement entirely. Fall back to a
// plain "123 CODE" label instead of throwing.
function fmtMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(amountMinor / 100)
  } catch {
    return `${amountMinor / 100} ${currency}`
  }
}

// Truncate defensively regardless of how well the parsing above worked — free-text descriptions
// can't be fully bulletproofed (found via qIIy, whose description has no clean separator and would
// otherwise dump ~190 chars into the caption as a parenthetical).
function shortLabel(description: string): string {
  const label = description.split(' — ')[0].split(':')[0].trim()
  return label.length > MAX_SUFFIX_LEN ? `${label.slice(0, MAX_SUFFIX_LEN).trim()}…` : label
}

// Headline price. Two real patterns found in live data (2026-07-20), handled differently:
//
// 1. Sliding scale (`6cmy` Jam on Orcas Island, `MoS4` JamJam Festival) — tiers represent one
//    pay-what-you-can price, not alternative products. "First tier" is the wrong model here in
//    either direction: Orcas lists high-to-low, JamJam lists low-to-high, so picking item[0] would
//    sometimes show the ceiling as if it were the minimum. Detected via a "sliding scale" keyword
//    in the description and rendered as a min-max range instead.
// 2. Everything else — first tier in the array is the intended headline price (checked against 5
//    real live events, organizers consistently list the main/full price first, exceptions after).
//    Skip forward past any tier that looks like an add-on/exception, not the main offer
//    (deposit, single-item, day-pass, drop-in, work-study discount).
export function headlinePrice(price: { items?: PriceItem[] } | null): string | null {
  const items = (price?.items ?? []).filter(
    i => typeof i.amount === 'number' && i.currency,
  ) as Required<Pick<PriceItem, 'amount' | 'currency'>>[] & PriceItem[]
  if (!items.length) return null

  const sliding = items.filter(i => (i.description ?? '').toLowerCase().includes('sliding scale'))
  if (sliding.length >= 2) {
    const currency = sliding[0].currency!
    const amounts = sliding.map(i => i.amount!)
    const lo = fmtMoney(Math.min(...amounts), currency)
    const hi = fmtMoney(Math.max(...amounts), currency)
    return lo === hi ? `${lo} (sliding scale)` : `${lo}–${hi} (sliding scale)`
  }

  const item = items.find(i => !SKIP_KEYWORDS.some(k => (i.description ?? '').toLowerCase().includes(k)))
    ?? items[0]
  if (item.amount === 0) return 'Free'
  const formatted = fmtMoney(item.amount!, item.currency!)
  const suffix = item.description ? ` (${shortLabel(item.description)})` : ''
  return `From ${formatted}${suffix}`
}

export type RichCaptionEvent = {
  type: string
  title: string
  short_id: string
  country: string
  start_date: string
  end_date: string | null
  price: { items?: PriceItem[] } | null
  level: string | null
  discipline: string[] | null
}

// Builds the photo-card caption shared by announce-event-channel and announce-event's
// (2026-07-22) 2-3 day workshop path. `location` and `teacherNames` are resolved by the caller
// (venue-name-vs-city and event_teachers differ slightly by call site).
export function buildRichCaption(event: RichCaptionEvent, teacherNames: string[], location: string): string {
  const eventUrl = `https://citreasurehunt.com/events/${event.short_id}-${slugify(event.title)}`

  const lines: string[] = [
    `${TYPE_EMOJI[event.type] ?? '📌'} <a href="${eventUrl}">${escapeHtml(event.title)}</a>`,
    `${toFlag(event.country)} ${escapeHtml(location)}`,
    `📅 ${formatDates(event.start_date, event.end_date)}`,
  ]

  const price = headlinePrice(event.price)
  const level = event.level ? LEVEL_LABEL[event.level] ?? event.level : null
  if (price || level) {
    lines.push([price ? `🏷️ ${escapeHtml(price)}` : null, level ? `📶 ${level}` : null].filter(Boolean).join(' · '))
  }

  if (teacherNames.length) {
    const shown = teacherNames.slice(0, 3)
    const rest = teacherNames.length - shown.length
    lines.push(`🧑‍🏫 ${escapeHtml(shown.join(', '))}${rest > 0 ? ` +${rest} more` : ''}`)
  }

  const hashtags: string[] = [
    `#${COUNTRY_NAME[event.country] ?? event.country}`,
  ]
  if (TYPE_HASHTAG[event.type]) hashtags.push(`#${TYPE_HASHTAG[event.type]}`)
  for (const d of (event.discipline ?? [])) {
    if (DISCIPLINE_HASHTAG[d]) hashtags.push(`#${DISCIPLINE_HASHTAG[d]}`)
  }

  return `${lines.join('\n')}\n\n${hashtags.join(' ')}`
}
