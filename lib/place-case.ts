// I-111: place names from the public Add form, in standard capitalization (the same rule as
// profile names: consistency across hundreds of listings, CLAUDE.md "Profile names").
//
// Only rewrites text typed in a single case ("milan", "RIO DE JANEIRO"). Anything already mixed
// ("St. Petersburg", "Ille-sur-Têt", "Kansai (Kyoto, Osaka)") is left alone, because the submitter
// clearly chose that casing and a naive title-caser would get it wrong more often than they did.

// Joining words that stay lowercase inside a name ("Rio de Janeiro", "Frankfurt am Main").
const LOWERCASE_WORDS = new Set([
  "de", "del", "della", "di", "da", "do", "dos", "das", "la", "le", "les", "los", "las", "el",
  "y", "e", "et", "sur", "sous", "en", "am", "an", "im", "der", "den", "und", "of", "on", "upon",
  "van", "von", "aan", "op", "ter",
]);

function capitalize(word: string): string {
  return word.charAt(0).toLocaleUpperCase() + word.slice(1);
}

export function normalizePlaceCase(value: string): string {
  const text = value.trim().replace(/\s+/g, " ");
  const lower = text.toLocaleLowerCase();
  const upper = text.toLocaleUpperCase();
  const singleCase = text === lower || (text === upper && text !== lower);
  if (!singleCase) return text;

  // Words are split on spaces, hyphens, slashes and brackets; the separators are kept.
  let wordIndex = 0;
  return lower
    .split(/([\s\-/()]+)/)
    .map((part) => {
      if (!/\p{L}/u.test(part)) return part;
      const isFirst = wordIndex === 0;
      wordIndex += 1;
      if (!isFirst && LOWERCASE_WORDS.has(part)) return part;
      return capitalize(part);
    })
    .join("");
}
