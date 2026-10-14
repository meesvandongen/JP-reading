// Turns kuromoji (IPADIC) morphemes into learner-friendly words:
//   食べ / させ / られ / まし / た  →  one word 食べさせられました
// with a dictionary form, reading, furigana and a grammar breakdown.

import { alignFurigana, type Furigana } from './furigana'
import { hasKanji, toHiragana } from './kana'
import { numberGroupReading } from './numbers'
import type { KToken, Pos, Step, Word } from './types'

// ---------------------------------------------------------------------------
// Part of speech

function posOf(t: KToken): Pos {
  switch (t.pos) {
    case '名詞':
      switch (t.pos_detail_1) {
        case '固有名詞': return 'name'
        case '代名詞': return 'pn'
        case '数': return 'num'
        case '形容動詞語幹': return 'na'
        case '接尾': return 'suf'
        default: return 'n'
      }
    case '動詞': return 'v'
    case '形容詞': return 'a'
    case '副詞': return 'adv'
    case '助詞': return 'prt'
    case '助動詞': return 'aux'
    case '接続詞': return 'conj'
    case '感動詞':
    case 'フィラー': return 'int'
    case '連体詞': return 'adn'
    case '接頭詞': return 'pre'
    case '記号': return 'sym'
    default:
      return /^[\s\p{P}\p{S}]+$/u.test(t.surface_form) ? 'sym' : 'x'
  }
}

const isVerb = (t?: KToken) => t?.pos === '動詞'
const isAdj = (t?: KToken) => t?.pos === '形容詞'
const isAux = (t?: KToken) => t?.pos === '助動詞'
const isConjParticle = (t?: KToken) => t?.pos === '助詞' && t.pos_detail_1 === '接続助詞'
const isCopula = (t: KToken) => t.conjugated_type === '特殊・デス' || t.conjugated_type === '特殊・ダ'

// ---------------------------------------------------------------------------
// Grouping

function shouldAttach(group: KToken[], t: KToken): boolean {
  const pt = group[group.length - 1]
  const head = group.find((x) => x.pos !== '接頭詞') ?? group[0]

  // prefix + noun (お + 茶)
  if (pt.pos === '接頭詞' && group.length === 1) return t.pos === '名詞' || t.pos === '動詞' || t.pos === '形容詞'

  if (t.pos === '助動詞') {
    if (isCopula(t)) {
      // な / に after a na-adjective stem (静かな)
      if (t.conjugated_form === '体言接続' && pt.pos_detail_1 === '形容動詞語幹') return true
      // explanatory ん/の + です (行くんです)
      if (pt.pos === '名詞' && pt.pos_detail_1 === '非自立' && (pt.surface_form === 'ん' || pt.surface_form === 'の'))
        return true
      // ない + です, たい + です, ませ + ん + でし + た
      return isAux(pt) && !isCopula(pt)
    }
    if (isVerb(pt) || isAdj(pt) || isAux(pt)) return true
    // じゃ + ない
    if (pt.pos === '助詞' && (pt.surface_form === 'じゃ' || pt.surface_form === 'では') && t.basic_form === 'ない') return true
    return false
  }

  if (t.pos === '動詞') {
    if (t.pos_detail_1 === '接尾') return isVerb(pt) || isAux(pt)
    if (t.pos_detail_1 === '非自立') {
      if (isVerb(pt) || isAux(pt) || isAdj(pt)) return true
      if (isConjParticle(pt) && ['て', 'で', 'ば'].includes(pt.surface_form)) return true
      return false
    }
    // サ変 noun + する (勉強する)
    if (t.basic_form === 'する' && head.pos === '名詞' && head.pos_detail_1 === 'サ変接続' && group.length <= 2) return true
    return false
  }

  if (t.pos === '助詞') {
    if (isVerb(pt) || isAdj(pt) || isAux(pt)) {
      if (t.pos_detail_1 === '接続助詞' && ['て', 'で', 'ば', 'ちゃ', 'じゃ', 'ながら'].includes(t.surface_form)) return true
      if (t.pos_detail_1 === '並立助詞' && (t.surface_form === 'たり' || t.surface_form === 'だり')) return true
    }
    // na-adjective + に (静かに)
    if (t.pos_detail_1 === '副詞化' && pt.pos_detail_1 === '形容動詞語幹') return true
    return false
  }

  if (t.pos === '形容詞' && t.pos_detail_1 === '非自立') {
    return isVerb(pt) || isAux(pt) || (isConjParticle(pt) && (pt.surface_form === 'て' || pt.surface_form === 'で'))
  }

  if (t.pos === '名詞') {
    // 降りそう, おいしそう, 降るそう: そう attaches to the verb or adjective
    if (t.surface_form === 'そう' && t.pos_detail_2 === '助動詞語幹')
      return isVerb(pt) || isAdj(pt) || isAux(pt) || pt.pos_detail_1 === '形容動詞語幹'
    // number + counter (三人), multi-part numbers (二十五)
    if (pt.pos === '名詞' && pt.pos_detail_1 === '数') {
      return t.pos_detail_1 === '数' || (t.pos_detail_1 === '接尾' && t.pos_detail_2 === '助数詞') || t.surface_form === '月'
    }
  }
  return false
}

