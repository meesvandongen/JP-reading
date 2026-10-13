import { KANJI_RE, toHiragana } from './kana'

export type Furigana = [string, string?][]

/**
 * Align a surface form with its reading and return ruby segments.
 * 食べ物 + たべもの → [["食","た"],["べ"],["物","もの"]]
 * Kana runs in the surface anchor the alignment; each kanji run gets the
 * reading between the anchors.
 */
export function alignFurigana(surface: string, reading: string): Furigana {
  const r = toHiragana(reading)
  // Split surface into alternating kanji / non-kanji runs
  const runs: { text: string; kanji: boolean }[] = []
  for (const ch of Array.from(surface)) {
    const k = KANJI_RE.test(ch)
    const last = runs[runs.length - 1]
    if (last && last.kanji === k) last.text += ch
    else runs.push({ text: ch, kanji: k })
  }
  if (!runs.some((x) => x.kanji)) return [[surface]]
  if (runs.length === 1) return [[surface, r]]

  // Build a regex: kana runs literal, kanji runs as (.+?)
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = runs.map((x) => (x.kanji ? '(.+?)' : `(${esc(toHiragana(x.text))})`)).join('')
  const m = new RegExp(`^${pattern}$`).exec(r)
  if (!m) return [[surface, r]]
  return runs.map((x, i) => (x.kanji ? [x.text, m[i + 1]] : [x.text]))
}

/** Reading in hiragana for a list of segments (kana segments contribute themselves). */
export function furiganaReading(f: Furigana): string {
  return f.map(([t, r]) => toHiragana(r ?? t)).join('')
}
