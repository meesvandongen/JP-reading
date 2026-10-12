import { toRomaji as wkRomaji } from 'wanakana'

export const KANJI_RE = /[㐀-䶿一-鿿豈-﫿々〆ヶ]|[\ud840-\ud87f][\udc00-\udfff]/
const KANA_ONLY_RE = /^[぀-ヿー・ｰ]+$/

export function hasKanji(s: string): boolean {
  return KANJI_RE.test(s)
}

export function isKanji(ch: string): boolean {
  return KANJI_RE.test(ch) && Array.from(ch).length === 1
}

export function isKana(s: string): boolean {
  return KANA_ONLY_RE.test(s)
}

export function hasJapanese(s: string): boolean {
  return /[぀-ヿ㐀-䶿一-鿿]/.test(s)
}

export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

export function toKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
}

export function toRomaji(kana: string): string {
  return wkRomaji(kana)
}

const SMALL = new Set('ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ')

/** Split kana into morae (きょう → きょ・う). */
export function morae(kana: string): string[] {
  const out: string[] = []
  for (const ch of kana) {
    if (SMALL.has(ch) && out.length) out[out.length - 1] += ch
    else out.push(ch)
  }
  return out
}
