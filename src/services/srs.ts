// Spaced repetition: a compact SM-2 variant with learning steps.

import type { Card } from '../state/db'

export type Grade = 'again' | 'hard' | 'good' | 'easy'

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN
const LEARNING_STEPS = [1 * MIN, 10 * MIN]

export function newCard(fields: Omit<Card, 'created' | 'due' | 'interval' | 'ease' | 'reps' | 'lapses' | 'state'>): Card {
  const now = Date.now()
  return { ...fields, created: now, due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0, state: 'new' }
}

/** Start of the next local day (cards due "tomorrow" become due at 4am). */
function dayStart(offsetDays: number, now = Date.now()): number {
  const d = new Date(now)
  d.setHours(4, 0, 0, 0)
  if (d.getTime() <= now) d.setDate(d.getDate() + 1)
  d.setDate(d.getDate() + offsetDays - 1)
  return d.getTime()
}

export function schedule(card: Card, grade: Grade, now = Date.now()): Card {
  const c: Card = { ...card, lastReview: now, reps: card.reps + 1 }
  if (c.state === 'new' || c.state === 'learning') {
    const step = c.step ?? 0
    const graduate = (days: number) => {
      c.state = 'review'
      c.step = 0
      // relearning after a lapse keeps part of the old interval
      c.interval = card.lapses && card.interval > 0 ? Math.max(days, Math.round(card.interval * 0.5)) : days
      c.due = dayStart(c.interval, now)
    }
    if (grade === 'again') {
      c.state = 'learning'
      c.step = 0
      c.due = now + LEARNING_STEPS[0]
    } else if (grade === 'hard') {
      c.state = 'learning'
      c.step = step
      c.due = now + LEARNING_STEPS[Math.min(step, LEARNING_STEPS.length - 1)] * 1.5
    } else if (grade === 'good' && step + 1 < LEARNING_STEPS.length) {
      c.state = 'learning'
      c.step = step + 1
      c.due = now + LEARNING_STEPS[step + 1]
    } else {
      graduate(grade === 'easy' ? 4 : 1)
    }
    return c
  }
  // review card
  const overdueDays = Math.max(0, (now - card.due) / DAY)
  if (grade === 'again') {
    c.lapses++
    c.ease = Math.max(1.3, c.ease - 0.2)
    c.state = 'learning'
    c.step = 1
    c.due = now + LEARNING_STEPS[1]
    return c
  }
  let ivl: number
  if (grade === 'hard') {
    c.ease = Math.max(1.3, c.ease - 0.15)
    ivl = Math.max(card.interval + 1, card.interval * 1.2)
  } else if (grade === 'good') {
    ivl = Math.max(card.interval + 1, (card.interval + overdueDays / 2) * c.ease)
  } else {
    c.ease += 0.15
    ivl = Math.max(card.interval + 2, (card.interval + overdueDays) * c.ease * 1.3)
  }
  // a little fuzz so cards added together spread out
  ivl = Math.round(ivl * (0.95 + Math.random() * 0.1))
  c.interval = Math.min(ivl, 3650)
  c.due = dayStart(c.interval, now)
  return c
}

/** Human readable next interval for a grade, for the answer buttons. */
export function previewInterval(card: Card, grade: Grade): string {
  const next = schedule(card, grade, Date.now())
  const ms = next.due - Date.now()
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))}m`
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))}h`
  const days = Math.round(ms / DAY)
  if (days < 31) return `${days}d`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}

export function isDue(card: Card, now = Date.now()): boolean {
  return card.state !== 'new' && card.due <= now
}

/** Mature = interval of 21 days or more. */
export function cardStage(card: Card): 'new' | 'learning' | 'young' | 'mature' {
  if (card.state === 'new') return 'new'
  if (card.state === 'learning') return 'learning'
  return card.interval >= 21 ? 'mature' : 'young'
}
