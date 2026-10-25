// Builds the reading library from content/ into public/data/library/:
//   index.json                 list of stories, series + grammar articles
//   stories/<id>.json          pre-tokenized story (StoryDoc)
//   grammar/<id>.json          grammar article (rendered HTML)
// Also copies the kuromoji dictionary to public/kuromoji/ for in-browser
// tokenizing of imported texts.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, basename, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { parse as parseYaml } from 'yaml'
import { marked } from 'marked'
import * as kuromoji from '@patdx/kuromoji'
import NodeDictionaryLoader from '@patdx/kuromoji/node'
import { analyzeChapters, allWords, lemmaKey, type Tokenizer } from '../src/lib/analyze'
import { textStats } from '../src/lib/stats'
import { parseStoryBody, parseTerms, splitFrontMatter } from '../src/lib/text'
import { Dictionary, headword } from '../src/lib/dict'
import { LEVELS, levelJlpt } from '../src/lib/levels'
import type { GrammarMeta, Keyword, KToken, LibraryIndex, SeriesMeta, StoryDoc, StoryMeta, Word } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = join(ROOT, 'content')
const STORIES = join(CONTENT, 'stories')
const OUT = join(ROOT, 'public', 'data', 'library')
const DICT = join(ROOT, 'public', 'data', 'dict')
const KUROMOJI_SRC = join(ROOT, 'node_modules', '@patdx', 'kuromoji', 'dict')
const KUROMOJI_OUT = join(ROOT, 'public', 'kuromoji')

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') && basename(p) !== 'README.md' ? [p] : []
  })
}

