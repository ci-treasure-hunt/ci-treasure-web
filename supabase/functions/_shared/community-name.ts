// Community name as shown in Telegram (announcements and Steve's lists): "Oriu (Poitiers)", but
// "Contact Improv Chiemgau", "Contact Improvisation Italy" and "Contact Improvisation Wien" without a
// suffix. The city is added only when the name doesn't already say where the group is (I-029).

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

// Names that already carry the place in a form the automatic checks can't see: local spelling or
// short form of the city (Wien, NYC), or a region (Chiemgau, Grand Ouest). Insider short forms that
// readers abroad won't decode (Osna, Winti, Naoned, Jhb) are deliberately NOT here: they keep the city.
const PLACE_IN_NAME = new Set([
  'contact-improvisation-wien', 'contact-impro-gent', 'contactimpro-zuri', 'contact-improvisation-munchen',
  'kontaktimprovisation-goteborg', 'contact-improvisation-sevilla', 'contact-improvisation-lisboa',
  'contact-improvisation-roma', 'contact-impro-torino', 'ci-ve-contact-improvisation-venezia',
  'ci-na-contact-improvisation-napoli', 'toscana-contact-improvisation', 'contact-improvisation-gran-canaria',
  'contact-improv-alpujarra', 'contact-improv-acores', 'contact-improv-nyc', 'contact-improv-la',
  'cham-ung-tac-contact-improv-hcmc-saigon', 'ci-in-north-germany', 'contact-impro-d-mitte',
  'contact-improv-chiemgau-in-frauenholz', 'contact-impro-nrw-ruhrgebiet-nrw',
  'ci-rhein-ruhr-contact-improvisation-an-rhein-und-ruhr', 'cipo-ci-in-pyrenees-orientales',
  'dcigo-danse-contact-impro-dans-le-grand-ouest', 'brinca-galicia-contact-festival', 'ci-community-bali',
  'calcite-california-contact-improvisation-teachers-exchange',
  'glacier-great-lakes-area-contact-improvisation-enthusiasts-retreat',
])

// City values that aren't a place to show.
const PLACEHOLDER = new Set(['uk', 'usa', 'us', 'worldwide', 'online', 'nationwide', 'whole country',
  'german speaking countries', 'latin america'])

// Local country names the English region names miss.
const LOCAL_COUNTRY: Record<string, string[]> = {
  BR: ['brasil'], ES: ['espana'], IT: ['italia'], SI: ['slovenija'], DE: ['deutschland'], PL: ['polska'],
}

// Words in a city value that say nothing about the place ("Puglia region", "Chirripó National Park").
const FILLER = new Set(['region', 'national', 'park', 'city', 'valle', 'vale', 'south', 'north', 'east',
  'west', 'united', 'kingdom', 'states', 'republic'])

export function norm(s: string): string {
  return s.toLowerCase().replace(/ı/g, 'i').replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/đ/g, 'd')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

const words = (s: string) => norm(s).split(' ').filter(w => w.length >= 4 && !FILLER.has(w))

export function countryNames(iso: string | null): string[] {
  if (!iso) return []
  let en = ''
  try { en = regionNames.of(iso) ?? '' } catch { /* unknown code */ }
  return [en, ...(LOCAL_COUNTRY[iso] ?? [])].filter(Boolean)
}

export interface NamedCommunity {
  slug?: string | null
  name: string
  type?: string | null
  city: string | null
  country: string | null
}

export function communityDisplayName(c: NamedCommunity, extraCountryNames: string[] = []): string {
  const city = c.city?.trim()
  if (!city) return c.name
  if (c.slug && PLACE_IN_NAME.has(c.slug)) return c.name
  const cty = norm(city)
  if (PLACEHOLDER.has(cty)) return c.name
  const countries = [...countryNames(c.country), ...extraCountryNames]
  // The "city" is the country itself (city = "France").
  if (countries.some(n => norm(n) === cty)) return c.name
  const nameWords = new Set(norm(c.name).split(' '))
  // The name names the country: a national group tagged with its capital ("Italy (Rome)"). A
  // festival still keeps its city, it happens in one place ("CI Camp Croatia (Rovinj)").
  if (c.type !== 'Festival' && countries.some(n => words(n).some(w => nameWords.has(w)))) return c.name
  // The name names the city, in either direction ("Kansai" / "Kansai (Kyoto, Osaka)").
  if (norm(c.name).includes(cty) || words(city).some(w => nameWords.has(w))) return c.name
  return `${c.name} (${city})`
}
