// Client for the sharded dictionary built by scripts/build-dict.mjs.

import { bucketOf, normalizeKey, englishWords, J_BUCKETS, E_BUCKETS, K_BUCKETS } from './dictKeys.js'
import { hasKanji, toHiragana } from './kana'
import { alignFurigana } from './furigana'
import type { Word } from './types'

export interface RawReading {
  t: string
  /** restricted to these kanji forms */
  x?: string[]
  /** no kanji */
  n?: 1
  /** info tags */
  f?: string[]
  /** pitch accent */
  a?: string
}
export interface Sense {
  /** part of speech tags */
  p: string[]
  /** glosses */
  g: string[]
  /** misc tags */
  m?: string[]
  /** field */
  d?: string[]
  /** dialect */
  l?: string[]
  /** info */
  n?: string[]
  /** cross references */
  x?: string[]
  /** only applies to these kanji / readings */
  sk?: string[]
  sr?: string[]
}
export interface Entry {
  i: number
  k: (string | [string, string[]])[]
  r: (string | RawReading)[]
  s: Sense[]
  c?: 1
  q?: number
  j?: number
  uk?: 1
}
interface JShard {
  e: Entry[]
  k: Record<string, number[]>
}
export interface KanjiInfo {
  c: string
  m: string[]
  on: string[]
  kun: string[]
  s: number
  g?: number
  j?: number
  f?: number
  rad?: number
  n?: string[]
}
/** [kanji form or '', reading, short gloss, jlpt] */
export type EnglishHit = [string, string, string, number]

export function kanjiForms(e: Entry): { t: string; tags: string[] }[] {
  return e.k.map((k) => (typeof k === 'string' ? { t: k, tags: [] } : { t: k[0], tags: k[1] }))
}

export function readings(e: Entry): RawReading[] {
  return e.r.map((r) => (typeof r === 'string' ? { t: r } : r))
}

/** Main headword: first kanji form (unless the word is usually kana) and its reading. */
export function headword(e: Entry, preferKana = false): { word: string; reading: string; accent?: string } {
  const ks = kanjiForms(e).filter((k) => !k.tags.some((t) => t === 'sK' || t === 'oK' || t === 'iK'))
  const rs = readings(e)
  const r = rs[0]
  if (!ks.length || preferKana || e.uk) return { word: r.t, reading: r.t, accent: r.a }
  return { word: ks[0].t, reading: r.t, accent: r.a }
}

/** Does the entry's part of speech fit the word from the text? */
function posMatches(e: Entry, w: Partial<Pick<Word, 'c' | 'p'>>): boolean {
  const tags = e.s.flatMap((s) => s.p)
  if (w.c) {
    if (w.c === 'v5') return tags.some((t) => t.startsWith('v5'))
    if (w.c === 'vs') return tags.some((t) => t.startsWith('vs'))
    if (w.c === 'vk') return tags.includes('vk')
    return tags.some((t) => t.startsWith(w.c!))
  }
  switch (w.p) {
    case 'n':
    case 'name':
    case 'num':
      return tags.some((t) => t.startsWith('n') || t === 'pn' || t === 'ctr')
    case 'na':
      return tags.includes('adj-na')
    case 'adv':
      return tags.some((t) => t.startsWith('adv'))
    case 'pn':
      return tags.includes('pn')
    case 'conj':
      return tags.includes('conj')
    case 'int':
      return tags.includes('int')
    case 'adn':
      return tags.includes('adj-pn')
    case 'prt':
      return tags.includes('prt') || tags.includes('conj')
    case 'aux':
      return tags.some((t) => t.startsWith('aux') || t === 'cop')
  }
  return true
}

export type Loader = (path: string) => Promise<unknown>

export class Dictionary {
  private j = new Map<number, Promise<JShard>>()
  private e = new Map<number, Promise<Record<string, EnglishHit[]>>>()
  private k = new Map<number, Promise<Record<string, KanjiInfo>>>()
  private tags?: Promise<Record<string, string>>

  constructor(private load: Loader) {}

  private jShard(b: number): Promise<JShard> {
    let p = this.j.get(b)
    if (!p) {
      p = this.load(`j/${b}.json`) as Promise<JShard>
      p.catch(() => this.j.delete(b))
      this.j.set(b, p)
    }
    return p
  }

  /** Exact lookup by kanji form or reading. Results are ranked. */
  async lookup(key: string): Promise<Entry[]> {
    const k = normalizeKey(key)
    if (!k) return []
    const shard = await this.jShard(bucketOf(k, J_BUCKETS))
    return (shard.k[k] ?? []).map((i) => shard.e[i])
  }

