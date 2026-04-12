/**
 * Sanitises a raw user string into a safe FTS5 MATCH query.
 *
 * Strategy: split on whitespace, strip every character that carries special
 * meaning in FTS5 syntax (`"`, `*`, `(`, `)`, `+`, `^`, `~`), drop leading
 * and trailing hyphens and apostrophes from each token so they cannot be
 * misread as negation operators, then rejoin with spaces.
 *
 * FTS5 treats a space-separated list as an implicit AND, so every returned
 * token must appear somewhere in the indexed document.
 *
 * Interior hyphens and apostrophes are preserved (e.g. "full-text", "don't").
 *
 * Returns `null` when the sanitised query contains no usable tokens — callers
 * should return an empty result set rather than issuing a MATCH query.
 */
export function sanitizeFtsQuery(raw: string): string | null {
  const words = raw
    .trim()
    .split(/\s+/)
    .map((w) =>
      w
        .replace(/[^\w'-]/g, '')           // strip FTS5 special chars, keep word chars + - '
        .replace(/^[-']+|[-']+$/g, ''),    // strip leading/trailing - and '
    )
    .filter((w) => w.length > 0)

  return words.length > 0 ? words.join(' ') : null
}
