import { useEffect, useMemo, useState } from 'preact/hooks'
import { activity, cards, deleteCard, logActivity, today, type Card } from '../state/db'
import { settings, updateSettings, type ReviewMode } from '../state/settings'
import { cardStage, isDue, previewInterval, schedule, type Grade } from '../services/srs'
import { exportCardsTsv, recordReview } from '../services/cards'
import { speak } from '../services/tts'
import { toRomaji } from '../lib/kana'
import { alignFurigana } from '../lib/furigana'
import { navigate, route } from '../router'
import { Icon } from '../components/Icon'
import { JlptBadge, Ruby } from '../components/Badges'
import { PitchDiagram } from '../components/PitchAccent'

function buildQueue(): Card[] {
  const all = [...cards.value.values()]
  const now = Date.now()
  const due = all.filter((c) => isDue(c, now)).sort((a, b) => a.due - b.due)
  const introduced = activity.value.get(today())?.newCards ?? 0
  const newLimit = Math.max(0, settings.value.newPerDay - introduced)
  const fresh = all
    .filter((c) => c.state === 'new')
    .sort((a, b) => a.created - b.created)
    .slice(0, newLimit)
  return [...due, ...fresh]
}

export function ReviewPage() {
  const tab = route.value.query.get('tab') ?? 'review'
  return (
    <div class="page review">
      <header class="page-head">
        <h1>Flashcards</h1>
        <div class="tabs">
          <button class={`tab ${tab === 'review' ? 'on' : ''}`} onClick={() => navigate('/review', { replace: true })}>
            Review
          </button>
          <button class={`tab ${tab === 'words' ? 'on' : ''}`} onClick={() => navigate('/review?tab=words', { replace: true })}>
            My words ({cards.value.size})
          </button>
        </div>
      </header>
      {tab === 'words' ? <WordList /> : <ReviewHome />}
    </div>
  )
}

