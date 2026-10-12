import { allWords, lemmaKey } from './analyze'
import type { Chapter } from './types'

export function textStats(chapters: Chapter[]) {
  const words = allWords(chapters)
  const sentences = chapters.flatMap((c) => c.p.flatMap((p) => p.s))
  const chars = words.filter((w) => w.p !== 'sym').reduce((n, w) => n + w.s.length, 0)
  const jlpt = [0, 0, 0, 0, 0, 0]
  const lemmas = new Set<string>()
  for (const w of words) {
    if (w.p === 'sym' || w.p === 'prt' || w.p === 'aux') continue
    lemmas.add(lemmaKey(w))
    jlpt[w.j ?? 0]++
  }
  return {
    chars,
    sentences: sentences.length,
    translated: sentences.length > 0 && sentences.every((s) => !!s.en),
    jlpt,
    lemmas: lemmas.size,
  }
}
