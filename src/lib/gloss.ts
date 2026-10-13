// Short, one-line summaries of words for compact views (lookup peek, sentence breakdown).

import type { Entry, RawReading } from './dict'
import type { Word } from './types'

/** First few glosses of the first sense that applies to this reading. */
export function shortGloss(entry: Entry, reading?: RawReading, max = 3): string {
  const sense = entry.s.find((s) => !reading || !s.sr || s.sr.includes(reading.t)) ?? entry.s[0]
  return sense ? sense.g.slice(0, max).join('; ') : ''
}

/** Strip the example / explanation part of a grammar label: "past (た)" → "past". */
function shortLabel(l: string): string {
  return l.replace(/\s*[(“].*$/, '').trim() || l
}

const HEAD_LABEL = /verb|adjective|noun|number/

/**
 * One-line grammar breakdown of a conjugated word, e.g.
 * 食べさせられました → ["食べる", "causative", "passive", "polite", "past"].
 */
export function breakdownChain(word: Word): string[] {
  if (!word.g) return []
  const head = Math.max(0, word.g.findIndex((s) => HEAD_LABEL.test(s.l)))
  return [word.b ?? word.s, ...word.g.slice(head + 1).map((s) => shortLabel(s.l))]
}
