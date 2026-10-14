// Content quality report for content/stories. Run after `npm run data`:
//   npm run audit -- [filter] [--errors]
// Prints, per story, problems a reviewer should look at:
//   - original (non-Aozora) stories with sentences that have no translation
//   - lines that contain more than one sentence
//   - half-width punctuation in Japanese lines
//   - keywords that don't occur in the text, or whose reading differs from the dictionary
//   - words in kanji the tokenizer took for a name and guessed a reading for (照 → あきら)
//   - words the dictionary doesn't know, and long kana runs that look like a misparse
//   - sentence count outside the level's guideline, and the share of vocabulary above the level
// Exit code 1 when any story has errors (missing translations, broken keywords);
// --errors prints only those (used in CI).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import * as kuromoji from '@patdx/kuromoji'
import NodeDictionaryLoader from '@patdx/kuromoji/node'
import { analyzeSentence, isLookupWord, type Tokenizer } from '../src/lib/analyze'
import { extractRuby, parseStoryBody, splitFrontMatter } from '../src/lib/text'
import { Dictionary } from '../src/lib/dict'
import { levelJlpt } from '../src/lib/levels'
import type { KToken, Word } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DICT = join(ROOT, 'public', 'data', 'dict')

// sentences per level (content/README.md), with some slack
const LENGTH: Record<string, [number, number]> = {
  'beginner-1': [5, 16],
  'beginner-2': [10, 24],
  'beginner-3': [15, 32],
  elementary: [20, 45],
  intermediate: [30, 65],
  advanced: [40, 90],
  master: [0, Infinity],
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : []
  })
}

const hira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
const hasKanji = (s: string) => /[㐀-鿿々]/.test(s)

