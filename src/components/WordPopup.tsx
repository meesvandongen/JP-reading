import { useEffect, useState } from 'preact/hooks'
import type { Sentence, Word } from '../lib/types'
import type { Entry, RawReading } from '../lib/dict'
import { headword, readings } from '../lib/dict'
import { lemmaKey, sentenceText } from '../lib/analyze'
import { hasKanji, toHiragana, toRomaji } from '../lib/kana'
import { dictionary } from '../services/dictionary'
import { grammarTitle } from '../services/library'
import { speak } from '../services/tts'
import { known, setKnown } from '../state/db'
import { navigate } from '../router'
import { EntryView } from './EntryView'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

interface Result {
  entry: Entry
  reading?: RawReading
  label: string
}

async function findResults(word: Word, rest: string): Promise<Result[]> {
  const out: Result[] = []
  const seen = new Set<number>()
  const add = (entry: Entry, reading: RawReading | undefined, label: string) => {
    if (seen.has(entry.i)) return
    seen.add(entry.i)
    out.push({ entry, reading, label })
  }
  const best = await dictionary.bestEntry(word)
  // Compounds that start at this word and are longer than it (e.g. 日本 + 語 → 日本語).
  // Not for particles and auxiliaries: "が" + "い…" only finds noise.
  const grammatical = word.p === 'prt' || word.p === 'aux'
  const prefixes = grammatical ? [] : await dictionary.prefixes(rest, 12).catch(() => [])
  for (const p of prefixes) {
    if (p.text.length > word.s.length) {
      const e = p.entries[0]
      const hira = toHiragana(p.text)
      add(e, readings(e).find((r) => toHiragana(r.t) === hira), p.text)
    }
  }
  if (best) {
    // put the tokenizer's match first, compounds after
    out.unshift({ entry: best.entry, reading: best.reading, label: best.entry.uk ? word.b ?? word.s : headword(best.entry).word })
    seen.add(best.entry.i)
  }
  const key = word.b ?? word.s
  const rh = word.b ? word.br : word.r ?? toHiragana(word.s)
  let extra = 0
  for (const e of await dictionary.lookup(key).catch(() => [] as Entry[])) {
    const r = readings(e).find((x) => rh && toHiragana(x.t) === toHiragana(rh))
    // For kana words, other entries read the same way are homophones: show only a few
    if (!hasKanji(key) && out.length && ++extra > 3) break
    if (grammatical && out.length) break
    add(e, r, headword(e).word)
    if (out.length >= 8) break
  }
  if (!out.length) {
    // Unknown to the tokenizer and dictionary as a whole: try shorter prefixes of the surface
    for (const p of prefixes) add(p.entries[0], undefined, p.text)
  }
  return out
}

export function WordPopup({
  word,
  sentence,
  rest,
  storyId,
  onClose,
  onPlayFrom,
}: {
  word: Word | null
  sentence: Sentence | null
  /** sentence text from the start of this word */
  rest: string
  storyId?: string
  onClose: () => void
  onPlayFrom?: () => void
}) {
  const [results, setResults] = useState<Result[] | null>(null)
  const [sel, setSel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!word) return
    setResults(null)
    setSel(0)
    setError(null)
    findResults(word, rest).then(setResults, (e) => setError(navigator.onLine ? e.message : 'The dictionary is not available offline yet. Download it in Settings → Offline.'))
  }, [word, rest])

  if (!word || !sentence) return null
  const key = lemmaKey(word)
  const isKnown = known.value.get(key)?.status === 'known'
  const sText = sentenceText(sentence)
  const current = results?.[sel]
  const ctx = { sentence: sText, sentenceEn: sentence.en, surface: word.s, storyId }
  const reading = word.r ?? toHiragana(word.s)

  return (
    <Sheet
      open
      onClose={onClose}
      class="word-sheet"
      title={
        <span lang="ja" class="popup-surface">
          {word.s}
          {word.r && <span class="muted"> · {word.r}</span>}
          <span class="romaji"> {toRomaji(word.pr ?? reading)}</span>
        </span>
      }
    >
      {word.b && word.b !== word.s && (
        <div class="lemma-line">
          Dictionary form: <b lang="ja">{word.b}</b>
          {word.br && word.br !== word.b && <span lang="ja"> ({word.br})</span>}
        </div>
      )}

      {word.g && (
        <div class="breakdown">
          <div class="section-label">Grammar breakdown</div>
          <ol>
            {word.g.map((s) => (
              <li>
                <span class="bd-part" lang="ja">
                  {s.s}
                </span>
                {s.b && (
                  <span class="muted small" lang="ja">
                    {' '}
                    ({s.b})
                  </span>
                )}
                <span class="bd-label">{s.l}</span>
                {s.g && (
                  <button class="link small" onClick={() => navigate(`/grammar/${s.g}`)}>
                    {grammarTitle(s.g) ?? 'Learn'} →
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {!word.g && word.t && (
        <div class="grammar-links">
          {word.t.map((g) => (
            <button class="chip" onClick={() => navigate(`/grammar/${g}`)}>
              <Icon name="grammar" size={14} /> {grammarTitle(g) ?? g}
            </button>
          ))}
        </div>
      )}

      {error && <div class="notice">{error}</div>}
      {!results && !error && <div class="loading">Looking up…</div>}
      {results && results.length === 0 && <div class="muted">No dictionary entry found.</div>}
      {results && results.length > 1 && (
        <div class="result-tabs" role="tablist">
          {results.map((r, i) => (
            <button role="tab" aria-selected={i === sel} class={`chip ${i === sel ? 'on' : ''}`} onClick={() => setSel(i)} lang="ja">
              {r.label}
              {results.filter((x) => x.label === r.label).length > 1 && <sup>{results.filter((x, j) => x.label === r.label && j <= i).length}</sup>}
            </button>
          ))}
        </div>
      )}
      {current && <EntryView entry={current.entry} reading={current.reading} ctx={ctx} />}

      <div class="popup-sentence">
        <div class="section-label">
          Sentence
          <button class="icon-btn small" aria-label="Play sentence" onClick={() => speak(sText.replace(/[「」『』]/g, ''))}>
            <Icon name="volume" size={18} />
          </button>
          {onPlayFrom && (
            <button
              class="chip small"
              onClick={() => {
                onClose()
                onPlayFrom()
              }}
            >
              <Icon name="play" size={12} /> Play story from here
            </button>
          )}
        </div>
        <div lang="ja" class="jp">
          {sentence.w.map((w) => (w === word ? <mark>{w.s}</mark> : w.s))}
        </div>
        {sentence.en && <div class="muted">{sentence.en}</div>}
      </div>

      <div class="popup-footer">
        <label class="toggle">
          <input type="checkbox" checked={isKnown} onChange={() => setKnown(key, isKnown ? null : 'known')} />
          <span>I know this word</span>
        </label>
        <a
          class="link small"
          href={`https://jisho.org/search/${encodeURIComponent(word.b ?? word.s)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Jisho <Icon name="external" size={12} />
        </a>
      </div>
    </Sheet>
  )
}
