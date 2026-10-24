import { beforeAll, describe, expect, it } from 'vite-plus/test'
import * as kuromoji from '@patdx/kuromoji'
import NodeDictionaryLoader from '@patdx/kuromoji/node'
import { analyzeSentence, isKatakanaScript, type Tokenizer } from '../src/lib/analyze'
import { alignFurigana } from '../src/lib/furigana'
import { extractRuby, parsePlainText, parseStoryBody, parseTerms, splitSentences } from '../src/lib/text'
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

describe('katakana', () => {
  const surfaces = (s: string) => words(s).map((w) => w.s)

  it('keeps a run of katakana together as one word', () => {
    // IPADIC: スマート/フォン, ドア/ノブ, メロン/パン, ツヤ/ツヤ, チー/ン
    expect(surfaces('スマートフォンで調べた。')).toEqual(['スマートフォン', 'で', '調べた', '。'])
    expect(find(words('ドアノブとメロンパン。'), 'ドアノブ')!.p).toBe('n')
    expect(find(words('ドアノブとメロンパン。'), 'メロンパン')).toBeTruthy()
    expect(surfaces('髪がツヤツヤだ。')).toContain('ツヤツヤ')
    expect(surfaces('チーンと鳴った。')).toContain('チーン')
  })

  it('does not merge a katakana counter into its number', () => {
    const w = words('三リットルの水。')[0]
    expect([w.s, w.p]).toEqual(['三リットル', 'num'])
  })

  it('keeps サ変 katakana nouns working with する', () => {
    const w = find(words('ダブルチェックしました。'), 'ダブルチェックしました')!
    expect(w.b).toBe('ダブルチェックする')
  })

  it('tokenizes katakana-script text through hiragana', () => {
    const poem = ['雨ニモマケズ', '風ニモマケズ', '雪ニモ夏ノ暑サニモマケヌ', '丈夫ナカラダヲモチ', 'イツモシヅカニワラッテヰル']
    expect(isKatakanaScript(poem.join('\n'))).toBe(true)
    expect(isKatakanaScript('スマートフォン、インスタントラーメン、カップヌードル。')).toBe(false)
    const ws = analyzeSentence(tokenizer, '雨ニモマケズ', { katakanaScript: true })
    expect(ws.map((w) => w.s)).toEqual(['雨', 'ニ', 'モ', 'マケズ'])
    expect(ws[3].b).toBe('まける')
    const te = analyzeSentence(tokenizer, 'イツモシヅカニワラッテヰル', { katakanaScript: true })
    expect(find(te, 'ワラッテ')!.b).toBe('わらう')
  })

  it('keeps declared names whole in katakana-script mode', () => {
    const terms = parseTerms({ names: ['メロス|Melos'] })
    expect(analyzeSentence(tokenizer, 'メロスハ激怒シタ。', { katakanaScript: true, terms })[0]).toMatchObject({ s: 'メロス', p: 'name' })
  })
})

describe('names', () => {
  it('marks a person\'s name before an honorific', () => {
    const ws = words('大野さんとルーカスさんが来た。')
    expect(find(ws, '大野')).toMatchObject({ p: 'name', ps: 1 })
    expect(find(ws, 'ルーカス')).toMatchObject({ p: 'name', ps: 1 })
    expect(find(words('大野の家。'), '大野')!.ps).toBeUndefined()
  })

  it('applies the story\'s names and glosses', () => {
    const terms = parseTerms({
      names: ['清水寺|きよみずでら|Kiyomizu-dera (temple in Kyoto)', 'エマ|Emma (given name)', 'ラン|Lan (given name)'],
      glosses: ['ワン|woof'],
    })
    const ws = analyzeSentence(tokenizer, 'エマさんは清水寺に行った。', { terms })
    expect(find(ws, 'エマ')).toMatchObject({ p: 'name', m: 'Emma (given name)' })
    expect(find(ws, '清水寺')).toMatchObject({ p: 'name', r: 'きよみずでら', m: 'Kiyomizu-dera (temple in Kyoto)' })
    expect(find(analyzeSentence(tokenizer, '「ワン、ワン。」', { terms }), 'ワン')!.m).toBe('woof')
    // a katakana name is a whole word: ランチ is not ラン + チ
    const lunch = analyzeSentence(tokenizer, 'ランさんとランチを食べた。', { terms })
    expect(find(lunch, 'ラン')!.m).toBe('Lan (given name)')
    expect(find(lunch, 'ランチ')!.m).toBeUndefined()
  })

  it('rejects malformed terms', () => {
    expect(() => parseTerms({ names: ['エマ'] })).toThrow(/malformed/)
    expect(parseTerms({ names: ['山田|やまだ|Yamada'] })).toEqual([{ s: '山田', r: 'やまだ', m: 'Yamada', name: true }])
  })
})
