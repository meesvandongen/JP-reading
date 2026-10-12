import { useEffect, useState } from 'preact/hooks'
import type { Entry, KanjiInfo } from '../lib/dict'
import { headword } from '../lib/dict'
import { dictionary } from '../services/dictionary'
import { shortMeaning } from '../services/cards'
import { back, navigate } from '../router'
import { Icon } from '../components/Icon'
import { StrokeOrder } from '../components/StrokeOrder'
import { JlptBadge } from '../components/Badges'

export function KanjiPage({ char }: { char: string }) {
  const [info, setInfo] = useState<KanjiInfo | null | undefined>(undefined)
  const [words, setWords] = useState<Entry[]>([])
  useEffect(() => {
    setInfo(undefined)
    dictionary.kanji(char).then((i) => setInfo(i ?? null), () => setInfo(null))
    // Common words that use this kanji, found through its readings
    dictionary
      .kanji(char)
      .then(async (i) => {
        if (!i) return
        const keys = [char, ...i.kun.map((k) => k.replace(/[.-]/g, '').replace(/\..*$/, '')), ...i.on]
        const found = new Map<number, Entry>()
        for (const k of keys.slice(0, 8)) {
          for (const e of await dictionary.lookup(k)) {
            if (e.k.some((x) => (typeof x === 'string' ? x : x[0]).includes(char))) found.set(e.i, e)
          }
        }
        setWords([...found.values()].sort((a, b) => (b.c ?? 0) - (a.c ?? 0) || (a.q ?? 100) - (b.q ?? 100)).slice(0, 12))
      })
      .catch(() => {})
  }, [char])

  return (
    <div class="page kanji-page">
      <header class="topbar">
        <button class="icon-btn" onClick={() => back('/dictionary')} aria-label="Back">
          <Icon name="back" />
        </button>
        <div class="topbar-title">Kanji</div>
      </header>
      <div class="kanji-hero">
        <div class="kanji-big" lang="ja">
          {char}
        </div>
        <StrokeOrder char={char} size={200} />
      </div>
      {info === undefined && <div class="loading">Loading…</div>}
      {info === null && <p class="muted">No information for this character.</p>}
      {info && (
        <div class="kanji-info">
          <p class="kanji-meaning big">{info.m.join(', ')}</p>
          <table class="info-table">
            <tbody>
              {info.on.length > 0 && (
                <tr>
                  <th>On'yomi</th>
                  <td lang="ja">{info.on.join('、')}</td>
                </tr>
              )}
              {info.kun.length > 0 && (
                <tr>
                  <th>Kun'yomi</th>
                  <td lang="ja">{info.kun.join('、')}</td>
                </tr>
              )}
              {info.n && (
                <tr>
                  <th>Name readings</th>
                  <td lang="ja">{info.n.join('、')}</td>
                </tr>
              )}
              <tr>
                <th>Strokes</th>
                <td>{info.s}</td>
              </tr>
              {info.g && (
                <tr>
                  <th>School grade</th>
                  <td>{info.g <= 6 ? `Grade ${info.g} (Kyōiku)` : info.g === 8 ? 'Secondary school (Jōyō)' : 'Jinmeiyō (names)'}</td>
                </tr>
              )}
              {info.j && (
                <tr>
                  <th>JLPT</th>
                  <td>{info.j === 4 ? 'N5' : info.j === 3 ? 'N4' : info.j === 2 ? 'N3–N2' : 'N1'}</td>
                </tr>
              )}
              {info.f && (
                <tr>
                  <th>Frequency</th>
                  <td>#{info.f} of 2,500 most used</td>
                </tr>
              )}
              {info.rad && (
                <tr>
                  <th>Radical</th>
                  <td>#{info.rad}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {words.length > 0 && (
        <section>
          <h2 class="section-title">Words with {char}</h2>
          <ul class="results">
            {words.map((e) => {
              const hw = headword(e)
              return (
                <li>
                  <button class="result-row" onClick={() => navigate(`/dictionary?q=${encodeURIComponent(hw.word)}`)}>
                    <span class="rr-word" lang="ja">
                      {hw.word}
                    </span>
                    <span class="rr-reading" lang="ja">
                      {hw.reading}
                    </span>
                    <JlptBadge level={e.j} />
                    <span class="rr-gloss">{shortMeaning(e, 2)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <p class="muted small">Stroke order data: KanjiVG (CC BY-SA 3.0). Kanji data: KANJIDIC2 (EDRDG, CC BY-SA 4.0).</p>
    </div>
  )
}
