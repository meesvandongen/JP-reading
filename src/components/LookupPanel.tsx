import { useEffect, useRef, useState } from 'preact/hooks'
import type { Sentence, Word } from '../lib/types'
import type { Entry, RawReading } from '../lib/dict'
import { headword, readings } from '../lib/dict'
import { isLookupWord, lemmaKey, sentenceText } from '../lib/analyze'
import { breakdownChain, shortGloss } from '../lib/gloss'
import { hasKanji, toHiragana, toRomaji } from '../lib/kana'
import { dictionary } from '../services/dictionary'
import { grammarTitle } from '../services/library'
import { cachedTranslation, deviceTranslation, translateOnDevice, webTranslators } from '../services/translate'
import { speak } from '../services/tts'
import { known, setKnown } from '../state/db'
import { navigate } from '../router'
import { EntryView } from './EntryView'
import { Icon } from './Icon'

export type LookupView = 'word' | 'sentence'

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

const offlineMessage = (e: Error) =>
  navigator.onLine ? e.message : 'The dictionary is not available offline yet. Download it in Settings → Offline.'

const HOLD_HINT_KEY = 'jp-reading:hint-hold'
export function markHoldHintSeen() {
  try {
    localStorage.setItem(HOLD_HINT_KEY, '1')
  } catch {
    /* storage unavailable */
  }
}
function holdHintSeen() {
  try {
    return !!localStorage.getItem(HOLD_HINT_KEY)
  } catch {
    return true
  }
}

const wideQuery = typeof matchMedia !== 'undefined' ? matchMedia('(min-width: 900px)') : null

function useWide() {
  const [wide, setWide] = useState(!!wideQuery?.matches)
  useEffect(() => {
    const on = () => setWide(!!wideQuery?.matches)
    wideQuery?.addEventListener('change', on)
    return () => wideQuery?.removeEventListener('change', on)
  }, [])
  return wide
}

/**
 * Non-modal lookup panel docked to the bottom of the screen (to the side on wide screens).
 * It starts as a short "peek" so the sentence stays readable above it, can be expanded for
 * details, and the text behind it stays tappable so the next word replaces the current one.
 */
