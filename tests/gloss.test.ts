import { describe, expect, it } from 'vitest'
import { breakdownChain, shortGloss } from '../src/lib/gloss'
import { isProperNoun, nameMismatch, type Entry } from '../src/lib/dict'
import type { Word } from '../src/lib/types'

describe('shortGloss', () => {
  const entry: Entry = {
    i: 1,
    k: ['生'],
    r: ['なま', 'せい'],
    s: [
      { p: ['n'], g: ['raw', 'uncooked', 'fresh', 'natural'], sr: ['なま'] },
      { p: ['n'], g: ['life'], sr: ['せい'] },
    ],
  }

  it('takes the first glosses of the first sense', () => {
    expect(shortGloss(entry)).toBe('raw; uncooked; fresh')
  })

  it('skips senses restricted to other readings', () => {
    expect(shortGloss(entry, { t: 'せい' })).toBe('life')
  })
})

describe('breakdownChain', () => {
  it('summarizes a conjugated word in one line', () => {
    const word: Word = {
      s: '食べさせられました',
      b: '食べる',
      p: 'v',
      g: [
        { s: '食べ', b: '食べる', l: 'ichidan verb' },
        { s: 'させ', b: 'させる', l: 'causative “make / let” (させる)', g: 'causative' },
        { s: 'られ', b: 'られる', l: 'passive / potential / honorific (られる)', g: 'passive' },
        { s: 'まし', b: 'ます', l: 'polite (ます)', g: 'masu-form' },
        { s: 'た', l: 'past (た)', g: 'past-ta' },
      ],
    }
    expect(breakdownChain(word)).toEqual(['食べる', 'causative', 'passive / potential / honorific', 'polite', 'past'])
  })

  it('is empty without a breakdown', () => {
    expect(breakdownChain({ s: '猫', p: 'n' })).toEqual([])
  })
})

describe('names and the dictionary', () => {
  const entry = (k: string[], r: string[], g: string): Entry => ({ i: 1, k, r, s: [{ p: ['n'], g: [g] }] })
  const ema = entry(['絵馬'], ['えま'], 'votive tablet')
  const ono = entry(['大野'], ['おおの'], 'large field')
  const kyoto = entry(['京都'], ['きょうと'], 'Kyoto (city, prefecture)')

  it('tells proper nouns from common words by their gloss', () => {
    expect(isProperNoun(kyoto)).toBe(true)
    expect(isProperNoun(entry(['伊勢神宮'], ['いせじんぐう'], 'Ise Grand Shrine'))).toBe(true)
    expect(isProperNoun(entry(['室町'], ['むろまち'], 'Muromachi period (1336-1573)'))).toBe(true)
    expect(isProperNoun(ono)).toBe(false)
    expect(isProperNoun(entry(['紫式部'], ['むらさきしきぶ'], 'Japanese beautyberry (Callicarpa japonica)'))).toBe(false)
  })

  it('does not read a katakana name as a native word in kanji', () => {
    expect(nameMismatch(ema, { t: 'えま' }, { s: 'エマ', p: 'name' })).toBe(true)
    expect(nameMismatch(ema, { t: 'えま' }, { s: 'エマ', p: 'n' })).toBe(false)
    // loanwords and words JMdict also lists in katakana still match
    expect(nameMismatch(entry([], ['イギリス'], 'United Kingdom'), { t: 'イギリス' }, { s: 'イギリス', p: 'name' })).toBe(false)
    const sakura: Entry = { i: 2, k: ['寒緋桜'], r: ['かんひざくら', { t: 'カンヒザクラ', n: 1 }], s: [{ p: ['n'], g: ['Taiwan cherry'] }] }
    expect(nameMismatch(sakura, { t: 'かんひざくら' }, { s: 'カンヒザクラ', p: 'name' })).toBe(false)
  })

  it('does not read a person\'s name as a common word', () => {
    expect(nameMismatch(ono, { t: 'おおの' }, { s: '大野', p: 'name', ps: 1 })).toBe(true)
    expect(nameMismatch(ono, { t: 'おおの' }, { s: '大野', p: 'name' })).toBe(false)
    expect(nameMismatch(kyoto, { t: 'きょうと' }, { s: '京都', p: 'name', ps: 1 })).toBe(false)
  })
})