async function main() {
  const args = process.argv.slice(2)
  const errorsOnly = args.includes('--errors')
  const filter = args.find((a) => !a.startsWith('--'))
  const tk = await new kuromoji.TokenizerBuilder({
    loader: new NodeDictionaryLoader({ dic_path: join(ROOT, 'node_modules', '@patdx', 'kuromoji', 'dict') } as never),
  }).build()
  const tokenizer: Tokenizer = { tokenize: (t) => tk.tokenize(t) as unknown as KToken[] }
  if (!existsSync(join(DICT, 'meta.json'))) throw new Error('dictionary not built: run `npm run data` first')
  const dict = new Dictionary(async (p) => JSON.parse(readFileSync(join(DICT, p), 'utf8')))

  let failed = 0
  for (const file of walk(join(ROOT, 'content', 'stories')).sort()) {
    const rel = relative(ROOT, file)
    if (filter && !rel.includes(filter)) continue
    const errors: string[] = []
    const notes: string[] = []
    const { front, body } = splitFrontMatter(readFileSync(file, 'utf8'))
    const fm = (parseYaml(front) ?? {}) as Record<string, unknown>
    const level = String(fm.level ?? basename(dirname(file)))
    const original = !fm.source
    const raw = parseStoryBody(body)
    const sentences = raw.flatMap((c) => c.p.flatMap((p) => p.s))

    for (const k of ['title', 'title_en', 'level', 'category', 'summary', 'author', 'license'])
      if (!fm[k]) notes.push(`front matter: no ${k}`)
    if (level !== basename(dirname(file))) errors.push(`level "${level}" does not match folder`)

    for (const s of sentences) {
      const plain = extractRuby(s.text).plain
      if (original && !s.en) errors.push(`no translation: ${s.text}`)
      if (/[?!,()]/.test(plain)) notes.push(`half-width punctuation: ${s.text}`)
      // more than one sentence on a line (ignoring enders inside quotes)
      let depth = 0
      const t = plain.replace(/[。！？]+(?=[」』）]|$)/g, '')
      for (let i = 0; i < t.length; i++) {
        const ch = t[i]
        if ('「『（'.includes(ch)) depth++
        else if ('」』）'.includes(ch)) depth = Math.max(0, depth - 1)
        else if (depth === 0 && '。！？'.includes(ch)) {
          if (original) notes.push(`several sentences on one line: ${s.text}`)
          break
        }
      }
      if (s.en && /[ぁ-んァ-ン一-龯]/.test(s.en)) notes.push(`Japanese in translation: ${s.en}`)
    }

    const target = levelJlpt(level)
    const words: Word[] = []
    let content = 0
    let above = 0
    const unknown = new Set<string>()
    const hard = new Map<string, number>()
    for (const s of sentences) {
      const { hints } = extractRuby(s.text)
      const ws = analyzeSentence(tokenizer, s.text)
      await dict.annotate(ws)
      words.push(...ws)
      let pos = 0
      for (const w of ws) {
        const start = pos
        pos += w.s.length
        const hinted = hints.some((h) => h.start < pos && h.end > start)
        // the tokenizer took a word in kanji for a name and guessed its reading
        // (single kanji are nearly always a mistake; longer ones only when the
        // dictionary doesn't have that reading; 山の上 and the like read fine)
        if (w.p === 'name' && hasKanji(w.s) && !hinted && !w.s.includes('の')) {
          const hit = await dict.bestEntry({ s: w.s, r: w.r })
          const ok = hit?.entry.r.some((x) => hira(typeof x === 'string' ? x : x.t) === w.r)
          if (!ok || w.s.length === 1) notes.push(`reading guessed for name ${w.s}[${w.r ?? '?'}]: ${s.text}`)
        }
        if (!isLookupWord(w) || ['name', 'num', 'sym', 'prt', 'aux'].includes(w.p)) continue
        content++
        if (!w.e) {
          const lemma = w.b ?? w.s
          // a long run of hiragana the dictionary doesn't know is usually a misparse
          // (かぎをれいぞうこに); onomatopoeia + と (ごうごうと) is fine
          if (/^[ぁ-ゖー]{3,}$/.test(w.s) && !/^(.+)\1?と$/.test(w.s) && !/[っり]と$/.test(w.s))
            notes.push(`possible misparse "${w.s}": ${s.text}`)
          else if (hasKanji(w.s) || /^[ぁ-ゖ]/.test(w.s)) unknown.add(lemma)
        }
        if (w.j && w.j < target) {
          above++
          const k = `${w.b ?? w.s}(N${w.j})`
          hard.set(k, (hard.get(k) ?? 0) + 1)
        }
      }
    }
    if (unknown.size && original) notes.push(`not in dictionary: ${[...unknown].join(' ')}`)

    // keywords
    if (Array.isArray(fm.keywords)) {
      const text = sentences.map((s) => extractRuby(s.text).plain).join('\n')
      const lemmas = new Set(words.flatMap((w) => [w.s, w.b, w.r, w.br].filter(Boolean) as string[]))
      for (const item of fm.keywords) {
        const [w, r, m] = String(item).split('|').map((x) => x.trim())
        if (!w || r === undefined || !m) errors.push(`malformed keyword: ${item}`)
        if (!w) continue
        const stem = w.replace(/(する|います|ます|る|う|く|ぐ|す|つ|ぬ|ぶ|む|い|な|だ)$/, '')
        if (!text.includes(w) && !lemmas.has(w) && !(stem.length >= 1 && text.includes(stem)))
          errors.push(`keyword not in text: ${w}`)
        // same fallback as the build: conjugated keywords (寝ます) are looked up by lemma
        const [head, ...rest] = tk.tokenize(w)
        const inflected = rest.every((t, i) => t.pos === '助動詞' || (t.surface_form === 'に' && i === rest.length - 1))
        const lemma = inflected && head?.basic_form !== '*' && head?.basic_form !== w ? head?.basic_form : undefined
        const direct = await dict.bestEntry({ s: w, r: r || undefined })
        const hit = direct ?? (lemma ? await dict.bestEntry({ s: lemma }) : undefined)
        if (!hit) notes.push(`keyword not in dictionary: ${w}`)
        else if (direct && r && hasKanji(w)) {
          const readings = hit.entry.r.map((x) => hira(typeof x === 'string' ? x : x.t))
          if (readings.length && !readings.includes(hira(r))) notes.push(`keyword reading ${w}|${r}: dictionary has ${readings.join('/')}`)
        }
      }
    }

    const [min, max] = LENGTH[level] ?? [0, Infinity]
    if (original && (sentences.length < min || sentences.length > max))
      notes.push(`${sentences.length} sentences (guideline for ${level}: ${min}–${max})`)
    const pct = content ? Math.round((100 * above) / content) : 0
    const top = [...hard.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k)
    const summary = `${sentences.length} sentences, ${content} content words, ${pct}% above N${target}`

    if (errors.length) failed++
    if (errorsOnly && !errors.length) continue
    console.log(`\n${errors.length ? '✗' : notes.length ? '•' : '✓'} ${rel} — ${summary}`)
    if (top.length && level !== 'master') console.log(`    above level: ${top.join(' ')}`)
    for (const e of errors) console.log(`    ERROR ${e}`)
    if (!errorsOnly) for (const n of notes) console.log(`    ${n}`)
  }
  if (failed) {
    console.log(`\n${failed} stories with errors`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