export function LookupPanel({
  sentence,
  word,
  rest,
  view,
  storyId,
  onView,
  onWord,
  onClose,
  onPlayFrom,
  onLayout,
}: {
  sentence: Sentence
  word: Word | null
  /** sentence text from the start of the word */
  rest: string
  view: LookupView
  storyId?: string
  onView: (v: LookupView) => void
  /** look up the word at this index of the sentence */
  onWord: (wi: number) => void
  onClose: () => void
  onPlayFrom?: () => void
  /** height the panel covers at the bottom of the viewport (0 when docked to the side) */
  onLayout: (l: { height: number; expanded: boolean }) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const wide = useWide()
  const ref = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const detailed = expanded || wide

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const report = () => onLayout({ height: wide ? 0 : el.offsetHeight, expanded })
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [wide, expanded])

  // New word or view: start at the top
  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0)
  }, [word, sentence, view])

  // Swipe the handle up to expand, down to collapse / close
  const drag = useRef<{ y: number } | null>(null)
  const onGripDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { y: e.clientY }
  }
  const onGripUp = (e: PointerEvent) => {
    if (!drag.current) return
    const dy = e.clientY - drag.current.y
    drag.current = null
    if (dy < -30) setExpanded(true)
    else if (dy > 30) expanded ? setExpanded(false) : onClose()
    else if ((e.target as HTMLElement).classList.contains('lp-handle')) setExpanded(!expanded)
  }

  return (
    <div
      ref={ref}
      class={`lookup-panel ${expanded ? 'expanded' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-label={view === 'word' ? 'Word lookup' : 'Sentence'}
    >
      <div class="lp-grip" onPointerDown={onGripDown} onPointerUp={onGripUp} onPointerCancel={() => (drag.current = null)}>
        <div class="lp-handle" />
        <div class="lp-head">
          <div class="seg-control lp-tabs" role="tablist">
            <button role="tab" aria-selected={view === 'word'} class={view === 'word' ? 'on' : ''} disabled={!word} onClick={() => onView('word')}>
              Word
            </button>
            <button role="tab" aria-selected={view === 'sentence'} class={view === 'sentence' ? 'on' : ''} onClick={() => onView('sentence')}>
              Sentence
            </button>
          </div>
          <button
            class="icon-btn lp-expand"
            aria-label={expanded ? 'Show less' : 'Show more'}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <Icon name={expanded ? 'down' : 'up'} />
          </button>
          <button class="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div class="lp-body" ref={bodyRef}>
        {view === 'word' && word ? (
          <WordView word={word} sentence={sentence} rest={rest} storyId={storyId} detailed={detailed} onMore={() => setExpanded(true)} />
        ) : (
          <SentenceView sentence={sentence} active={word} onWord={onWord} onPlayFrom={onPlayFrom} />
        )}
      </div>
    </div>
  )
}

function WordView({
  word,
  sentence,
  rest,
  storyId,
  detailed,
  onMore,
}: {
  word: Word
  sentence: Sentence
  rest: string
  storyId?: string
  detailed: boolean
  onMore: () => void
}) {
  const [results, setResults] = useState<Result[] | null>(null)
  const [sel, setSel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showHint] = useState(() => !holdHintSeen())

  useEffect(() => {
    setResults(null)
    setSel(0)
    setError(null)
    let live = true
    findResults(word, rest).then(
      (r) => live && setResults(r),
      (e) => live && setError(offlineMessage(e)),
    )
    return () => {
      live = false
    }
  }, [word, rest])

  const key = lemmaKey(word)
  const isKnown = known.value.get(key)?.status === 'known'
  const current = results?.[sel]
  const ctx = { sentence: sentenceText(sentence), sentenceEn: sentence.en, surface: word.s, storyId }
  const reading = word.r ?? toHiragana(word.s)
  const chain = breakdownChain(word)

  return (
    <div class="word-view">
      <div class="lp-surface" lang="ja">
        <span class="popup-surface">{word.s}</span>
        {word.r && <span class="muted"> · {word.r}</span>}
        <span class="romaji"> {toRomaji(word.pr ?? reading)}</span>
      </div>

      {word.g &&
        (detailed ? (
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
        ) : (
          <div class="bd-chain">
            {chain.map((c, i) => (
              <>
                {i > 0 && <span class="muted"> + </span>}
                <span lang={i === 0 ? 'ja' : undefined} class={i === 0 ? 'bd-base' : ''}>
                  {c}
                </span>
              </>
            ))}
          </div>
        ))}
      {!word.g && word.t && (
        <div class="grammar-links">
          {word.t.map((g) => (
            <button class="chip small" onClick={() => navigate(`/grammar/${g}`)}>
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
            <button role="tab" aria-selected={i === sel} class={`chip small ${i === sel ? 'on' : ''}`} onClick={() => setSel(i)} lang="ja">
              {r.label}
              {results.filter((x) => x.label === r.label).length > 1 && <sup>{results.filter((x, j) => x.label === r.label && j <= i).length}</sup>}
            </button>
          ))}
        </div>
      )}
      {current && <EntryView entry={current.entry} reading={current.reading} ctx={ctx} compact={!detailed} />}

      {detailed ? (
        <div class="popup-footer">
          <label class="toggle">
            <input type="checkbox" checked={isKnown} onChange={() => setKnown(key, isKnown ? null : 'known')} />
            <span>I know this word</span>
          </label>
          <a class="link small" href={`https://jisho.org/search/${encodeURIComponent(word.b ?? word.s)}`} target="_blank" rel="noopener noreferrer">
            Jisho <Icon name="external" size={12} />
          </a>
        </div>
      ) : (
        <button class="btn small ghost lp-more" onClick={onMore}>
          More details <Icon name="up" size={16} />
        </button>
      )}
      {showHint && <p class="muted small lp-hint">Tip: press and hold any word to translate its whole sentence.</p>}
    </div>
  )
}

interface Gloss {
  wi: number
  word: Word
  gloss?: string
}

