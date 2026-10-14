// Readings of numbers and counters. The tokenizer reads each morpheme on its
// own, so 二人 comes out as ににん, 三匹 as さんひき and 六百 as ろくひゃく. This
// applies the sound changes: ふたり, さんびき, ろっぴゃく.

import type { KToken } from './types'

const DIGIT: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}
const UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }
const BIG: Record<string, number> = { 万: 1e4, 億: 1e8 }

/** Parse 二十五, 三千八百, 二〇二六, 2026, ２０２６. Undefined if it isn't a plain number. */
export function parseNumber(text: string): number | undefined {
  const s = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，]/g, '')
  if (/^[0-9]+$/.test(s)) return Number(s)
  if (/^[〇零一二三四五六七八九]+$/.test(s) && s.length > 1) return Number([...s].map((c) => DIGIT[c]).join(''))
  if (!/^[〇零一二三四五六七八九十百千万億0-9]+$/.test(s)) return undefined
  let total = 0
  let section = 0
  let digits = ''
  for (const c of s) {
    if (c in DIGIT || /[0-9]/.test(c)) digits += String(c in DIGIT ? DIGIT[c] : c)
    else if (c in UNIT) {
      section += (digits ? Number(digits) : 1) * UNIT[c]
      digits = ''
    } else if (c in BIG) {
      total += (section + (digits ? Number(digits) : 0) || 1) * BIG[c]
      section = 0
      digits = ''
    }
  }
  return total + section + (digits ? Number(digits) : 0)
}

