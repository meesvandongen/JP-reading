// Shared between the dictionary build script (Node) and the app (browser).
// Plain JS so the build script can import it without a compile step.

export const J_BUCKETS = 1024
export const E_BUCKETS = 256
export const K_BUCKETS = 64

/** Katakana → hiragana, full-width ASCII → half-width. */
export function normalizeKey(s) {
  return s
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase()
}

function fnv1a(str) {
  let h = 0x811c9dc5
  for (const ch of str) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/**
 * Bucket for a key. Japanese keys are bucketed by their first two characters
 * so that every prefix (length ≥ 2) of a text position lands in the same
 * bucket, which keeps longest-match lookup to at most two fetches.
 */
export function bucketOf(key, buckets) {
  const chars = Array.from(key)
  const head = buckets === J_BUCKETS ? chars.slice(0, 2).join('') : key
  return fnv1a(head) % buckets
}

const STOP = new Set(
  'a an the of to in on at by for with from as or and be is are was were it its this that one ones sth someone something s etc e g i'.split(
    ' ',
  ),
)

/** Index words of an English gloss. */
export function englishWords(gloss) {
  return gloss
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .split(/[^a-z0-9'-]+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w))
}