/** Short meaning of each word, for a literal word-by-word reading of the sentence. */
async function sentenceGlosses(sentence: Sentence): Promise<Gloss[]> {
  return Promise.all(
    sentence.w.map(async (word, wi): Promise<Gloss | null> => {
      if (!isLookupWord(word)) return null
      // Particles and auxiliaries: the grammar point says more than a dictionary gloss
      const grammar = (word.p === 'prt' || word.p === 'aux') && word.t?.map(grammarTitle).find(Boolean)
      if (grammar) return { wi, word, gloss: grammar }
      const hit = await dictionary.bestEntry(word).catch(() => undefined)
      return { wi, word, gloss: hit ? shortGloss(hit.entry, hit.reading) : undefined }
    }),
  ).then((gs) => gs.filter((g): g is Gloss => !!g))
}

function SentenceView({
  sentence,
  active,
  onWord,
  onPlayFrom,
}: {
  sentence: Sentence
  active: Word | null
  onWord: (wi: number) => void
  onPlayFrom?: () => void
}) {
  const text = sentenceText(sentence)
  const [glosses, setGlosses] = useState<Gloss[] | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setGlosses(null)
    let live = true
    sentenceGlosses(sentence).then((g) => live && setGlosses(g))
    return () => {
      live = false
    }
  }, [sentence])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div class="sentence-view">
      <div class="lp-actions">
        <button class="chip small" onClick={() => speak(text.replace(/[「」『』]/g, ''))}>
          <Icon name="volume" size={14} /> Listen
        </button>
        {onPlayFrom && (
          <button class="chip small" onClick={onPlayFrom}>
            <Icon name="play" size={12} /> Play story from here
          </button>
        )}
        <button class="chip small" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div class="lp-translation">
        <div class="section-label">Translation</div>
        {sentence.en ? <p lang="en">{sentence.en}</p> : <MachineTranslation text={text} />}
      </div>

      <div class="section-label">Word by word</div>
      {!glosses && <div class="loading small">Looking up…</div>}
      {glosses && (
        <ul class="gloss-list">
          {glosses.map(({ wi, word, gloss }) => {
            const chain = breakdownChain(word).slice(1)
            return (
              <li>
                <button class={`gloss-row ${word === active ? 'on' : ''}`} onClick={() => onWord(wi)}>
                  <span class="gl-word" lang="ja">
                    {word.s}
                    {word.r && word.r !== word.s && <span class="gl-reading">{word.r}</span>}
                  </span>
                  <span class="gl-meaning">
                    {gloss ?? <span class="muted">—</span>}
                    {chain.length > 0 && <span class="gl-grammar">{chain.join(' + ')}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function MachineTranslation({ text }: { text: string }) {
  const [out, setOut] = useState<string | undefined>(() => cachedTranslation(text))
  const [state, setState] = useState<'checking' | 'unavailable' | 'downloadable' | 'working' | 'error'>('checking')
  const [progress, setProgress] = useState<number | null>(null)
  const current = useRef(text)
  current.current = text

  const run = () => {
    setState('working')
    translateOnDevice(text, setProgress).then(
      (t) => current.current === text && setOut(t),
      () => current.current === text && setState('error'),
    )
  }

  useEffect(() => {
    setOut(cachedTranslation(text))
    setProgress(null)
    if (cachedTranslation(text)) return
    let live = true
    deviceTranslation().then((a) => {
      if (!live) return
      if (a === 'available') run()
      else setState(a === 'unavailable' ? 'unavailable' : 'downloadable')
    })
    return () => {
      live = false
    }
  }, [text])

  return (
    <div>
      {out ? (
        <p lang="en">
          {out} <span class="muted small">(machine translation)</span>
        </p>
      ) : state === 'downloadable' ? (
        <button class="btn small" onClick={run}>
          <Icon name="translate" size={16} /> Translate on this device
        </button>
      ) : state === 'working' ? (
        <p class="muted small">{progress !== null && progress < 1 ? `Downloading language model… ${Math.round(progress * 100)}%` : 'Translating…'}</p>
      ) : state === 'error' ? (
        <p class="muted small">On-device translation failed.</p>
      ) : (
        <p class="muted small">This text has no translation. The word-by-word meanings below can help, or open it in a translator:</p>
      )}
      <div class="lp-links small">
        {out && <span class="muted">Compare: </span>}
        {webTranslators(text).map((t, i) => (
          <>
            {i > 0 && ' · '}
            <a class="link" href={t.url} target="_blank" rel="noopener noreferrer">
              {t.name} <Icon name="external" size={12} />
            </a>
          </>
        ))}
      </div>
    </div>
  )
}
