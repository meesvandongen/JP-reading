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
    pos += w.s.length
    const inside = hints.filter((h) => h.start >= start && h.end <= pos).sort((x, y) => x.start - y.start)
    if (!inside.length) continue
    // existing furigana segments with their offsets in the word
    const segs: { from: number; to: number; seg: Furigana[number] }[] = []
    let o = 0
    for (const seg of w.f ?? [[w.s, w.r] as Furigana[number]]) {
      segs.push({ from: o, to: o + seg[0].length, seg })
      o += seg[0].length
    }
    const f: Furigana = []
    // text between hints keeps its ruby where the old segments line up with it
    const gap = (from: number, to: number) => {
      if (from >= to) return
      const text = w.s.slice(from, to)
      if (!hasKanji(text)) return void f.push([text])
      const inner = segs.filter((x) => x.from >= from && x.to <= to)
      if (inner.reduce((n, x) => n + x.to - x.from, 0) === to - from) f.push(...inner.map((x) => x.seg))
      else f.push([text])
    }
    let cur = 0
    for (const h of inside) {
      gap(cur, h.start - start)
      f.push([w.s.slice(h.start - start, h.end - start), h.reading])
      cur = h.end - start
    }
    gap(cur, w.s.length)
    w.f = f.filter((x) => x[0])
    w.r = w.f.map(([t, r]) => toHiragana(r ?? t)).join('')
  }
}

const WEATHER = new Set(['雨', '雪', 'あめ', 'ゆき', '雹', 'みぞれ', '霰'])

/** Fix tokenizer choices that are wrong in an obvious context. */
function fixTokens(tokens: KToken[]): KToken[] {
  return tokens.map((t, i) => {
    // 雨が降ります: IPADIC picks 降りる (おります, "get off") over 降る
    if (t.basic_form === '降りる' && t.surface_form.startsWith('降り') && t.surface_form.length <= 3) {
      const p = tokens[i - 1]
      const n = tokens[i - 2]
      if (p?.pos === '助詞' && ['が', 'も', 'は'].includes(p.surface_form) && n && WEATHER.has(n.surface_form)) {
        const rest = t.surface_form.slice(2)
        return { ...t, basic_form: '降る', conjugated_type: '五段・ラ行', reading: 'フリ' + rest, pronunciation: 'フリ' + rest }
      }
    }
    return t
  })
}

/** Kana words the tokenizer splits wrongly (き + びだんご…): kept whole. */
const USER_WORDS = ['きびだんご']

function tokenize(tokenizer: Tokenizer, text: string): KToken[] {
  const re = new RegExp(USER_WORDS.join('|'), 'g')
  const out: KToken[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(...tokenizer.tokenize(text.slice(last, m.index)))
    out.push({
      surface_form: m[0],
      pos: '名詞',
      pos_detail_1: '一般',
      pos_detail_2: '*',
      pos_detail_3: '*',
      conjugated_type: '*',
      conjugated_form: '*',
      basic_form: m[0],
      reading: toKatakana(m[0]),
      pronunciation: toKatakana(m[0]),
    } as KToken)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(...tokenizer.tokenize(text.slice(last)))
  return out
}

export function analyzeSentence(tokenizer: Tokenizer, text: string): Word[] {
  const { plain, hints } = extractRuby(text)
  const raw = fixTokens(tokenize(tokenizer, plain))
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
