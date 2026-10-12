// Text → words pipeline used both at build time (library) and in the browser
// (imported texts). The tokenizer is injected so this file has no kuromoji
// dependency.

import { alignFurigana, type Furigana } from './furigana'
import { buildWord, groupTokens, tokenReading } from './grammar'
import { hasKanji, isKana, toHiragana, toKatakana } from './kana'
import { extractRuby, type Hint, type RawChapter } from './text'
import type { Chapter, KToken, Sentence, Word } from './types'

export interface Tokenizer {
  tokenize(text: string): KToken[]
}

/** Apply reading hints that span whole tokens by merging/overriding tokens. */
function applyTokenHints(tokens: KToken[], hints: Hint[]): { tokens: KToken[]; partial: Hint[] } {
  if (!hints.length) return { tokens, partial: [] }
  const starts: number[] = []
  let pos = 0
  for (const t of tokens) {
    starts.push(pos)
    pos += t.surface_form.length
  }
  const out: KToken[] = []
  const partial: Hint[] = []
  let i = 0
  const used = new Set<Hint>()
  while (i < tokens.length) {
    const h = hints.find((x) => x.start === starts[i] && !used.has(x))
    if (h) {
      let j = i
      while (j < tokens.length && starts[j] + tokens[j].surface_form.length < h.end) j++
      if (j < tokens.length && starts[j] + tokens[j].surface_form.length === h.end) {
        used.add(h)
        const group = tokens.slice(i, j + 1)
        const surface = group.map((t) => t.surface_form).join('')
        if (group.length === 1) {
          out.push({ ...group[0], reading: toKatakana(h.reading), pronunciation: toKatakana(h.reading) })
        } else {
          const proper = group.some((t) => t.pos_detail_1 === '固有名詞' || t.word_type === 'UNKNOWN')
          out.push({
            surface_form: surface,
            pos: '名詞',
            pos_detail_1: proper ? '固有名詞' : '一般',
            pos_detail_2: '*',
            pos_detail_3: '*',
            conjugated_type: '*',
            conjugated_form: '*',
            basic_form: surface,
            reading: toKatakana(h.reading),
            pronunciation: toKatakana(h.reading),
          })
        }
        i = j + 1
        continue
      }
    }
    out.push(tokens[i])
    i++
  }
  for (const h of hints) if (!used.has(h)) partial.push(h)
  return { tokens: out, partial }
}

/** Hints that fall inside a word: rebuild that word's furigana. */
function applyPartialHints(words: Word[], hints: Hint[]) {
  if (!hints.length) return
  let pos = 0
  for (const w of words) {
    const start = pos
    const end = pos + w.s.length
    pos = end
    for (const h of hints) {
      if (h.start < start || h.end > end) continue
      const before = w.s.slice(0, h.start - start)
      const middle = w.s.slice(h.start - start, h.end - start)
      const after = w.s.slice(h.end - start)
      const seg = (text: string): Furigana | null => {
        if (!text) return []
        if (!hasKanji(text)) return [[text]]
        return null
      }
      const b = seg(before)
      const a = seg(after)
      const f: Furigana = []
      if (b) f.push(...b)
      else if (w.f) {
        // keep existing ruby for the part before the hint when it lines up
        let acc = ''
        for (const s of w.f) {
          if (acc.length >= before.length) break
          f.push(s)
          acc += s[0]
        }
        if (acc !== before) f.splice(0, f.length, [before])
      } else f.push([before])
      f.push([middle, h.reading])
      if (a) f.push(...a)
      else f.push([after])
      w.f = f.filter((x) => x[0])
      w.r = f.map(([t, r]) => toHiragana(r ?? t)).join('')
    }
  }
}

export function analyzeSentence(tokenizer: Tokenizer, text: string): Word[] {
  const { plain, hints } = extractRuby(text)
  const raw = tokenizer.tokenize(plain)
  const { tokens, partial } = applyTokenHints(raw, hints)
  const words = groupTokens(tokens).map(buildWord)
  applyPartialHints(words, partial)
  // Hinted names: make sure furigana uses the hint even for unusual kanji
  for (const w of words) {
    if (w.r && hasKanji(w.s) && !w.f) w.f = alignFurigana(w.s, w.r)
  }
  return mergeSpaces(words)
}

/** Merge whitespace-only tokens into the previous word so spacing survives. */
function mergeSpaces(words: Word[]): Word[] {
  const out: Word[] = []
  for (const w of words) {
    if (/^\s+$/.test(w.s) && out.length && out[out.length - 1].p === 'sym') {
      out[out.length - 1].s += w.s
      continue
    }
    if (/^\s+$/.test(w.s)) {
      out.push({ s: w.s, p: 'sym' })
      continue
    }
    out.push(w)
  }
  return out
}

export function analyzeChapters(tokenizer: Tokenizer, chapters: RawChapter[]): Chapter[] {
  return chapters.map((c) => ({
    ...(c.title ? { title: c.title } : {}),
    p: c.p.map((p) => ({
      s: p.s.map((s): Sentence => {
        const out: Sentence = { w: analyzeSentence(tokenizer, s.text) }
        if (s.en) out.en = s.en
        return out
      }),
    })),
  }))
}

export function allWords(chapters: Chapter[]): Word[] {
  return chapters.flatMap((c) => c.p.flatMap((p) => p.s.flatMap((s) => s.w)))
}

export function sentenceText(s: Sentence): string {
  return s.w.map((w) => w.s).join('')
}

/** Reading of a sentence in hiragana (for TTS fallback / romaji). */
export function sentenceReading(s: Sentence): string {
  return s.w.map((w) => w.pr ?? w.r ?? (isKana(w.s) ? toHiragana(w.s) : w.s)).join('')
}

/** Lemma key used for known-word tracking and SRS. */
export function lemmaKey(w: Word): string {
  return `${w.b ?? w.s}|${w.b ? w.br ?? '' : w.r ?? toHiragana(w.s)}`
}

export function isLookupWord(w: Word): boolean {
  return w.p !== 'sym' && /[぀-ヿ㐀-鿿豈-﫿A-Za-zＡ-Ｚａ-ｚ0-9０-９]/.test(w.s)
}

export { tokenReading }