const ONES = ['ぜろ', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう']

function belowTenThousand(n: number): string[] {
  const parts: string[] = []
  const th = Math.floor(n / 1000)
  const h = Math.floor((n % 1000) / 100)
  const t = Math.floor((n % 100) / 10)
  const o = n % 10
  if (th) parts.push(th === 1 ? 'せん' : th === 3 ? 'さんぜん' : th === 8 ? 'はっせん' : ONES[th] + 'せん')
  if (h) parts.push(h === 1 ? 'ひゃく' : h === 3 ? 'さんびゃく' : h === 6 ? 'ろっぴゃく' : h === 8 ? 'はっぴゃく' : ONES[h] + 'ひゃく')
  if (t) parts.push(t === 1 ? 'じゅう' : ONES[t] + 'じゅう')
  if (o) parts.push(ONES[o])
  return parts
}

/** Reading of a number as a list of parts; the last part takes the counter's sound changes. */
export function numberParts(n: number): string[] {
  if (n === 0) return ['ぜろ']
  const parts: string[] = []
  const oku = Math.floor(n / 1e8)
  const man = Math.floor((n % 1e8) / 1e4)
  const rest = n % 1e4
  if (oku) parts.push(...belowTenThousand(oku), 'おく')
  if (man) parts.push(...belowTenThousand(man), 'まん')
  if (rest) parts.push(...belowTenThousand(rest))
  return parts
}

export function numberReading(n: number): string {
  return numberParts(n).join('')
}

// いち → いっ, ろく → ろっ, はち → はっ, じゅう → じゅっ, ひゃく → ひゃっ
function geminate(part: string): string | undefined {
  if (part === 'いち' || part.endsWith('ろく') || part.endsWith('はち')) return part.slice(0, -1) + 'っ'
  if (part.endsWith('じゅう')) return part.slice(0, -1) + 'っ'
  if (part.endsWith('ゃく')) return part.slice(0, -1) + 'っ'
  return undefined
}

const P: Record<string, string> = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' }
const B: Record<string, string> = { は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ', か: 'が', け: 'げ', そ: 'ぞ', わ: 'ば' }
const voice = (c: string, map: Record<string, string>) => (map[c[0]] ?? c[0]) + c.slice(1)

interface Counter {
  r: string
  /** last parts (1, 6, 8, 10, 100…) that geminate: いっぴき */
  gem?: 'all' | 'no6'
  /** after さん/なん/せん/まん: さんびき, なんがい */
  voiced?: boolean
}

const H: Omit<Counter, 'r'> = { gem: 'all', voiced: true }
const COUNTERS: Record<string, Counter> = {
  匹: { r: 'ひき', ...H },
  本: { r: 'ほん', ...H },
  杯: { r: 'はい', ...H },
  分: { r: 'ふん', gem: 'all' },
  分間: { r: 'ふんかん', gem: 'all' },
  歩: { r: 'ほ', gem: 'all' },
  個: { r: 'こ', gem: 'all' },
  回: { r: 'かい', gem: 'all' },
  階: { r: 'かい', gem: 'all', voiced: true },
  軒: { r: 'けん', gem: 'all', voiced: true },
  か月: { r: 'かげつ', gem: 'all' },
  ヶ月: { r: 'かげつ', gem: 'all' },
  カ月: { r: 'かげつ', gem: 'all' },
  箇月: { r: 'かげつ', gem: 'all' },
  曲: { r: 'きょく', gem: 'all' },
  歳: { r: 'さい', gem: 'no6' },
  才: { r: 'さい', gem: 'no6' },
  冊: { r: 'さつ', gem: 'no6' },
  足: { r: 'そく', gem: 'no6', voiced: true },
  週間: { r: 'しゅうかん', gem: 'no6' },
  頭: { r: 'とう', gem: 'no6' },
  通: { r: 'つう', gem: 'no6' },
  着: { r: 'ちゃく', gem: 'no6' },
  点: { r: 'てん', gem: 'no6' },
  羽: { r: 'わ' },
}

const DAYS: Record<number, string> = {
  2: 'ふつか', 3: 'みっか', 4: 'よっか', 5: 'いつか', 6: 'むいか', 7: 'なのか', 8: 'ようか',
  9: 'ここのか', 10: 'とおか', 14: 'じゅうよっか', 20: 'はつか', 24: 'にじゅうよっか',
}

// counters IPADIC has as one token: 三日間, 四時半
const COMPOUND: Record<string, [string, string]> = {
  日間: ['日', 'かん'],
  時半: ['時', 'はん'],
  時間半: ['時間', 'はん'],
}

/** Reading of number + counter, e.g. (3, 匹) → さんびき. Undefined when there's nothing to fix. */
export function counterReading(n: number | 'なん', counter: string): string | undefined {
  const compound = COMPOUND[counter]
  if (compound) {
    const [base, tail] = compound
    const r = counterReading(n, base)
    return r ? r + tail : undefined
  }
  const parts = n === 'なん' ? ['なん'] : numberParts(n)
  const head = parts.slice(0, -1).join('')
  const last = parts[parts.length - 1]
  const lastDigit = n === 'なん' ? -1 : n % 10
  const lastIsDigit = n !== 'なん' && lastDigit !== 0

  switch (counter) {
    case '人':
      if (n === 1) return 'ひとり'
      if (n === 2) return 'ふたり'
      if (lastIsDigit && lastDigit === 4) return head + 'よにん'
      return undefined
    case '日':
      if (n === 'なん' || n === 1) return undefined
      if (DAYS[n]) return DAYS[n]
      if (lastDigit === 7) return head + 'しちにち'
      if (lastDigit === 9) return head + 'くにち'
      return undefined
    case '時':
    case '時間':
      if (lastIsDigit && lastDigit === 4) return head + 'よ' + (counter === '時' ? 'じ' : 'じかん')
      if (lastIsDigit && lastDigit === 7) return head + 'しち' + (counter === '時' ? 'じ' : 'じかん')
      if (lastIsDigit && lastDigit === 9) return head + 'く' + (counter === '時' ? 'じ' : 'じかん')
      return undefined
    case '月': {
      // months: しがつ, しちがつ, くがつ (IPADIC reads 5月 as 5つき)
      if (n === 'なん') return 'なんがつ'
      const m: Record<number, string> = { 4: 'し', 7: 'しち', 9: 'く' }
      return (lastIsDigit && m[lastDigit] ? head + m[lastDigit] : numberReading(n)) + 'がつ'
    }
    case '年':
      if (lastIsDigit && lastDigit === 4) return head + 'よねん'
      return undefined
    case '円':
      if (lastIsDigit && lastDigit === 4) return head + 'よえん'
      return undefined
    case '晩':
    case '口':
    case '言':
      if (n === 1) return 'ひと' + (counter === '晩' ? 'ばん' : counter === '口' ? 'くち' : 'こと')
      if (n === 2) return 'ふた' + (counter === '晩' ? 'ばん' : counter === '口' ? 'くち' : 'こと')
      return undefined
  }

  const c = COUNTERS[counter]
  if (!c) return undefined
  const gem = c.gem && geminate(last)
  const geminates = gem && (c.gem === 'all' || !last.endsWith('ろく'))
  if (counter === '羽') {
    // いちわ, さんば, ろっぱ, はっぱ, じゅっぱ
    const g = geminate(last)
    if (g && last !== 'いち') return head + g + 'ぱ'
    if (/^(さん|なん)$/.test(last)) return head + last + 'ば'
    return undefined
  }
  // 分 and 歩 become ぷん/ぽ after っ and ん: いっぷん, さんぷん, よんぷん, さんぽ
  const pAfterN = counter.startsWith('分') || counter === '歩'
  if (geminates) return head + gem + (c.voiced || pAfterN ? voice(c.r, P) : c.r)
  if (pAfterN && last.endsWith('ん')) return head + last + voice(c.r, P)
  if (c.voiced && /^(さん|なん|せん|まん)$/.test(last)) {
    // 階 and 軒 voice after さん/なん only: せんかい, せんけん
    if ((counter === '階' || counter === '軒') && !/^(さん|なん)$/.test(last)) return undefined
    return head + last + voice(c.r, B)
  }
  return undefined
}

const isNum = (t: KToken) => t.pos === '名詞' && t.pos_detail_1 === '数'

/**
 * Reading for a word made of [第] + number tokens + [counter], or undefined when
 * the plain per-token reading is right (or the group is something else).
 */
export function numberGroupReading(group: KToken[]): string | undefined {
  let i = 0
  let prefix = ''
  if (group[0]?.surface_form === '第' && group.length > 1) {
    prefix = 'だい'
    i = 1
  }
  const nums: KToken[] = []
  while (i < group.length && isNum(group[i])) nums.push(group[i++])
  if (!nums.length) return undefined
  const counter = group[i]
  if (i < group.length - 1) return undefined
  if (counter && !(counter.pos_detail_1 === '接尾' && counter.pos_detail_2 === '助数詞') && counter.surface_form !== '月') return undefined

  const text = nums.map((t) => t.surface_form).join('')
  const n: number | 'なん' | undefined = text === '何' ? 'なん' : parseNumber(text)
  if (n === undefined) return undefined
  if (n === 20 && counter?.surface_form === '歳' && text === '二十') return prefix + 'はたち'
  const num = n === 'なん' ? 'なん' : numberReading(n)
  if (!counter) return nums.length > 1 || /[0-9０-９]/.test(text) ? prefix + num : undefined
  const special = counterReading(n, counter.surface_form)
  if (special) return prefix + special
  const r = counter.reading && counter.reading !== '*' ? counter.reading : counter.surface_form
  return prefix + num + r.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
}
