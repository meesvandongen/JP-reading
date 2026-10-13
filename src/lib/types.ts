// Data model shared by the content build script and the app.

export type Pos =
  | 'n' // noun
  | 'name' // proper noun
  | 'pn' // pronoun
  | 'num' // number
  | 'v' // verb
  | 'a' // i-adjective
  | 'na' // na-adjective
  | 'adv' // adverb
  | 'prt' // particle
  | 'aux' // auxiliary / copula
  | 'conj' // conjunction
  | 'int' // interjection
  | 'adn' // adnominal (この, 大きな)
  | 'pre' // prefix
  | 'suf' // suffix
  | 'sym' // punctuation / symbol
  | 'x' // other

/** One part of a grammar breakdown, e.g. "させ" → causative. */
export interface Step {
  /** surface text of this part */
  s: string
  /** dictionary form of this part */
  b?: string
  /** short English label, e.g. "causative" */
  l: string
  /** grammar article id */
  g?: string
}

/** A tappable word (a group of morphemes, e.g. 食べ+させ+られ+た). */
export interface Word {
  /** surface */
  s: string
  /** reading in hiragana (omitted when equal to the surface) */
  r?: string
  /** furigana segments [text, reading?] (only when the surface contains kanji) */
  f?: [string, string?][]
  /** dictionary form (lemma) when different from surface */
  b?: string
  /** reading of the lemma */
  br?: string
  /** part of speech of the head */
  p: Pos
  /** grammar breakdown steps (only when there is something to explain) */
  g?: Step[]
  /** grammar article ids referenced by this word */
  t?: string[]
  /** pitch accent (downstep position(s), e.g. "0" or "1,0") */
  a?: string
  /** JLPT level of the best dictionary match (5 = N5 … 1 = N1) */
  j?: number
  /** JMdict entry id of the best match */
  e?: number
  /** conjugation class of the head (v1, v5, vs, vk, adj-i) — helps pick the right dictionary entry */
  c?: string
  /** pronunciation in hiragana when it differs from the reading (は → わ) */
  pr?: string
}

export interface Sentence {
  w: Word[]
  /** English translation */
  en?: string
}

export interface Paragraph {
  s: Sentence[]
}

export interface Chapter {
  title?: string
  p: Paragraph[]
}

export interface Keyword {
  w: string
  r: string
  m: string
  j?: number
}

export type Level =
  | 'beginner-1'
  | 'beginner-2'
  | 'beginner-3'
  | 'elementary'
  | 'intermediate'
  | 'advanced'
  | 'master'

export interface StoryMeta {
  id: string
  title: string
  title_en?: string
  level: Level | 'custom'
  category: string
  tags?: string[]
  summary?: string
  author?: string
  license?: string
  source?: string
  year?: number
  /** number of characters of Japanese text */
  chars: number
  /** number of sentences */
  sentences: number
  /** whether every sentence has a translation */
  translated: boolean
  /** distribution of JLPT levels of the words (index 0 = unknown, 1..5 = N1..N5) */
  jlpt?: number[]
  /** unique lemmas, used for difficulty / known-word stats */
  lemmas?: number
  /** date added (ISO) */
  added?: string
}

export interface StoryDoc {
  meta: StoryMeta
  keywords: Keyword[]
  chapters: Chapter[]
}

export interface LibraryIndex {
  built: string
  stories: StoryMeta[]
  grammar: GrammarMeta[]
}

export interface GrammarMeta {
  id: string
  title: string
  title_jp?: string
  jlpt?: string
  order?: number
  summary?: string
}

/** Raw kuromoji token (IPADIC). */
export interface KToken {
  surface_form: string
  pos: string
  pos_detail_1: string
  pos_detail_2: string
  pos_detail_3: string
  conjugated_type: string
  conjugated_form: string
  basic_form: string
  reading?: string
  pronunciation?: string
  word_type?: string
  word_position?: number
}