function gitAddedDate(file: string): string | undefined {
  try {
    const out = execFileSync('git', ['log', '--diff-filter=A', '--follow', '--format=%aI', '--', relative(ROOT, file)], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const lines = out.split('\n').filter(Boolean)
    return lines[lines.length - 1]
  } catch {
    return undefined
  }
}

async function main() {
  const tk = await new kuromoji.TokenizerBuilder({
    loader: new NodeDictionaryLoader({ dic_path: KUROMOJI_SRC } as never),
  }).build()
  const tokenizer: Tokenizer = { tokenize: (t) => tk.tokenize(t) as unknown as KToken[] }

  const hasDict = existsSync(join(DICT, 'meta.json'))
  if (!hasDict) console.warn('! dictionary not built (run `pnpm run data`); skipping pitch accent / JLPT / keywords')
  const dict = hasDict ? new Dictionary(async (p) => JSON.parse(readFileSync(join(DICT, p), 'utf8'))) : null

  if (existsSync(OUT)) rmSync(OUT, { recursive: true })
  mkdirSync(join(OUT, 'stories'), { recursive: true })
  mkdirSync(join(OUT, 'grammar'), { recursive: true })

  const errors: string[] = []

  // ---- series: content/stories/<level>/<series-id>/series.yml + one .md per episode
  const seriesFm = new Map<string, Record<string, unknown>>()
  for (const levelDir of existsSync(STORIES) ? readdirSync(STORIES) : []) {
    if (!statSync(join(STORIES, levelDir)).isDirectory()) continue
    for (const f of readdirSync(join(STORIES, levelDir))) {
      const dir = join(STORIES, levelDir, f)
      if (!statSync(dir).isDirectory()) continue
      const rel = relative(ROOT, dir)
      const yml = join(dir, 'series.yml')
      if (!existsSync(yml)) {
        errors.push(`${rel}: a series folder needs a series.yml`)
        continue
      }
      try {
        const fm = (parseYaml(readFileSync(yml, 'utf8')) ?? {}) as Record<string, unknown>
        if (!fm.title) errors.push(`${rel}/series.yml: missing title`)
        if (!Array.isArray(fm.episodes) || !fm.episodes.length) errors.push(`${rel}/series.yml: missing episodes list`)
        if (seriesFm.has(f)) errors.push(`${rel}: duplicate series id "${f}"`)
        seriesFm.set(f, { ...fm, level: levelDir })
      } catch (err) {
        errors.push(`${rel}/series.yml: invalid YAML: ${(err as Error).message}`)
      }
    }
  }
  const episodeOf = new Map<string, { series: string; episode: number }>()
  for (const [sid, fm] of seriesFm) {
    const eps = Array.isArray(fm.episodes) ? fm.episodes.map(String) : []
    eps.forEach((id, i) => {
      if (episodeOf.has(id)) errors.push(`series ${sid}: episode "${id}" is listed twice`)
      else episodeOf.set(id, { series: sid, episode: i + 1 })
    })
  }

  // ---- stories
  const stories: StoryMeta[] = []
  const ids = new Set<string>()
  for (const file of walk(STORIES)) {
    const id = basename(file, '.md')
    const rel = relative(ROOT, file)
    if (ids.has(id)) {
      errors.push(`${rel}: duplicate story id "${id}"`)
      continue
    }
    ids.add(id)
    const [levelDir, ...sub] = relative(STORIES, file).split(sep)
    const seriesId = sub.length === 2 ? sub[0] : undefined
    if (sub.length > 2) errors.push(`${rel}: stories go in content/stories/<level>/ or content/stories/<level>/<series>/`)
    const ep = episodeOf.get(id)
    if (seriesId && ep?.series !== seriesId) errors.push(`${rel}: not listed in ${seriesId}/series.yml`)
    if (!seriesId && ep) errors.push(`${rel}: listed in series "${ep.series}" but not in its folder`)
    const inSeries = seriesId ? seriesFm.get(seriesId) : undefined
    const { front, body } = splitFrontMatter(readFileSync(file, 'utf8'))
    let fm: Record<string, unknown>
    try {
      fm = (parseYaml(front) ?? {}) as Record<string, unknown>
    } catch (err) {
      errors.push(`${rel}: invalid front matter: ${(err as Error).message}`)
      continue
    }
    const level = String(fm.level ?? levelDir)
    if (!LEVELS.some((l) => l.id === level)) errors.push(`${rel}: unknown level "${level}"`)
    if (inSeries && level !== inSeries.level) errors.push(`${rel}: every episode of a series is at the series' level (${inSeries.level})`)
    if (!fm.title) errors.push(`${rel}: missing title`)

    let terms
    try {
      terms = parseTerms(fm)
    } catch (err) {
      errors.push(`${rel}: ${(err as Error).message}`)
      continue
    }
    const chapters = analyzeChapters(tokenizer, parseStoryBody(body), terms)
    const words = allWords(chapters)
    if (dict) await dict.annotate(words)

    const stats = textStats(chapters)

    const meta: StoryMeta = {
      id,
      title: String(fm.title ?? id),
      ...(fm.title_en ? { title_en: String(fm.title_en) } : {}),
      level: level as StoryMeta['level'],
      category: String(fm.category ?? 'misc'),
      ...(Array.isArray(fm.tags) ? { tags: fm.tags.map(String) } : {}),
      ...(fm.summary ? { summary: String(fm.summary) } : {}),
      ...(fm.author ? { author: String(fm.author) } : {}),
      ...(fm.license ? { license: String(fm.license) } : {}),
      ...(fm.source ? { source: String(fm.source) } : {}),
      ...(fm.year ? { year: Number(fm.year) } : {}),
      ...stats,
      added: (fm.added ? String(fm.added) : undefined) ?? gitAddedDate(file) ?? new Date().toISOString(),
      ...(inSeries && ep ? { series: ep.series, episode: ep.episode } : {}),
    }

    const keywords = await buildKeywords(tokenizer, fm.keywords, words, level, dict)
    const doc: StoryDoc = { meta, keywords, chapters }
    writeFileSync(join(OUT, 'stories', `${id}.json`), JSON.stringify(doc))
    stories.push(meta)
  }

  // ---- grammar
  const grammar: GrammarMeta[] = []
  for (const file of walk(join(CONTENT, 'grammar'))) {
    const id = basename(file, '.md')
    const { front, body } = splitFrontMatter(readFileSync(file, 'utf8'))
    let fm: Record<string, unknown> = {}
    try {
      fm = (parseYaml(front) ?? {}) as Record<string, unknown>
    } catch (err) {
      errors.push(`${relative(ROOT, file)}: invalid front matter: ${(err as Error).message}`)
    }
    const meta: GrammarMeta = {
      id,
      title: String(fm.title ?? id),
      ...(fm.title_jp ? { title_jp: String(fm.title_jp) } : {}),
      ...(fm.jlpt ? { jlpt: String(fm.jlpt) } : {}),
      ...(fm.order != null ? { order: Number(fm.order) } : {}),
      ...(fm.summary ? { summary: String(fm.summary) } : {}),
    }
    const html = await marked.parse(body)
    writeFileSync(join(OUT, 'grammar', `${id}.json`), JSON.stringify({ meta, html }))
    grammar.push(meta)
  }
  grammar.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title))

  const levelOrder = (l: string) => LEVELS.findIndex((x) => x.id === l)
  // episodes of a series stay together and in order, at the place of the first episode
  const firstEp = new Map<string, number>()
  for (const s of stories) if (s.series && s.episode === 1) firstEp.set(s.series, s.chars)
  const sortChars = (s: StoryMeta) => (s.series ? (firstEp.get(s.series) ?? s.chars) : s.chars)
  stories.sort(
    (a, b) =>
      levelOrder(a.level) - levelOrder(b.level) ||
      sortChars(a) - sortChars(b) ||
      (a.series ?? '').localeCompare(b.series ?? '') ||
      (a.episode ?? 0) - (b.episode ?? 0),
  )

  const series: SeriesMeta[] = []
  for (const [id, fm] of seriesFm) {
    const eps = (Array.isArray(fm.episodes) ? fm.episodes.map(String) : []).map((e) => stories.find((s) => s.id === e))
    eps.forEach((s, i) => {
      if (!s) errors.push(`series ${id}: episode "${(fm.episodes as unknown[])[i]}" has no file in its folder`)
    })
    const found = eps.filter((s): s is StoryMeta => !!s)
    series.push({
      id,
      title: String(fm.title ?? id),
      ...(fm.title_en ? { title_en: String(fm.title_en) } : {}),
      level: fm.level as SeriesMeta['level'],
      category: String(fm.category ?? found[0]?.category ?? 'misc'),
      ...(fm.summary ? { summary: String(fm.summary) } : {}),
      ...(fm.author ? { author: String(fm.author) } : {}),
      episodes: found.map((s) => s.id),
      chars: found.reduce((a, s) => a + s.chars, 0),
      added: found.map((s) => s.added ?? '').sort().pop(),
    })
  }
  series.sort((a, b) => levelOrder(a.level) - levelOrder(b.level) || a.title.localeCompare(b.title))

  const index: LibraryIndex = { built: new Date().toISOString(), stories, series, grammar }
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index))

  // ---- kuromoji dictionary for the browser
  mkdirSync(KUROMOJI_OUT, { recursive: true })
  for (const f of readdirSync(KUROMOJI_SRC)) copyFileSync(join(KUROMOJI_SRC, f), join(KUROMOJI_OUT, f))

  console.log(`library: ${stories.length} stories, ${series.length} series, ${grammar.length} grammar articles → ${relative(ROOT, OUT)}`)
  if (errors.length) {
    console.error(errors.map((e) => `✗ ${e}`).join('\n'))
    process.exit(1)
  }
}

