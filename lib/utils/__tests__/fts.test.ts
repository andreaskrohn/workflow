import { sanitizeFtsQuery } from '../fts'

describe('sanitizeFtsQuery', () => {
  // ── Blank / empty ────────────────────────────────────────────────────────────

  it('returns null for an empty string', () => {
    expect(sanitizeFtsQuery('')).toBeNull()
  })

  it('returns null for a whitespace-only string', () => {
    expect(sanitizeFtsQuery('   ')).toBeNull()
  })

  it('returns null when all characters are stripped away', () => {
    expect(sanitizeFtsQuery('"*()+')).toBeNull()
  })

  // ── Normal words ─────────────────────────────────────────────────────────────

  it('returns a single word unchanged', () => {
    expect(sanitizeFtsQuery('hello')).toBe('hello')
  })

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeFtsQuery('  hello  ')).toBe('hello')
  })

  it('returns multiple words joined by a single space', () => {
    expect(sanitizeFtsQuery('hello world')).toBe('hello world')
  })

  it('collapses multiple spaces between words', () => {
    expect(sanitizeFtsQuery('hello   world')).toBe('hello world')
  })

  // ── FTS5 special characters are stripped ─────────────────────────────────────

  it('strips double-quotes (phrase-query syntax)', () => {
    expect(sanitizeFtsQuery('"phrase query"')).toBe('phrase query')
  })

  it('strips the * prefix operator', () => {
    expect(sanitizeFtsQuery('auth*')).toBe('auth')
  })

  it('strips parentheses', () => {
    expect(sanitizeFtsQuery('(auth OR oauth)')).toBe('auth OR oauth')
  })

  it('strips the + adjacent-token operator', () => {
    expect(sanitizeFtsQuery('+word')).toBe('word')
  })

  it('strips the ^ initial-token operator', () => {
    expect(sanitizeFtsQuery('^title')).toBe('title')
  })

  // ── Hyphen handling ───────────────────────────────────────────────────────────

  it('preserves an interior hyphen (compound words)', () => {
    expect(sanitizeFtsQuery('full-text')).toBe('full-text')
  })

  it('strips a leading hyphen (negation operator)', () => {
    expect(sanitizeFtsQuery('-unwanted')).toBe('unwanted')
  })

  it('strips a trailing hyphen', () => {
    expect(sanitizeFtsQuery('word-')).toBe('word')
  })

  // ── Apostrophe handling ───────────────────────────────────────────────────────

  it("preserves an interior apostrophe (contractions like don't)", () => {
    expect(sanitizeFtsQuery("don't")).toBe("don't")
  })

  it("strips a leading apostrophe", () => {
    expect(sanitizeFtsQuery("'word")).toBe('word')
  })

  // ── Mixed ────────────────────────────────────────────────────────────────────

  it('strips special chars from a mixed query and returns safe tokens', () => {
    expect(sanitizeFtsQuery('project* (auth OR "oauth flow")')).toBe('project auth OR oauth flow')
  })

  it('drops tokens that become empty after stripping', () => {
    expect(sanitizeFtsQuery('hello ** world')).toBe('hello world')
  })
})
