import { useEffect, useState } from 'preact/hooks'
import { cards } from '../state/db'
import { kanjiForms, readings, type Entry, type KanjiInfo, type RawReading } from '../lib/dict'
import { alignFurigana } from '../lib/furigana'
import { KANJI_RE, toRomaji } from '../lib/kana'
import { dictionary } from '../services/dictionary'
import { cardHead, cardId, toggleSaved, type CardContext } from '../services/cards'
import { speak } from '../services/tts'
import { navigate } from '../router'
import { Icon } from './Icon'
import { JlptBadge, Ruby } from './Badges'
import { PitchDiagram } from './PitchAccent'
import { StrokeOrder } from './StrokeOrder'

let tagDesc: Record<string, string> = {}
dictionary
  .tagDescriptions()
  .then((t) => (tagDesc = t))
  .catch(() => {})

function TagList({ tags, class: cls = '' }: { tags?: string[]; class?: string }) {
  if (!tags?.length) return null
  return (
    <span class={`tags ${cls}`}>
      {tags.map((t) => (
        <span class="tag" title={tagDesc[t] ?? t}>
          {shortTag(t)}
        </span>
      ))}
    </span>
  )
}

const TAG_SHORT: Record<string, string> = {
  n: 'noun',
  'adj-i': 'i-adj',
  'adj-na': 'na-adj',
  'adj-no': 'の-adj',
  'adj-pn': 'pre-noun adj',
  'adj-t': 'たる-adj',
  'adj-f': 'pre-noun',
  adv: 'adverb',
  'adv-to': 'adverb (と)',
  aux: 'auxiliary',
  'aux-v': 'aux verb',
  'aux-adj': 'aux adj',
  conj: 'conjunction',
  cop: 'copula',
  ctr: 'counter',
  exp: 'expression',
  int: 'interjection',
  pn: 'pronoun',
  pref: 'prefix',
  prt: 'particle',
  suf: 'suffix',
  v1: 'ichidan verb',
  'v1-s': 'ichidan verb',
  v5u: 'godan verb',
  v5k: 'godan verb',
  'v5k-s': 'godan verb',
  v5g: 'godan verb',
  v5s: 'godan verb',
  v5t: 'godan verb',
  v5n: 'godan verb',
  v5b: 'godan verb',
  v5m: 'godan verb',
  v5r: 'godan verb',
  'v5r-i': 'godan verb (irr.)',
  'v5aru': 'godan verb (-aru)',
  'v5u-s': 'godan verb',
  vk: 'kuru verb',
  vs: 'する verb',
  'vs-i': 'する verb',
  'vs-s': 'する verb',
  vz: 'ずる verb',
  vi: 'intransitive',
  vt: 'transitive',
  uk: 'usually kana',
  col: 'colloquial',
  hon: 'honorific',
  hum: 'humble',
  pol: 'polite',
  sl: 'slang',
  arch: 'archaic',
  obs: 'obsolete',
  rare: 'rare',
  abbr: 'abbreviation',
  on: 'onomatopoeia',
  id: 'idiom',
  yoji: '四字熟語',
  sens: 'sensitive',
  vulg: 'vulgar',
  derog: 'derogatory',
  fam: 'familiar',
  male: 'male speech',
  fem: 'female speech',
  joc: 'jocular',
  poet: 'poetic',
  form: 'formal',
  chn: "children's",
  num: 'numeric',
  unc: 'unclassified',
}
function shortTag(t: string) {
  return TAG_SHORT[t] ?? t
}

export function KanjiPanel({ chars }: { chars: string[] }) {
  const [infos, setInfos] = useState<(KanjiInfo | undefined)[]>([])
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    Promise.all(chars.map((c) => dictionary.kanji(c).catch(() => undefined))).then(setInfos)
    setOpen(null)
  }, [chars.join('')])
  if (!chars.length) return null
  return (
    <div class="kanji-panel">
      <div class="kanji-chips">
        {chars.map((c, i) => (
          <button class={`kanji-chip ${open === c ? 'on' : ''}`} onClick={() => setOpen(open === c ? null : c)}>
            <span class="kanji-chip-char">{c}</span>
            <span class="kanji-chip-meaning">{infos[i]?.m.slice(0, 2).join(', ') ?? ''}</span>
          </button>
        ))}
      </div>
      {open && <KanjiCard char={open} info={infos[chars.indexOf(open)]} />}
    </div>
  )
}

