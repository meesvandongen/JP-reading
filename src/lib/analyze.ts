// Text → words pipeline used both at build time (library) and in the browser
// (imported texts). The tokenizer is injected so this file has no kuromoji
// dependency.

import { alignFurigana, type Furigana } from './furigana'
import { buildWord, groupTokens, tokenReading } from './grammar'
import { hasKanji, isKana, toHiragana, toKatakana } from './kana'
import { extractRuby, type Hint, type RawChapter } from './text'
import type { Chapter, KToken, Sentence, Term, Word } from './types'

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
            pos_detail_2: proper && group.some((t) => t.pos_detail_2 === '人名') ? '人名' : '*',
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

export interface AnalyzeOptions {
  /** story-specific names and glosses (front matter `names:` / `glosses:`) */
  terms?: Term[]
  /** the text writes its kana in katakana (雨ニモマケズ): tokenize it as hiragana */
  katakanaScript?: boolean
}

const KATAKANA = /^[ァ-ヺーヽヾ・]+$/
const kataToHira = (s: string) => s.replace(/[ァ-ヶヽヾ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))

/**
 * Does this text use katakana where Japanese normally uses hiragana (old poems,
 * telegrams: 雨ニモマケズ)? Decided over the whole text, since a single short
 * sentence of loanwords looks much the same. Names in such a text can be cut
 * wrongly (メロス → め + ろ + す); declare them in `names:`.
 */
export function isKatakanaScript(text: string): boolean {
  const plain = extractRuby(text).plain
  const kata = plain.match(/[ァ-ヺ]/g)?.length ?? 0
  const hira = plain.match(/[ぁ-ゖ]/g)?.length ?? 0
  // katakana okurigana and particles right after kanji (雨ニ, 暑サ, 入レズ)
  const okurigana = plain.match(/[㐀-鿿々][ァ-ヶ]/g)?.length ?? 0
  return kata >= 20 && hira < kata * 0.05 && okurigana >= 3
}

/**
 * Tokenize katakana-script text through its hiragana spelling, which IPADIC
 * knows (ニモマケズ is one unknown token; にもまけず is に + も + まけ + ず). Kept
 * only when it leaves fewer characters unknown, so katakana names and loanwords
 * stay as they were. The surfaces stay in hiragana so that grouping (て, ば…)
 * works; `restoreSurfaces` puts the katakana back into the words.
 */
function tokenizeKatakanaScript(tokenizer: Tokenizer, text: string): KToken[] {
  const orig = tokenizer.tokenize(text)
  if (!/[ァ-ヶ]/.test(text)) return orig
  const hira = tokenizer.tokenize(kataToHira(text))
  const unknown = (ts: KToken[]) => ts.reduce((n, t) => n + (t.word_type === 'UNKNOWN' ? t.surface_form.length : 0), 0)
  return unknown(hira) < unknown(orig) ? hira : orig
}

/** Give words tokenized in hiragana their surface from the text again (まけず → マケズ). */
function restoreSurfaces(words: Word[], text: string) {
  let pos = 0
  for (const w of words) {
    const s = text.slice(pos, (pos += w.s.length))
    if (s === w.s) continue
    // cut the original text the way the hiragana is cut
    const cut = <T>(parts: T[], len: (p: T) => number, set: (p: T, s: string) => T): T[] => {
      let o = 0
      return parts.map((p) => set(p, s.slice(o, (o += len(p)))))
    }
    if (w.f) w.f = cut(w.f, (x) => x[0].length, (x, t) => (x[1] ? [t, x[1]] : [t]))
    if (w.g && w.g.reduce((n, x) => n + x.s.length, 0) === s.length) w.g = cut(w.g, (x) => x.s.length, (x, t) => ({ ...x, s: t }))
    w.s = s
  }
}

function termToken(tokenizer: Tokenizer, surface: string, term?: Term): KToken {
  const parts = tokenizer.tokenize(surface)
  // a gloss for a word the tokenizer already cuts as one keeps its part of speech (ドボン/副詞)
  if (term && !term.name && parts.length === 1) return { ...parts[0], term }
  const reading = term?.r ? toKatakana(term.r) : parts.map((t) => (t.reading && t.reading !== '*' ? t.reading : toKatakana(t.surface_form))).join('')
  return {
    surface_form: surface,
    pos: '名詞',
    pos_detail_1: term?.name ? '固有名詞' : '一般',
    pos_detail_2: '*',
    pos_detail_3: '*',
    conjugated_type: '*',
    conjugated_form: '*',
    basic_form: surface,
    reading,
    pronunciation: reading,
    ...(term ? { term } : {}),
  }
}