function ReviewHome() {
  const [session, setSession] = useState<Card[] | null>(null)
  const counts = useMemo(() => {
    const all = [...cards.value.values()]
    const now = Date.now()
    const introduced = activity.value.get(today())?.newCards ?? 0
    return {
      due: all.filter((c) => isDue(c, now)).length,
      fresh: Math.min(all.filter((c) => c.state === 'new').length, Math.max(0, settings.value.newPerDay - introduced)),
      total: all.length,
      mature: all.filter((c) => cardStage(c) === 'mature').length,
      reviewsToday: activity.value.get(today())?.reviews ?? 0,
    }
  }, [cards.value, activity.value, settings.value.newPerDay])

  if (session) return <Session queue={session} onDone={() => setSession(null)} />
  const s = settings.value
  return (
    <div class="review-home">
      <div class="stat-row">
        <div class="stat">
          <b>{counts.due}</b>
          <span>due</span>
        </div>
        <div class="stat">
          <b>{counts.fresh}</b>
          <span>new today</span>
        </div>
        <div class="stat">
          <b>{counts.reviewsToday}</b>
          <span>reviewed today</span>
        </div>
        <div class="stat">
          <b>{counts.mature}</b>
          <span>learned</span>
        </div>
      </div>
      {counts.total === 0 ? (
        <div class="empty">
          <p>No flashcards yet.</p>
          <p class="muted">While reading, tap a word and press ★ to save it. It will show up here with the sentence you found it in.</p>
          <button class="btn" onClick={() => navigate('/')}>
            Find something to read
          </button>
        </div>
      ) : (
        <>
          <button class="btn primary big" disabled={counts.due + counts.fresh === 0} onClick={() => setSession(buildQueue())}>
            <Icon name="cards" /> {counts.due + counts.fresh ? `Review ${counts.due + counts.fresh} cards` : 'All done for now 🎉'}
          </button>
          <div class="setting">
            <div class="setting-label">Card type</div>
            <div class="seg-control">
              {(
                [
                  ['recognition', 'Read → meaning'],
                  ['listening', 'Listen → meaning'],
                  ['production', 'Meaning → word'],
                ] as [ReviewMode, string][]
              ).map(([m, label]) => (
                <button class={s.reviewMode === m ? 'on' : ''} onClick={() => updateSettings({ reviewMode: m })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label class="toggle row">
            <span>Show example sentence on the front</span>
            <input type="checkbox" checked={s.reviewShowSentence} onChange={(e) => updateSettings({ reviewShowSentence: (e.target as HTMLInputElement).checked })} />
          </label>
          <label class="toggle row">
            <span>Play audio automatically</span>
            <input type="checkbox" checked={s.autoplayCardAudio} onChange={(e) => updateSettings({ autoplayCardAudio: (e.target as HTMLInputElement).checked })} />
          </label>
          <div class="setting">
            <div class="setting-label">
              New cards per day <span class="muted">{s.newPerDay}</span>
            </div>
            <input type="range" min="0" max="50" step="1" value={s.newPerDay} onInput={(e) => updateSettings({ newPerDay: Number((e.target as HTMLInputElement).value) })} />
          </div>
        </>
      )}
    </div>
  )
}

function Highlight({ sentence, surface }: { sentence: string; surface?: string }) {
  if (!surface || !sentence.includes(surface)) return <>{sentence}</>
  const i = sentence.indexOf(surface)
  return (
    <>
      {sentence.slice(0, i)}
      <mark>{surface}</mark>
      {sentence.slice(i + surface.length)}
    </>
  )
}

function Session({ queue: initial, onDone }: { queue: Card[]; onDone: () => void }) {
  const [queue, setQueue] = useState(initial)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(0)
  const card = queue[0]
  const mode = settings.value.reviewMode
  const showSentence = settings.value.reviewShowSentence

  useEffect(() => {
    if (!card) return
    if (mode === 'listening' || settings.value.autoplayCardAudio) speak(card.reading)
  }, [card?.id, mode])

  const answer = async (g: Grade) => {
    if (!card) return
    const wasNew = card.state === 'new'
    const next = schedule(card, g)
    await recordReview(next)
    if (wasNew) await logActivity({ newCards: 1 })
    const rest = queue.slice(1)
    // Cards still in learning come back in this session
    if (next.due - Date.now() < 20 * 60 * 1000) rest.push(next)
    setQueue(rest)
    setFlipped(false)
    setDone((d) => d + 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped(true)
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        answer((['again', 'hard', 'good', 'easy'] as Grade[])[Number(e.key) - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!card)
    return (
      <div class="empty">
        <p class="big-emoji">🎉</p>
        <p>
          Session complete — {done} review{done === 1 ? '' : 's'}.
        </p>
        <button class="btn primary" onClick={onDone}>
          Done
        </button>
      </div>
    )

  const furi = card.word !== card.reading ? (alignFurigana(card.word, card.reading) as [string, string?][]) : undefined
  return (
    <div class="session">
      <div class="session-top">
        <button class="icon-btn" onClick={onDone} aria-label="End session">
          <Icon name="close" />
        </button>
        <div class="bar">
          <span style={{ width: `${(done / (done + queue.length)) * 100}%` }} />
        </div>
        <span class="small muted">{queue.length} left</span>
      </div>
      <div class={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => !flipped && setFlipped(true)}>
        <div class="fc-front">
          {mode === 'recognition' && (
            <div class="fc-word" lang="ja">
              {card.word}
            </div>
          )}
          {mode === 'listening' && (
            <button
              class="btn ghost big"
              onClick={(e) => {
                e.stopPropagation()
                speak(card.reading)
              }}
            >
              <Icon name="volume" size={32} /> Listen
            </button>
          )}
          {mode === 'production' && <div class="fc-meaning big">{card.meaning}</div>}
          {showSentence && card.sentence && mode !== 'production' && (
            <div class="fc-sentence" lang="ja">
              {mode === 'listening' ? card.sentence.replace(card.surface ?? card.word, '＿＿') : <Highlight sentence={card.sentence} surface={card.surface ?? card.word} />}
            </div>
          )}
          {!flipped && <div class="muted small tap-hint">Tap or press space to show the answer</div>}
        </div>
        {flipped && (
          <div class="fc-back">
            <div class="fc-word" lang="ja">
              <Ruby f={furi} text={card.word} />
              <button
                class="icon-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  speak(card.reading)
                }}
                aria-label="Listen"
              >
                <Icon name="volume" />
              </button>
            </div>
            <div class="fc-reading">
              <span lang="ja">{card.reading}</span> <span class="romaji">{toRomaji(card.reading)}</span> <JlptBadge level={card.jlpt} />
            </div>
            {card.accent && <PitchDiagram reading={card.reading} accent={card.accent} />}
            <div class="fc-meaning">{card.meaning}</div>
            {card.sentence && (
              <div class="fc-sentence" lang="ja">
                <Highlight sentence={card.sentence} surface={card.surface ?? card.word} />
                <button
                  class="icon-btn small"
                  onClick={(e) => {
                    e.stopPropagation()
                    speak(card.sentence!.replace(/[「」]/g, ''))
                  }}
                  aria-label="Play sentence"
                >
                  <Icon name="volume" size={16} />
                </button>
                {card.sentenceEn && <div class="muted small" lang="en">{card.sentenceEn}</div>}
              </div>
            )}
          </div>
        )}
      </div>
      {flipped ? (
        <div class="grade-buttons">
          {(
            [
              ['again', '😞', 'Again'],
              ['hard', '😐', 'Hard'],
              ['good', '🙂', 'Good'],
              ['easy', '😄', 'Easy'],
            ] as [Grade, string, string][]
          ).map(([g, emoji, label]) => (
            <button class={`grade ${g}`} onClick={() => answer(g)}>
              <span class="emoji">{emoji}</span>
              <span>{label}</span>
              <span class="small muted">{previewInterval(card, g)}</span>
            </button>
          ))}
        </div>
      ) : (
        <button class="btn primary big" onClick={() => setFlipped(true)}>
          Show answer
        </button>
      )}
    </div>
  )
}

function WordList() {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'recent' | 'due' | 'az'>('recent')
  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    const all = [...cards.value.values()].filter(
      (c) => !term || c.word.includes(term) || c.reading.includes(term) || c.meaning.toLowerCase().includes(term),
    )
    if (sort === 'recent') all.sort((a, b) => b.created - a.created)
    if (sort === 'due') all.sort((a, b) => a.due - b.due)
    if (sort === 'az') all.sort((a, b) => a.reading.localeCompare(b.reading, 'ja'))
    return all
  }, [cards.value, q, sort])

  const download = () => {
    const blob = new Blob([exportCardsTsv(list)], { type: 'text/tab-separated-values' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'jp-reading-flashcards.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div class="word-list-page">
      <div class="row-inline">
        <div class="search-box grow">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Search your words" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </div>
        <select value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as typeof sort)} aria-label="Sort">
          <option value="recent">Newest</option>
          <option value="due">Due</option>
          <option value="az">あ→ん</option>
        </select>
      </div>
      <ul class="word-list">
        {list.map((c) => (
          <li>
            <div class="grow" onClick={() => navigate(`/dictionary?q=${encodeURIComponent(c.word)}`)}>
              <span class="kw-word" lang="ja">
                {c.word}
              </span>{' '}
              {c.reading !== c.word && (
                <span class="muted" lang="ja">
                  {c.reading}
                </span>
              )}{' '}
              <JlptBadge level={c.jlpt} /> <span class={`stage stage-${cardStage(c)}`}>{cardStage(c)}</span>
              <div class="small">{c.meaning}</div>
              {c.sentence && (
                <div class="small muted" lang="ja">
                  {c.sentence}
                </div>
              )}
            </div>
            <button class="icon-btn" aria-label="Listen" onClick={() => speak(c.reading)}>
              <Icon name="volume" size={18} />
            </button>
            <button
              class="icon-btn"
              aria-label="Delete"
              onClick={() => {
                if (confirm(`Remove ${c.word} from your flashcards?`)) deleteCard(c.id)
              }}
            >
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      {list.length > 0 && (
        <button class="btn ghost" onClick={download}>
          <Icon name="download" size={18} /> Export for Anki (.txt)
        </button>
      )}
    </div>
  )
}
