/**
 * Code-point-safe string helpers.
 *
 * JavaScript indexes and slices strings by UTF-16 code UNIT, so `name[0]` and
 * `text.slice(0, n)` can cut an astral character (any emoji) in half and leave
 * an orphaned surrogate behind.
 *
 * That is worse than a mangled glyph. A lone surrogate is not a Unicode scalar
 * value and has no UTF-8 representation at all, so anything requiring
 * well-formed text rejects it: `Omar | 🌴` abbreviated by code unit became
 * `"Omar \ud83c."`, which Postgres `jsonb` refuses with `invalid input syntax
 * for type json`. A consumer storing `--json` output stopped persisting for
 * over a day because of one display name.
 *
 * `Array.from` iterates by code POINT, which keeps a surrogate pair together.
 * These wrap that so the intent is visible at the call site rather than looking
 * like a needless allocation.
 *
 * Code points, not grapheme clusters: a ZWJ sequence like 👨‍👩‍👧 is several code
 * points and can still be split between them. That produces an odd-looking but
 * VALID string, so it is a cosmetic limit rather than the correctness bug these
 * fix. Reach for `Intl.Segmenter` if that ever matters.
 */

/** The first code point of `text`, or `''` when empty. Never half a surrogate pair. */
export function firstCodePoint(text: string): string {
    return Array.from(text)[0] ?? ''
}

/**
 * `text` shortened to `maxCodePoints` with a trailing ellipsis, or unchanged
 * when it already fits.
 *
 * Counts and cuts in the same unit deliberately. Testing `text.length` (code
 * units) and then slicing by code point would disagree with itself on any
 * string containing an emoji.
 */
export function truncateForDisplay(text: string, maxCodePoints: number): string {
    const points = Array.from(text)
    if (points.length <= maxCodePoints) return text
    return `${points.slice(0, maxCodePoints).join('')}...`
}
