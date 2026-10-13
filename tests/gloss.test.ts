import { describe, expect, it } from 'vitest'
import { breakdownChain, shortGloss } from '../src/lib/gloss'
import type { Entry } from '../src/lib/dict'
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