function tokenize(tokenizer: Tokenizer, text: string, opts: AnalyzeOptions): KToken[] {
  const terms = new Map((opts.terms ?? []).map((t) => [t.s, t]))
  const words = [...USER_WORDS, ...terms.keys()].sort((a, b) => b.length - a.length)
  // a katakana term is a whole katakana word: ラン is not cut out of ランチ
  // (except in katakana-script text, where particles are katakana too: メロスハ)
  const pattern = (w: string) => {
    const lit = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return KATAKANA.test(w) && !opts.katakanaScript ? `(?<![ァ-ヺー])${lit}(?![ァ-ヺー])` : lit
  }
  const re = new RegExp(words.map(pattern).join('|'), 'g')
  const tok = (t: string) => (opts.katakanaScript ? tokenizeKatakanaScript(tokenizer, t) : tokenizer.tokenize(t))
  const out: KToken[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(...tok(text.slice(last, m.index)))
    out.push(termToken(tokenizer, m[0], terms.get(m[0])))
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(...tok(text.slice(last)))
  return out
}

/** Can this token be part of a katakana compound? (nouns, sound words; not counters) */
function katakanaPart(t: KToken): boolean {
  if (t.term || !KATAKANA.test(t.surface_form) || t.surface_form === '・') return false
  if (t.pos === '名詞') return ['一般', '固有名詞', 'サ変接続', '形容動詞語幹', '副詞可能', '非自立'].includes(t.pos_detail_1)
  return t.pos === '副詞' || t.pos === '感動詞' || t.word_type === 'UNKNOWN'
}

/**
 * A run of katakana is one word: IPADIC cuts loanword compounds it doesn't know
 * (スマート/フォン, ドア/ノブ, メロン/パン) and sound words (ツヤ/ツヤ, チー/ン)
 * into pieces, and even tags the first piece as a person's name. Merge them;
 * the lookup still shows the parts.
 */
function mergeKatakana(tokens: KToken[]): KToken[] {
  const out: KToken[] = []
  for (const t of tokens) {
    const prev = out[out.length - 1]
    if (prev && katakanaPart(prev) && katakanaPart(t)) {
      const surface = prev.surface_form + t.surface_form
      const read = (x: KToken) => (x.reading && x.reading !== '*' ? x.reading : x.surface_form)
      const noun = prev.pos === '名詞' || t.pos === '名詞'
      out[out.length - 1] = {
        ...prev,
        surface_form: surface,
        pos: noun ? '名詞' : prev.pos,
        // サ変 / na-adjective stems keep their role (ダブルチェック + する)
        pos_detail_1: noun ? (['サ変接続', '形容動詞語幹'].includes(t.pos_detail_1) ? t.pos_detail_1 : '一般') : prev.pos_detail_1,
        pos_detail_2: '*',
        basic_form: surface,
        reading: read(prev) + read(t),
        pronunciation: read(prev) + read(t),
        word_type: prev.word_type === 'UNKNOWN' || t.word_type === 'UNKNOWN' ? 'UNKNOWN' : 'KNOWN',
      }
    } else out.push(t)
  }
  return out
}

/** Honorifics after a name that make it a person's name (大野さん, ケンくん). */
const HONORIFICS = new Set(['さん', 'くん', '君', 'ちゃん', '様', 'さま', '氏', '先生', '殿', 'どの', 'はん'])

export function analyzeSentence(tokenizer: Tokenizer, text: string, opts: AnalyzeOptions = {}): Word[] {
  const { plain, hints } = extractRuby(text)
  const raw = fixTokens(tokenize(tokenizer, plain, opts))
  const { tokens, partial } = applyTokenHints(opts.katakanaScript ? raw : mergeKatakana(raw), hints)
  const groups = groupTokens(tokens)
  const words = groups.map(buildWord)
  groups.forEach((g, i) => {
    const w = words[i]
    const term = g.find((t) => t.term)?.term
    if (term) {
      w.m = term.m
      if (term.name) w.p = 'name'
      return
    }
    const next = groups[i + 1]?.[0]
    if (!next || !HONORIFICS.has(next.surface_form) || g.length !== 1) return
    // ルーカスさん: a katakana word the tokenizer doesn't know, before an honorific, is a name
    if ((w.p === 'name' && g[0].pos_detail_2 === '人名') || (g[0].word_type === 'UNKNOWN' && KATAKANA.test(w.s))) {
      w.p = 'name'
      w.ps = 1
    }
  })
  if (opts.katakanaScript) restoreSurfaces(words, plain)
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

export function analyzeChapters(tokenizer: Tokenizer, chapters: RawChapter[], terms?: Term[]): Chapter[] {
  const text = chapters.flatMap((c) => c.p.flatMap((p) => p.s.map((s) => s.text))).join('\n')
  const opts: AnalyzeOptions = { terms, katakanaScript: isKatakanaScript(text) }
  return chapters.map((c) => ({
    ...(c.title ? { title: c.title } : {}),
    p: c.p.map((p) => ({
      s: p.s.map((s): Sentence => {
        const out: Sentence = { w: analyzeSentence(tokenizer, s.text, opts) }
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
