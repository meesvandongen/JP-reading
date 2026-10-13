import { levelInfo } from '../lib/levels'

export function JlptBadge({ level }: { level?: number }) {
  if (!level) return null
  return <span class={`badge jlpt jlpt-${level}`}>N{level}</span>
}

export function LevelBadge({ level }: { level: string }) {
  const info = levelInfo(level)
  return (
    <span class="badge level" style={{ background: info.color }}>
      {info.label}
    </span>
  )
}

export function Ruby({ f, text }: { f?: [string, string?][]; text: string }) {
  if (!f) return <>{text}</>
  return (
    <>
      {f.map(([t, r]) =>
        r ? (
          <ruby>
            {t}
            <rt>{r}</rt>
          </ruby>
        ) : (
          t
        ),
      )}
    </>
  )
}