export function groupTokens(tokens: KToken[]): KToken[][] {
  const groups: KToken[][] = []
  for (const t of tokens) {
    const g = groups[groups.length - 1]
    if (g && shouldAttach(g, t)) g.push(t)
    else groups.push([t])
  }
  return groups
}

// ---------------------------------------------------------------------------
// Readings

export function tokenReading(t: KToken): string {
  // IPADIC reads 日本 as にっぽん; にほん is the everyday reading
  if (t.surface_form === '日本') return 'にほん'
  // 色 as a suffix (オレンジ色, 何色) is いろ; IPADIC says しょく
  if (t.surface_form === '色' && t.pos_detail_1 === '接尾' && t.pos_detail_2 !== '助数詞') return 'いろ'
  const r = t.reading && t.reading !== '*' ? t.reading : t.surface_form
  return toHiragana(r)
}

function baseReading(t: KToken): string | undefined {
  const base = t.basic_form
  if (!base || base === '*') return undefined
  if (base === t.surface_form) return tokenReading(t)
  if (base === '来る') return 'くる'
  if (base === 'する' || base === '為る') return 'する'
  if (!hasKanji(base)) return base
  // Common prefix of surface and base; its reading comes from the surface.
  const sc = Array.from(t.surface_form)
  const bc = Array.from(base)
  let n = 0
  while (n < sc.length && n < bc.length && sc[n] === bc[n]) n++
  if (n === 0) return undefined
  const segs = alignFurigana(t.surface_form, tokenReading(t))
  let consumed = 0
  let reading = ''
  for (const [text, r] of segs) {
    const len = Array.from(text).length
    if (consumed + len <= n) {
      reading += r ?? toHiragana(text)
      consumed += len
    } else {
      if (r) return undefined // the cut falls inside a kanji run
      reading += toHiragana(Array.from(text).slice(0, n - consumed).join(''))
      consumed = n
      break
    }
  }
  const rest = bc.slice(n).join('')
  if (hasKanji(rest)) return undefined
  return reading + toHiragana(rest)
}

function mergeFurigana(parts: Furigana): Furigana {
  const out: Furigana = []
  for (const p of parts) {
    const last = out[out.length - 1]
    if (last && !last[1] && !p[1]) last[0] += p[0]
    else out.push(p[1] ? [p[0], p[1]] : [p[0]])
  }
  return out
}

// ---------------------------------------------------------------------------
// Grammar labels

// Honorific verbs whose 命令ｉ form (ください, いらっしゃい) is a polite request, not a blunt imperative
const HONORIFIC_I = new Set(['くださる', 'なさる', 'いらっしゃる', 'おっしゃる', 'ござる'])

function conjClass(t: KToken): string | undefined {
  const ct = t.conjugated_type
  if (ct.startsWith('一段')) return 'v1'
  if (ct.startsWith('五段')) return 'v5'
  if (ct.startsWith('サ変')) return 'vs'
  if (ct.startsWith('カ変')) return 'vk'
  if (ct.startsWith('形容詞')) return 'adj-i'
  return undefined
}

function verbClass(t: KToken): string {
  const ct = t.conjugated_type
  if (ct.startsWith('一段')) return 'ichidan (ru) verb'
  if (ct.startsWith('五段')) return 'godan (u) verb'
  if (ct.startsWith('サ変')) return 'irregular verb (する)'
  if (ct.startsWith('カ変')) return 'irregular verb (来る)'
  if (ct.startsWith('形容詞')) return 'i-adjective'
  return t.pos === '動詞' ? 'verb' : 'adjective'
}

interface Label { l: string; g?: string }