export function KanjiCard({ char, info }: { char: string; info?: KanjiInfo }) {
  return (
    <div class="kanji-card">
      <StrokeOrder char={char} size={130} />
      <div class="kanji-card-info">
        {info ? (
          <>
            <div class="kanji-meaning">{info.m.join(', ')}</div>
            {info.on.length > 0 && (
              <div>
                <span class="label">On</span> {info.on.join('、')}
              </div>
            )}
            {info.kun.length > 0 && (
              <div>
                <span class="label">Kun</span> {info.kun.join('、')}
              </div>
            )}
            <div class="muted small">
              {info.s} strokes{info.g ? ` · grade ${info.g <= 6 ? info.g : 'secondary'}` : ''}
              {info.j ? ` · JLPT N${info.j === 4 ? 5 : info.j === 3 ? 4 : info.j === 2 ? '3/2' : 1}` : ''}
              {info.f ? ` · #${info.f} most used` : ''}
            </div>
            <button class="link small" onClick={() => navigate(`/kanji/${encodeURIComponent(char)}`)}>
              Open kanji page →
            </button>
          </>
        ) : (
          <div class="muted">No kanji data.</div>
        )}
      </div>
    </div>
  )
}

/** Full view of one dictionary entry. */
export function EntryView({
  entry,
  reading,
  ctx,
  compact = false,
}: {
  entry: Entry
  reading?: RawReading
  ctx?: CardContext
  compact?: boolean
}) {
  const rs = readings(entry)
  const ks = kanjiForms(entry)
  const r = reading ?? rs[0]
  const head = cardHead(entry, r)
  const saved = cards.value.has(cardId(head.word, head.reading))
  const showWord = entry.uk ? r.t : head.word
  const kanjiChars = Array.from(new Set(Array.from(showWord).filter((c) => KANJI_RE.test(c))))
  const otherForms = ks.filter((k) => k.t !== showWord && !k.tags.includes('sK'))
  const otherReadings = rs.filter((x) => x.t !== r.t && !(x.f ?? []).includes('sk'))

  return (
    <div class="entry">
      <div class="entry-head">
        <div class="entry-word" lang="ja">
          {showWord !== r.t ? <Ruby f={alignFurigana(showWord, r.t) as [string, string?][]} text={showWord} /> : showWord}
        </div>
        <div class="entry-actions">
          <button class="icon-btn" aria-label="Listen" onClick={() => speak(r.t)}>
            <Icon name="volume" />
          </button>
          <button
            class={`icon-btn save ${saved ? 'on' : ''}`}
            aria-label={saved ? 'Remove from flashcards' : 'Save to flashcards'}
            onClick={() => toggleSaved(entry, r, ctx)}
          >
            <Icon name="star" fill={saved} />
          </button>
        </div>
      </div>
      <div class="entry-sub">
        <span lang="ja">{r.t}</span>
        <span class="romaji">{toRomaji(r.t)}</span>
        <JlptBadge level={entry.j} />
        {entry.c && <span class="badge common">common</span>}
      </div>
      {r.a && <PitchDiagram reading={r.t} accent={r.a} />}
      <ol class="senses">
        {entry.s
          .filter((s) => !s.sk || s.sk.includes(head.word) || entry.uk)
          .filter((s) => !s.sr || s.sr.includes(r.t))
          .slice(0, compact ? 4 : undefined)
          .map((s) => (
            <li>
              <TagList tags={s.p} class="pos" />
              <TagList tags={[...(s.m ?? []), ...(s.d ?? []), ...(s.l ?? [])]} />
              <div class="gloss">{s.g.join('; ')}</div>
              {s.n && <div class="muted small">{s.n.join('; ')}</div>}
              {s.x && (
                <div class="muted small">
                  See also:{' '}
                  {s.x.map((x) => (
                    <button class="link" onClick={() => navigate(`/dictionary?q=${encodeURIComponent(x.split('・')[0])}`)}>
                      {x}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
      </ol>
      {(otherForms.length > 0 || otherReadings.length > 0) && (
        <div class="muted small other-forms" lang="ja">
          Other forms: {[...otherForms.map((k) => k.t), ...otherReadings.map((x) => x.t)].join('、')}
        </div>
      )}
      <KanjiPanel chars={kanjiChars} />
    </div>
  )
}
