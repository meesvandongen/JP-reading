import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon } from './Icon'

// Stroke order data: KanjiVG (CC BY-SA 3.0), served from jsDelivr and cached
// by the service worker for offline use.
const KANJIVG = 'https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@r20250816/kanji/'

interface Stroke {
  d: string
}
interface Num {
  x: number
  y: number
  n: string
}

const cache = new Map<string, Promise<{ strokes: Stroke[]; nums: Num[] }>>()

function loadStrokes(ch: string) {
  let p = cache.get(ch)
  if (!p) {
    const code = ch.codePointAt(0)!.toString(16).padStart(5, '0')
    p = fetch(`${KANJIVG}${code}.svg`)
      .then((r) => {
        if (!r.ok) throw new Error('no stroke data')
        return r.text()
      })
      .then((svg) => {
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
        const strokes = [...doc.querySelectorAll('path')].map((p) => ({ d: p.getAttribute('d') ?? '' }))
        const nums = [...doc.querySelectorAll('text')].map((t) => {
          const m = /matrix\(1 0 0 1 ([\d.]+) ([\d.]+)\)/.exec(t.getAttribute('transform') ?? '')
          return { x: m ? +m[1] : 0, y: m ? +m[2] : 0, n: t.textContent ?? '' }
        })
        return { strokes, nums }
      })
    p.catch(() => cache.delete(ch))
    cache.set(ch, p)
  }
  return p
}

export function StrokeOrder({ char, size = 160 }: { char: string; size?: number }) {
  const [data, setData] = useState<{ strokes: Stroke[]; nums: Num[] } | null>(null)
  const [error, setError] = useState(false)
  const [run, setRun] = useState(0)
  const [numbers, setNumbers] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    setData(null)
    setError(false)
    loadStrokes(char).then(setData, () => setError(true))
  }, [char])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !data) return
    const paths = [...svg.querySelectorAll<SVGPathElement>('path.stroke')]
    let delay = 0
    for (const p of paths) {
      const len = p.getTotalLength()
      const dur = Math.max(0.25, len / 120)
      p.style.transition = 'none'
      p.style.strokeDasharray = `${len} ${len}`
      p.style.strokeDashoffset = `${len}`
      // force reflow so the transition restarts
      p.getBoundingClientRect()
      p.style.transition = `stroke-dashoffset ${dur}s linear ${delay}s`
      p.style.strokeDashoffset = '0'
      delay += dur + 0.12
    }
  }, [data, run])

  if (error) return <div class="stroke-box stroke-missing">{char}</div>
  return (
    <div class="stroke-wrap">
      <svg ref={svgRef} class="stroke-box" width={size} height={size} viewBox="0 0 109 109" role="img" aria-label={`Stroke order of ${char}`}>
        <line x1="54.5" y1="0" x2="54.5" y2="109" class="stroke-grid" />
        <line x1="0" y1="54.5" x2="109" y2="54.5" class="stroke-grid" />
        {data?.strokes.map((s) => <path d={s.d} class="stroke-ghost" />)}
        {data?.strokes.map((s) => <path d={s.d} class="stroke" />)}
        {numbers &&
          data?.nums.map((n) => (
            <text x={n.x} y={n.y} class="stroke-num">
              {n.n}
            </text>
          ))}
      </svg>
      <div class="stroke-controls">
        <button class="chip" onClick={() => setRun((r) => r + 1)}>
          <Icon name="refresh" size={16} /> Replay
        </button>
        <button class={`chip ${numbers ? 'on' : ''}`} onClick={() => setNumbers((n) => !n)}>
          1 2 3
        </button>
        {data && <span class="muted small">{data.strokes.length} strokes</span>}
      </div>
    </div>
  )
}
