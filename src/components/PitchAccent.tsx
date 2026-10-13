import { morae, toHiragana } from '../lib/kana'

export type AccentType = 'heiban' | 'atamadaka' | 'nakadaka' | 'odaka'

export function accentType(accent: number, moraCount: number): AccentType {
  if (accent === 0) return 'heiban'
  if (accent === 1) return 'atamadaka'
  if (accent >= moraCount) return 'odaka'
  return 'nakadaka'
}

export const ACCENT_LABEL: Record<AccentType, string> = {
  heiban: 'Heiban (flat)',
  atamadaka: 'Atamadaka (head-high)',
  nakadaka: 'Nakadaka (middle-high)',
  odaka: 'Odaka (tail-high)',
}

/** Accent class for coloring words in text. */
export function accentClass(reading: string, accent?: string): string {
  if (!accent) return ''
  const n = parseInt(accent.split(',')[0], 10)
  if (Number.isNaN(n)) return ''
  return `pa-${accentType(n, morae(toHiragana(reading)).length)}`
}

/** High/low pattern per mora, plus the following particle. */
export function pitchPattern(accent: number, count: number): boolean[] {
  const out: boolean[] = []
  for (let i = 0; i <= count; i++) {
    if (accent === 0) out.push(i > 0)
    else if (accent === 1) out.push(i === 0)
    else out.push(i > 0 && i < accent)
  }
  return out
}

/** Classic dot-and-line pitch accent diagram. */
export function PitchDiagram({ reading, accent }: { reading: string; accent: string }) {
  const ms = morae(toHiragana(reading))
  const values = accent
    .split(',')
    .map((x) => parseInt(x, 10))
    .filter((x) => !Number.isNaN(x))
  if (!ms.length || !values.length) return null
  return (
    <div class="pitch-list">
      {values.map((a) => {
        const pattern = pitchPattern(a, ms.length)
        const step = 26
        const w = step * (ms.length + 1)
        const y = (h: boolean) => (h ? 8 : 26)
        const type = accentType(a, ms.length)
        return (
          <div class={`pitch pa-${type}`} key={a}>
            <svg width={w} height={52} viewBox={`0 0 ${w} 52`} role="img" aria-label={`${ACCENT_LABEL[type]} [${a}]`}>
              <polyline
                points={pattern.map((h, i) => `${i * step + step / 2},${y(h)}`).join(' ')}
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              />
              {pattern.map((h, i) => (
                <circle
                  cx={i * step + step / 2}
                  cy={y(h)}
                  r={4}
                  fill={i === ms.length ? 'var(--bg)' : 'currentColor'}
                  stroke="currentColor"
                  stroke-width="2"
                />
              ))}
              {ms.map((m, i) => (
                <text x={i * step + step / 2} y={47} text-anchor="middle" font-size="13" fill="var(--text)">
                  {m}
                </text>
              ))}
            </svg>
            <span class="pitch-label">
              {ACCENT_LABEL[type]} [{a}]
            </span>
          </div>
        )
      })}
    </div>
  )
}
