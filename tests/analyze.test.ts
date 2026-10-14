import { beforeAll, describe, expect, it } from 'vitest'
import * as kuromoji from '@patdx/kuromoji'
import NodeDictionaryLoader from '@patdx/kuromoji/node'
import { analyzeSentence, type Tokenizer } from '../src/lib/analyze'
import { alignFurigana } from '../src/lib/furigana'
import { extractRuby, parsePlainText, parseStoryBody, splitSentences } from '../src/lib/text'
import type { KToken, Word } from '../src/lib/types'

let tokenizer: Tokenizer
beforeAll(async () => {
  const t = await new kuromoji.TokenizerBuilder({
    loader: new NodeDictionaryLoader({ dic_path: 'node_modules/@patdx/kuromoji/dict/' } as never),
  }).build()
  tokenizer = { tokenize: (s) => t.tokenize(s) as unknown as KToken[] }
})

const words = (s: string) => analyzeSentence(tokenizer, s)
const find = (ws: Word[], surface: string) => ws.find((w) => w.s === surface)

describe('furigana', () => {
  it('aligns kana anchors', () => {
    expect(alignFurigana('食べ物', 'たべもの')).toEqual([['食', 'た'], ['べ'], ['物', 'もの']])
    expect(alignFurigana('日本語', 'にほんご')).toEqual([['日本語', 'にほんご']])
    expect(alignFurigana('お茶', 'おちゃ')).toEqual([['お'], ['茶', 'ちゃ']])
  })
})

describe('readings', () => {
  it('reads 日本 as にほん', () => {
    expect(find(words('日本の夏は暑い。'), '日本')!.r).toBe('にほん')
  })

  it('reads 色 as a suffix as いろ', () => {
    expect(find(words('オレンジ色の空。'), '色')!.r).toBe('いろ')
  })

  it('applies the sound changes of numbers and counters', () => {
    const cases: [string, string][] = [
      ['二人', 'ふたり'], ['一人', 'ひとり'], ['四人', 'よにん'], ['何人', 'なんにん'],
      ['一匹', 'いっぴき'], ['三匹', 'さんびき'], ['六本', 'ろっぽん'], ['十一匹', 'じゅういっぴき'],
      ['三百年', 'さんびゃくねん'], ['六百', 'ろっぴゃく'], ['八百円', 'はっぴゃくえん'], ['三千円', 'さんぜんえん'],
      ['二十日', 'はつか'], ['十四日', 'じゅうよっか'], ['四時', 'よじ'], ['九時間', 'くじかん'],
      ['三階', 'さんがい'], ['三分', 'さんぷん'], ['二十分', 'にじゅっぷん'], ['八歳', 'はっさい'],
      ['二十歳', 'はたち'], ['一晩', 'ひとばん'], ['三羽', 'さんば'], ['六羽', 'ろっぱ'],
      ['5月', 'ごがつ'], ['12月', 'じゅうにがつ'], ['2026年', 'にせんにじゅうろくねん'], ['第三', 'だいさん'],
    ]
    for (const [text, reading] of cases) {
      const w = words(`${text}です。`)[0]
      expect([w.s, w.r]).toEqual([text, reading])
    }
  })
})

describe('word grouping', () => {
  it('groups conjugated verbs with their auxiliaries', () => {
    const ws = words('食べさせられませんでした。')
    const w = ws[0]
    expect(w.s).toBe('食べさせられませんでした')
    expect(w.b).toBe('食べる')
    expect(w.br).toBe('たべる')
    expect(w.t).toEqual(expect.arrayContaining(['causative-passive', 'masu-form', 'negative-nai', 'past-ta']))
  })

  it('handles te-form helpers and する verbs', () => {
    const ws = words('日本語を勉強しています。')
    const w = find(ws, '勉強しています')!
    expect(w.b).toBe('勉強する')
    expect(w.t).toContain('te-iru')
    expect(find(ws, 'を')!.t).toEqual(['particle-wo'])
  })

  it('keeps nouns and the copula apart', () => {
    const ws = words('田中さんは学生です。')
    expect(ws.map((w) => w.s)).toEqual(['田中', 'さん', 'は', '学生', 'です', '。'])
    expect(find(ws, 'は')!.pr).toBe('わ')
  })

  it('recognizes must-do patterns', () => {
    const w = words('行かなければならない。')[0]
    expect(w.s).toBe('行かなければならない')
    expect(w.t).toContain('nakereba-naranai')
  })

  it('attaches na-adjective な', () => {
    const w = words('静かな部屋。')[0]
    expect(w.s).toBe('静かな')
    expect(w.p).toBe('na')
  })
})

describe('ruby hints', () => {
  it('extracts Aozora-style ruby', () => {
    expect(extractRuby('｜朱鷺《とき》色と朱鷺《とき》')).toEqual({
      plain: '朱鷺色と朱鷺',
      hints: [
        { start: 0, end: 2, reading: 'とき' },
        { start: 4, end: 6, reading: 'とき' },
      ],
    })
  })

  it('overrides readings for names', () => {
    const ws = words('陽菜《ひな》さんが来ました。')
    expect(ws[0].s).toBe('陽菜')
    expect(ws[0].r).toBe('ひな')
    expect(ws[0].f).toEqual([['陽菜', 'ひな']])
  })

  it('applies a hint inside a longer token', () => {
    const ws = words('いちごを八《やっ》つのせました。')
    const w = ws.find((x) => x.s.includes('八'))!
    expect(w.f?.[0]).toEqual(['八', 'やっ'])
  })
})

describe('text parsing', () => {
  it('parses stories with translations and chapters', () => {
    const ch = parseStoryBody('## 一\n\n今日は雨です。\n> It is raining.\n寒いです。\n\n## 二\n晴れ。\n')
    expect(ch).toHaveLength(2)
    expect(ch[0].title).toBe('一')
    expect(ch[0].p[0].s).toEqual([{ text: '今日は雨です。', en: 'It is raining.' }, { text: '寒いです。' }])
  })

  it('splits sentences but keeps quotes together', () => {
    expect(splitSentences('「行こう。早く！」と言った。はい。')).toEqual(['「行こう。早く！」と言った。', 'はい。'])
  })

  it('parses pasted text into paragraphs', () => {
    const ch = parsePlainText('一行目です。二文目。\n\n　次の段落。')
    expect(ch[0].p).toHaveLength(2)
    expect(ch[0].p[0].s).toHaveLength(2)
  })
})