function auxLabel(t: KToken, prev: KToken | undefined, next: KToken | undefined): Label {
  const b = t.basic_form
  const surf = t.surface_form
  switch (t.pos) {
    case '助動詞':
      switch (b) {
        case 'ます': return { l: 'polite (ます)', g: 'masu-form' }
        case 'ない':
          if (t.conjugated_form === '仮定形') return { l: 'negative + conditional (なければ)', g: 'nakereba-naranai' }
          return { l: 'negative (ない)', g: 'negative-nai' }
        case 'ぬ':
        case 'ん': return { l: 'negative (ん/ぬ)', g: 'negative-nai' }
        case 'た':
        case 'だ':
          if (t.conjugated_type === '特殊・タ') {
            if (t.conjugated_form === '仮定形') return { l: 'conditional (たら) “if / when”', g: 'conditional-tara' }
            return { l: 'past (た)', g: 'past-ta' }
          }
          if (t.conjugated_form === '体言接続') return { l: 'na-adjective + な (before nouns)', g: 'na-adjectives' }
          if (t.conjugated_form === '仮定形') return { l: 'conditional (なら)', g: 'conditional-nara' }
          if (t.conjugated_form === '未然形' && next?.basic_form === 'う') return { l: 'probably (だろう)', g: 'copula-da-desu' }
          return { l: 'copula だ “is”', g: 'copula-da-desu' }
        case 'です':
          if (t.conjugated_form === '未然形' && next?.basic_form === 'う') return { l: 'probably (でしょう)', g: 'copula-da-desu' }
          return { l: 'polite copula (です)', g: 'copula-da-desu' }
        case 'たい': return { l: 'want to (たい)', g: 'tai-form' }
        case 'れる':
        case 'られる': return { l: 'passive / potential / honorific (られる)', g: 'passive' }
        case 'せる':
        case 'させる': return { l: 'causative “make / let” (させる)', g: 'causative' }
        case 'う':
        case 'よう': return { l: 'volitional “let’s / I will” (よう)', g: 'volitional' }
        case 'まい': return { l: 'negative volitional (まい)', g: 'volitional' }
        case 'らしい': return { l: 'seems / apparently (らしい)', g: 'rashii' }
        case 'そうだ': return { l: 'looks like / I hear (そうだ)', g: 'sou-da' }
        case 'ようだ': return { l: 'seems like (ようだ)', g: 'you-da' }
      }
      return { l: `auxiliary (${b})` }
    case '動詞':
      switch (b) {
        case 'れる':
        case 'られる':
          return { l: 'passive / potential / honorific (られる)', g: prev && /^(させ|せ|さ)$/.test(prev.surface_form) ? 'causative-passive' : 'passive' }
        case 'せる':
        case 'させる':
          return { l: 'causative “make / let” (させる)', g: next && /^(られ|れ)/.test(next.surface_form) ? 'causative-passive' : 'causative' }
        case 'する': return { l: 'する “do” (makes a verb from a noun)' }
        case 'いる':
        case 'てる': return { l: 'ongoing action / state (〜ている)', g: 'te-iru' }
        case 'ある': return { l: 'resulting state (〜てある)', g: 'te-aru' }
        case 'しまう':
        case 'ちゃう':
        case 'じゃう': return { l: 'completely / unfortunately (〜てしまう)', g: 'te-shimau' }
        case 'おく':
        case 'とく': return { l: 'do in advance (〜ておく)', g: 'te-oku' }
        case 'みる': return { l: 'try doing (〜てみる)', g: 'te-miru' }
        case 'くださる':
          if (t.conjugated_form.startsWith('命令')) return { l: 'please do (〜てください)', g: 'te-kudasai' }
          return { l: 'kindly do for me (〜てくださる)', g: 'giving-receiving' }
        case 'くれる':
        case 'もらう':
        case 'いただく':
        case 'あげる':
        case 'やる':
        case 'さしあげる': return { l: `doing a favour (〜て${b})`, g: 'giving-receiving' }
        case 'いく':
        case 'くる': return { l: `change over time / direction (〜て${b})` }
        case 'すぎる': return { l: 'too much (〜すぎる)', g: 'sugiru' }
        case 'なる':
          if (prev?.surface_form === 'ば' || prev?.surface_form === 'と') return { l: 'must (〜なければならない)', g: 'nakereba-naranai' }
          return { l: 'become (なる)' }
        case 'いける': return { l: 'must not (〜てはいけない)', g: 'te-wa-ikenai' }
        case '出す': return { l: 'start to (〜出す)' }
        case '始める': return { l: 'start to (〜始める)' }
        case '続ける': return { l: 'continue to (〜続ける)' }
        case '終わる': return { l: 'finish (〜終わる)' }
      }
      return { l: `helper verb (${b})` }
    case '形容詞':
      if (b === 'やすい' || b === 'にくい' || b === 'づらい') return { l: `easy / hard to (〜${b})`, g: 'yasui-nikui' }
      if (b === 'ほしい') return { l: 'want someone to (〜てほしい)', g: 'tai-form' }
      if (b === 'ない') return { l: 'negative (ない)', g: 'negative-nai' }
      return { l: `helper adjective (${b})` }
    case '助詞':
      switch (surf) {
        case 'て':
        case 'で': return { l: 'te-form (て)', g: 'te-form' }
        case 'ば': return { l: 'conditional “if” (ば)', g: 'conditional-ba' }
        case 'ちゃ':
        case 'じゃ':
          if (t.pos_detail_1 === '接続助詞') return { l: 'contraction of ては', g: 'te-wa-ikenai' }
          return { l: 'じゃ = では (negative copula)', g: 'copula-da-desu' }
        case 'では': return { l: 'では (negative copula)', g: 'copula-da-desu' }
        case 'ながら': return { l: 'while (ながら)', g: 'nagara' }
        case 'たり':
        case 'だり': return { l: 'things like… (たり)', g: 'tari-tari' }
        case 'に': return { l: 'adverb form (に)', g: 'na-adjectives' }
      }
      return { l: `particle (${surf})` }
    case '名詞':
      if (t.pos_detail_1 === '非自立' && (surf === 'ん' || surf === 'の')) return { l: 'explanatory ん/の', g: 'n-desu' }
      if (t.pos_detail_2 === '助数詞') return { l: 'counter', g: 'counters' }
      if (surf === 'そう' && t.pos_detail_2 === '助動詞語幹')
        return t.pos_detail_1 === '特殊' ? { l: 'I hear that (そうだ)', g: 'sou-da' } : { l: 'looks like (そう)', g: 'sou-da' }
      return { l: 'noun' }
  }
  return { l: surf }
}