async function buildKeywords(
  tokenizer: Tokenizer,
  given: unknown,
  words: Word[],
  level: string,
  dict: Dictionary | null,
): Promise<Keyword[]> {
  if (Array.isArray(given) && given.length) {
    const out: Keyword[] = []
    for (const item of given) {
      const [w, r, m] = String(item).split('|').map((s) => s.trim())
      if (!w) continue
      const kw: Keyword = { w, r: r ?? '', m: m ?? '' }
      if (dict) {
        // keywords may be given conjugated (寝ます, ていねいに): fall back to the lemma
        const [head, ...rest] = tokenizer.tokenize(w)
        const inflected = rest.every((t, i) => t.pos === '助動詞' || (t.surface_form === 'に' && i === rest.length - 1))
        const lemma = inflected ? head?.basic_form : undefined
        const hit =
          (await dict.bestEntry({ s: w, r: r || undefined })) ??
          (lemma && lemma !== '*' && lemma !== w ? await dict.bestEntry({ s: lemma }) : undefined)
        if (hit?.entry.j) kw.j = hit.entry.j
        if (!kw.m && hit) kw.m = hit.entry.s[0].g.slice(0, 3).join('; ')
        if (!kw.r && hit) kw.r = hit.reading.t
      }
      out.push(kw)
    }
    return out
  }
  if (!dict) return []
  // Automatic: the hardest content words, weighted by how often they appear.
  const target = levelJlpt(level)
  const counts = new Map<string, { w: Word; n: number }>()
  for (const w of words) {
    if (!['n', 'v', 'a', 'na', 'adv'].includes(w.p) || !w.e) continue
    const k = lemmaKey(w)
    const c = counts.get(k)
    if (c) c.n++
    else counts.set(k, { w, n: 1 })
  }
  const scored: { w: Word; score: number; entry: NonNullable<Awaited<ReturnType<Dictionary['bestEntry']>>> }[] = []
  for (const { w, n } of counts.values()) {
    const hit = await dict.bestEntry(w)
    if (!hit) continue
    const j = hit.entry.j ?? 0
    // Words outside the JLPT lists are usually rarer — unless they are very frequent (時, すぐ…)
    const frequent = (hit.entry.q ?? 100) <= 24
    const hardness = j === 0 ? (frequent ? 0 : 2.5) : j < target ? target - j + 1 : 0
    if (hardness > 0) scored.push({ w, score: hardness * (1 + Math.log2(n)), entry: hit })
  }
  scored.sort((a, b) => b.score - a.score)
  const out: Keyword[] = []
  for (const { w, entry: hit } of scored.slice(0, 8)) {
    const hw = headword(hit.entry)
    out.push({
      w: w.b ?? w.s,
      r: hit.reading.t !== (w.b ?? w.s) ? hit.reading.t : hw.reading,
      m: hit.entry.s[0].g.slice(0, 3).join('; '),
      ...(hit.entry.j ? { j: hit.entry.j } : {}),
    })
  }
  return out
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