  /**
   * All dictionary words that start at the beginning of `text`, longest first.
   * Used for tap lookups to catch compounds the tokenizer splits.
   */
  async prefixes(text: string, max = 12): Promise<{ text: string; entries: Entry[] }[]> {
    const chars = Array.from(text).slice(0, max)
    const out: { text: string; entries: Entry[] }[] = []
    for (let n = chars.length; n >= 1; n--) {
      const t = chars.slice(0, n).join('')
      if (!/[぀-ヿ㐀-鿿豈-﫿々〆ヶ]/.test(t)) continue
      const entries = await this.lookup(t)
      if (entries.length) out.push({ text: t, entries })
    }
    return out
  }

  async kanji(ch: string): Promise<KanjiInfo | undefined> {
    const b = ch.codePointAt(0)! % K_BUCKETS
    let p = this.k.get(b)
    if (!p) {
      p = this.load(`k/${b}.json`) as Promise<Record<string, KanjiInfo>>
      p.catch(() => this.k.delete(b))
      this.k.set(b, p)
    }
    return (await p)[ch]
  }

  async english(query: string): Promise<EnglishHit[]> {
    const words = englishWords(query)
    if (!words.length) return []
    const lists = await Promise.all(
      words.map(async (w) => {
        const b = bucketOf(w, E_BUCKETS)
        let p = this.e.get(b)
        if (!p) {
          p = this.load(`e/${b}.json`) as Promise<Record<string, EnglishHit[]>>
          p.catch(() => this.e.delete(b))
          this.e.set(b, p)
        }
        return (await p)[w] ?? []
      }),
    )
    if (lists.length === 1) return lists[0]
    // Intersect multi-word queries, keeping the order of the first list
    const key = (h: EnglishHit) => h[0] + '|' + h[1]
    const rest = lists.slice(1).map((l) => new Set(l.map(key)))
    const both = lists[0].filter((h) => rest.every((s) => s.has(key(h))))
    return both.length ? both : lists.flat()
  }

  tagDescriptions(): Promise<Record<string, string>> {
    if (!this.tags) this.tags = this.load('tags.json') as Promise<Record<string, string>>
    return this.tags
  }

  /** Best entry for a word from a text, preferring entries whose reading matches. */
  async bestEntry(word: Pick<Word, 's'> & Partial<Pick<Word, 'b' | 'br' | 'r' | 'c' | 'p'>>): Promise<{ entry: Entry; reading: RawReading } | undefined> {
    const reading = word.b ? word.br : word.r ?? toHiragana(word.s)
    const keys = [...new Set([word.b, word.s].filter((x): x is string => !!x))]
    for (const key of keys) {
      const entries = await this.lookup(key)
      if (!entries.length) continue
      if (reading) {
        const rh = toHiragana(reading)
        let best: { entry: Entry; reading: RawReading; score: number } | undefined
        entries.forEach((e, rank) => {
          const r = readings(e).find((x) => toHiragana(x.t) === rh)
          if (!r) return
          const score = rank + (posMatches(e, word) ? 0 : 20)
          if (!best || score < best.score) best = { entry: e, reading: r, score }
        })
        if (best) return { entry: best.entry, reading: best.reading }
      }
      // No reading match: only trust it when the key is a kanji form, or we have no reading
      const e = entries[0]
      if (!reading || hasKanji(key)) return { entry: e, reading: readings(e)[0] }
    }
    return undefined
  }

  /** Fill in pitch accent, JLPT level, entry id and missing readings. */
  async annotate(words: Word[]): Promise<void> {
    await Promise.all(
      words.map(async (w) => {
        if (w.p === 'sym' || w.p === 'prt' || w.p === 'aux' || w.p === 'x') return
        if (!/[぀-ヿ㐀-鿿]/.test(w.s)) return
        const hit = await this.bestEntry(w)
        if (!hit) return
        w.e = hit.entry.i
        if (hit.entry.j) w.j = hit.entry.j
        if (hit.reading.a) w.a = hit.reading.a
        // Unknown words from the tokenizer have no reading: take the dictionary's
        if (!w.r && hasKanji(w.s) && (!w.b || w.b === w.s)) {
          w.r = toHiragana(hit.reading.t)
          w.f = alignFurigana(w.s, w.r)
        }
      }),
    )
  }
}