const PARTICLES: Record<string, string> = {
  'は': 'particle-wa',
  'を': 'particle-wo',
  'へ': 'particle-he',
  'も': 'particle-mo',
  'の': 'particle-no',
  'まで': 'particle-kara-made',
  'か': 'particle-ka',
  'ね': 'sentence-ending-particles',
  'よ': 'sentence-ending-particles',
  'よね': 'sentence-ending-particles',
  'な': 'sentence-ending-particles',
  'わ': 'sentence-ending-particles',
  'ぞ': 'sentence-ending-particles',
  'ぜ': 'sentence-ending-particles',
  'さ': 'sentence-ending-particles',
  'けど': 'keredo-ga',
  'けれど': 'keredo-ga',
  'けれども': 'keredo-ga',
  'のに': 'noni',
  'ので': 'kara-node',
}

function particleGrammar(t: KToken): string | undefined {
  const s = t.surface_form
  if (s === 'が') return t.pos_detail_1 === '接続助詞' ? 'keredo-ga' : 'particle-ga'
  if (s === 'に') return 'particle-ni'
  if (s === 'で') return 'particle-de'
  if (s === 'と') return t.pos_detail_1 === '接続助詞' ? 'conditional-to' : 'particle-to'
  if (s === 'から') return t.pos_detail_1 === '接続助詞' ? 'kara-node' : 'particle-kara-made'
  if (s === 'ながら') return 'nagara'
  return PARTICLES[s]
}

// ---------------------------------------------------------------------------
// Building words

