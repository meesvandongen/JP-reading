import { useEffect, useRef, useState } from 'preact/hooks'
import { isRomaji, toKana } from 'wanakana'
import { headword, type Entry, type EnglishHit } from '../lib/dict'
import { KANJI_RE, hasJapanese } from '../lib/kana'
import { dictionary } from '../services/dictionary'
import { shortMeaning } from '../services/cards'
import { navigate, route } from '../router'
import { EntryView, KanjiPanel } from '../components/EntryView'
import { JlptBadge } from '../components/Badges'
import { Icon } from '../components/Icon'
import { pendingImport } from './ImportPage'

interface Results {
  query: string
  entries: Entry[]
  english: EnglishHit[]
  kana?: string
}

async function search(q: string): Promise<Results> {
  const query = q.trim()
  const out: Results = { query, entries: [], english: [] }
  if (!query) return out
  const seen = new Set<number>()
  const addAll = (list: Entry[]) => {
    for (const e of list) {
      if (seen.has(e.i)) continue
      seen.add(e.i)
      out.entries.push(e)
    }
  }
  if (hasJapanese(query) || KANJI_RE.test(query)) {
    addAll(await dictionary.lookup(query))
    // words at the start of the query (longest first) — handy for pasted phrases
    for (const p of await dictionary.prefixes(query, 12)) addAll(p.entries.slice(0, 5))
  } else {
    const lower = query.toLowerCase()
    if (isRomaji(lower) && /^[a-z' -]+$/.test(lower)) {
      const kana = toKana(lower.replace(/\s+/g, ''))
      if (hasJapanese(kana) && !/[a-z]/i.test(kana)) {
        out.kana = kana
        addAll(await dictionary.lookup(kana))
      }
    }
    out.english = await dictionary.english(lower)
  }
  return out
}

export function DictionaryPage() {
  const q = route.value.query.get('q') ?? ''
  const [input, setInput] = useState(q)
  const [results, setResults] = useState<Results | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInput(q)
    if (!q) {
      setResults(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    search(q).then(
      (r) => {
        if (cancelled) return
        setResults(r)
        setOpen(r.entries.length === 1 ? r.entries[0].i : null)
        setLoading(false)
      },
      (e) => {
        if (cancelled) return
        setError(navigator.onLine ? e.message : 'Offline: download the dictionary in Settings to search without a connection.')
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [q])

  useEffect(() => {
    if (!q) inputRef.current?.focus()
  }, [])

  const submit = (e: Event) => {
    e.preventDefault()
    navigate(`/dictionary?q=${encodeURIComponent(input.trim())}`, { replace: !!q })
  }

  const kanjiInQuery = Array.from(new Set(Array.from(q).filter((c) => KANJI_RE.test(c)))).slice(0, 8)

  return (
    <div class="page dictionary">
      <header class="page-head">
        <h1>Dictionary</h1>
      </header>
      <form class="search-box big" onSubmit={submit}>
        <Icon name="search" size={20} />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          placeholder="日本語, nihongo or English"
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellcheck={false}
        />
      </form>
      {!q && (
        <div class="dict-help muted">
          <p>Search in Japanese (kanji or kana), in romaji (taberu) or in English (to eat).</p>
          <p>
            Includes JMdict (≈ 220,000 entries) with pitch accent and JLPT levels, and KANJIDIC2 with stroke order animations for 13,000 kanji.
          </p>
        </div>
      )}
      {loading && <div class="loading">Searching…</div>}
      {error && <div class="notice">{error}</div>}
      {results && q.length > 8 && hasJapanese(q) && (
        <button
          class="import-cta"
          onClick={() => {
            pendingImport.text = q
            navigate('/import')
          }}
        >
          <Icon name="text" /> Read this as a text with furigana and word-by-word look-up
        </button>
      )}
      {kanjiInQuery.length > 0 && <KanjiPanel chars={kanjiInQuery} />}
      {results && (
        <>
          {results.kana && results.entries.length > 0 && <div class="muted small">Romaji → {results.kana}</div>}
          <ul class="results">
            {results.entries.map((e) => {
              const hw = headword(e)
              return (
                <li class={open === e.i ? 'open' : ''}>
                  {open === e.i ? (
                    <div>
                      <button class="link small" onClick={() => setOpen(null)}>
                        ▲ collapse
                      </button>
                      <EntryView entry={e} />
                    </div>
                  ) : (
                    <button class="result-row" onClick={() => setOpen(e.i)}>
                      <span class="rr-word" lang="ja">
                        {hw.word}
                      </span>
                      {hw.word !== hw.reading && (
                        <span class="rr-reading" lang="ja">
                          {hw.reading}
                        </span>
                      )}
                      <JlptBadge level={e.j} />
                      {e.c && <span class="badge common">common</span>}
                      <span class="rr-gloss">{shortMeaning(e, 2)}</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {results.english.length > 0 && (
            <>
              <h2 class="section-title">English matches</h2>
              <ul class="results">
                {results.english.map(([word, reading, gloss, j]) => (
                  <li>
                    <button class="result-row" onClick={() => navigate(`/dictionary?q=${encodeURIComponent(word || reading)}`)}>
                      <span class="rr-word" lang="ja">
                        {word || reading}
                      </span>
                      {word && (
                        <span class="rr-reading" lang="ja">
                          {reading}
                        </span>
                      )}
                      <JlptBadge level={j || undefined} />
                      <span class="rr-gloss">{gloss}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {results.entries.length === 0 && results.english.length === 0 && <p class="muted">No results for “{results.query}”.</p>}
        </>
      )}
    </div>
  )
}
