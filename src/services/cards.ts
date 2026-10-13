import { headword, type Entry, type RawReading, readings } from '../lib/dict'
import { toHiragana } from '../lib/kana'
import { cards, deleteCard, logActivity, putCard, type Card } from '../state/db'
import { newCard } from './srs'

export function cardId(word: string, reading: string) {
  return `${word}|${toHiragana(reading)}`
}

export function shortMeaning(e: Entry, max = 3): string {
  return e.s
    .slice(0, max)
    .map((s) => s.g.slice(0, 3).join(', '))
    .join('; ')
}

export interface CardContext {
  sentence?: string
  sentenceEn?: string
  surface?: string
  storyId?: string
}

/** Headword to store for an entry, given the reading seen in the text. */
export function cardHead(e: Entry, reading?: RawReading): { word: string; reading: string; accent?: string } {
  const hw = headword(e)
  const r = reading ?? readings(e)[0]
  if (e.uk) return { word: r.t, reading: r.t, accent: r.a }
  return { word: hw.word, reading: r.t, accent: r.a }
}

export function isSaved(word: string, reading: string) {
  return cards.value.has(cardId(word, reading))
}

export async function saveEntry(e: Entry, reading: RawReading | undefined, ctx: CardContext = {}) {
  const head = cardHead(e, reading)
  const id = cardId(head.word, head.reading)
  if (cards.value.has(id)) return cards.value.get(id)!
  const card = newCard({
    id,
    word: head.word,
    reading: head.reading,
    meaning: shortMeaning(e),
    entryId: e.i,
    ...(e.j ? { jlpt: e.j } : {}),
    ...(head.accent ? { accent: head.accent } : {}),
    ...ctx,
  })
  await putCard(card)
  return card
}

export async function toggleSaved(e: Entry, reading: RawReading | undefined, ctx: CardContext = {}): Promise<boolean> {
  const head = cardHead(e, reading)
  const id = cardId(head.word, head.reading)
  if (cards.value.has(id)) {
    await deleteCard(id)
    return false
  }
  await saveEntry(e, reading, ctx)
  return true
}

export async function saveKeyword(word: string, reading: string, meaning: string, jlpt?: number, storyId?: string) {
  const id = cardId(word, reading || word)
  if (cards.value.has(id)) {
    await deleteCard(id)
    return
  }
  await putCard(newCard({ id, word, reading: reading || word, meaning, ...(jlpt ? { jlpt } : {}), ...(storyId ? { storyId } : {}) }))
}

export async function recordReview(card: Card) {
  await putCard(card)
  await logActivity({ reviews: 1 })
}

/** Anki-friendly TSV export. */
export function exportCardsTsv(list: Card[]): string {
  const esc = (s = '') => s.replace(/[\t\n]/g, ' ')
  const rows = list.map((c) =>
    [c.word, c.reading, c.meaning, c.sentence ?? '', c.sentenceEn ?? '', c.jlpt ? `N${c.jlpt}` : ''].map(esc).join('\t'),
  )
  return ['#separator:tab', '#html:false', '#columns:Word\tReading\tMeaning\tSentence\tTranslation\tJLPT', ...rows].join('\n')
}