export function buildWord(group: KToken[]): Word {
  const head = group.find((t) => t.pos !== '接頭詞') ?? group[0]
  const surface = group.map((t) => t.surface_form).join('')
  // numbers and counters: 二人 → ふたり, 三匹 → さんびき
  const numeric = numberGroupReading(group)
  const reading = numeric ?? group.map(tokenReading).join('')
  const word: Word = { s: surface, p: posOf(head) }
  if (head.pos === '名詞' && head.pos_detail_1 === '形容動詞語幹') word.p = 'na'
  if (reading !== toHiragana(surface)) word.r = reading

  if (hasKanji(surface)) {
    word.f = numeric
      ? alignFurigana(surface, numeric)
      : mergeFurigana(group.flatMap((t) => alignFurigana(t.surface_form, tokenReading(t))))
  }

  // pronunciation of particles は / へ
  if (group.length === 1 && head.pos === '助詞' && (surface === 'は' || surface === 'へ')) {
    word.pr = surface === 'は' ? 'わ' : 'え'
  }

  // Dictionary form
  const prefix = group[0].pos === '接頭詞' && group.length > 1 ? group[0] : undefined
  const headIdx = group.indexOf(head)
  const next = group[headIdx + 1]
  if (head.pos === '名詞' && head.pos_detail_1 === 'サ変接続' && next?.basic_form === 'する') {
    word.b = (prefix?.surface_form ?? '') + head.surface_form + 'する'
    word.br = (prefix ? tokenReading(prefix) : '') + tokenReading(head) + 'する'
    word.p = 'v'
  } else if (head.basic_form && head.basic_form !== '*' && (head.pos === '動詞' || head.pos === '形容詞' || group.length > 1)) {
    const base = (prefix?.surface_form ?? '') + head.basic_form
    if (base !== surface) {
      word.b = base
      const br = baseReading(head)
      if (br) word.br = (prefix ? tokenReading(prefix) : '') + br
    }
  } else if (head.basic_form && head.basic_form !== '*' && head.basic_form !== head.surface_form) {
    word.b = head.basic_form
    word.br = baseReading(head)
  }

  const cls = conjClass(head)
  if (cls) word.c = cls
  if (word.b?.endsWith('する') && head.pos === '名詞') word.c = 'vs'

  // Grammar breakdown
  const grammar = new Set<string>()
  const conjugated = (head.pos === '動詞' || head.pos === '形容詞') && (group.length > 1 || head.conjugated_form !== '基本形')
  if (group.length > 1 || conjugated) {
    const steps: Step[] = []
    group.forEach((t, i) => {
      if (t === prefix) {
        steps.push({ s: t.surface_form, l: 'honorific / polite prefix' })
      } else if (t === head) {
        let l: string
        if (t.pos === '動詞' || t.pos === '形容詞') {
          l = verbClass(t)
          if (t.conjugated_form.startsWith('命令') && !HONORIFIC_I.has(t.basic_form)) {
            l += ', imperative'
            grammar.add('imperative')
          }
        } else if (t.pos === '名詞' && t.pos_detail_1 === '形容動詞語幹') l = 'na-adjective'
        else if (t.pos === '名詞' && t.pos_detail_1 === '数') l = 'number'
        else if (t.pos === '名詞') l = 'noun'
        else l = auxLabel(t, group[i - 1], group[i + 1]).l
        const step: Step = { s: t.surface_form, l }
        if (t.basic_form && t.basic_form !== '*' && t.basic_form !== t.surface_form) step.b = t.basic_form
        if (t.pos === '形容詞') step.g = 'i-adjectives'
        if (t.pos === '名詞' && t.pos_detail_1 === '形容動詞語幹') step.g = 'na-adjectives'
        if (t.pos === '助詞') {
          const lab = auxLabel(t, group[i - 1], group[i + 1])
          if (lab.g) step.g = lab.g
        }
        steps.push(step)
      } else {
        const lab = auxLabel(t, group[i - 1], group[i + 1])
        const step: Step = { s: t.surface_form, l: lab.l }
        if (t.basic_form && t.basic_form !== '*' && t.basic_form !== t.surface_form) step.b = t.basic_form
        if (lab.g) step.g = lab.g
        steps.push(step)
      }
    })
    for (const s of steps) if (s.g) grammar.add(s.g)
    // Patterns spanning several morphemes
    const forms = group.map((t) => t.basic_form)
    if (forms.includes('させる') || forms.includes('せる')) {
      const ci = Math.max(forms.indexOf('させる'), forms.indexOf('せる'))
      if (forms[ci + 1] === 'られる' || forms[ci + 1] === 'れる') grammar.add('causative-passive')
    }
    if (group.some((t) => t.basic_form === 'ない' && t.conjugated_form === '仮定形') && forms.includes('なる')) grammar.add('nakereba-naranai')
    if (steps.length > 1) word.g = steps
  } else if (head.pos === '助詞') {
    const g = particleGrammar(head)
    if (g) grammar.add(g)
  } else if (head.pos === '助動詞') {
    const g = auxLabel(head, undefined, undefined).g
    if (g) grammar.add(g)
  } else if (head.pos === '形容詞') {
    grammar.add('i-adjectives')
  } else if (head.pos === '名詞' && head.pos_detail_1 === '形容動詞語幹') {
    grammar.add('na-adjectives')
  }
  if (head.pos === '形容詞') grammar.add('i-adjectives')
  if (grammar.size) word.t = [...grammar]
  return word
}

export function tokensToWords(tokens: KToken[]): Word[] {
  return groupTokens(tokens).map(buildWord)
}
