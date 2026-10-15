import { signal } from '@preact/signals'
import type { LibraryIndex, StoryDoc, GrammarMeta, SeriesMeta } from '../lib/types'
import { getText, progress } from '../state/db'

export const library = signal<LibraryIndex | null>(null)
export const libraryError = signal<string | null>(null)

export async function loadLibrary() {
  try {
    const res = await fetch('data/library/index.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    library.value = { series: [], ...(await res.json()) }
  } catch (err) {
    libraryError.value = `Could not load the library (${(err as Error).message}).`
  }
}

const storyCache = new Map<string, Promise<StoryDoc>>()

export function getStory(id: string): Promise<StoryDoc> {
  if (id.startsWith('my-')) {
    return getText(id).then((t) => {
      if (!t) throw new Error('This text no longer exists.')
      return t
    })
  }
  let p = storyCache.get(id)
  if (!p) {
    p = fetch(`data/library/stories/${encodeURIComponent(id)}.json`).then((r) => {
      if (!r.ok) throw new Error(`Story not found (${r.status})`)
      return r.json()
    })
    p.catch(() => storyCache.delete(id))
    storyCache.set(id, p)
  }
  return p
}

export async function getGrammar(id: string): Promise<{ meta: GrammarMeta; html: string }> {
  const r = await fetch(`data/library/grammar/${encodeURIComponent(id)}.json`)
  if (!r.ok) throw new Error('Article not found')
  return r.json()
}

export function grammarTitle(id: string): string | undefined {
  return library.value?.grammar.find((g) => g.id === id)?.title
}

export function getSeries(id: string | undefined): SeriesMeta | undefined {
  return id ? library.value?.series.find((s) => s.id === id) : undefined
}

/** How many episodes are finished, and the episode to read next (the first unfinished one). */
export function seriesProgress(series: SeriesMeta): { done: number; next?: string } {
  const prog = progress.value
  return {
    done: series.episodes.filter((id) => prog.get(id)?.completedAt).length,
    next: series.episodes.find((id) => !prog.get(id)?.completedAt),
  }
}
