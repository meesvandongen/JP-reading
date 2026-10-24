// Content quality report for content/stories. Run after `pnpm run data`:
//   pnpm run audit -- [filter] [--errors]
// Prints, per story, problems a reviewer should look at:
//   - original (non-Aozora) stories with sentences that have no translation
//   - lines that contain more than one sentence
//   - half-width punctuation in Japanese lines, ruby whose reading covers kana before the kanji (needs ｜)
//   - keywords that don't occur in the text, or whose reading differs from the dictionary
//   - words in kanji the tokenizer took for a name and guessed a reading for (照 → あきら)
//   - words the dictionary doesn't know, and long kana runs that look like a misparse
//   - names in graded stories with no meaning (清水寺 is not in JMdict) or read as a common word
//     (紫式部 → "Japanese beautyberry"): declare them in `names:`
//   - katakana words read as a native word (ワン → 湾 "bay") or not in the dictionary at all:
//     declare them in `glosses:` / `names:`, or check how the katakana was cut
//   - sentence count outside the level's guideline, and the share of vocabulary above the level
// Exit code 1 when any story has errors (missing translations, broken keywords or names, names in a
// graded story that aren't in `names:`);
// --errors prints only those (used in CI).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import * as kuromoji from '@patdx/kuromoji'
import NodeDictionaryLoader from '@patdx/kuromoji/node'
import { analyzeSentence, isKatakanaScript, isLookupWord, type AnalyzeOptions, type Tokenizer } from '../src/lib/analyze'
import { extractRuby, parseStoryBody, parseTerms, splitFrontMatter } from '../src/lib/text'
import { Dictionary, isProperNoun } from '../src/lib/dict'
import { levelJlpt } from '../src/lib/levels'
import type { KToken, Term, Word } from '../src/lib/types'

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
const isKatakana = (s: string) => /^[ァ-ヺー・ヽヾ]+$/.test(s)

async function main() {
  const args = process.argv.slice(2)
  const errorsOnly = args.includes('--errors')
  const filter = args.find((a) => !a.startsWith('--'))
  const tk = await new kuromoji.TokenizerBuilder({
    loader: new NodeDictionaryLoader({ dic_path: join(ROOT, 'node_modules', '@patdx', 'kuromoji', 'dict') } as never),
  }).build()
  const tokenizer: Tokenizer = { tokenize: (t) => tk.tokenize(t) as unknown as KToken[] }
  if (!existsSync(join(DICT, 'meta.json'))) throw new Error('dictionary not built: run `pnpm run data` first')
  const dict = new Dictionary(async (p) => JSON.parse(readFileSync(join(DICT, p), 'utf8')))

  let failed = 0
  for (const file of walk(join(ROOT, 'content', 'stories')).sort()) {
    const rel = relative(ROOT, file)
    if (filter && !rel.includes(filter)) continue
    const errors: string[] = []
    const notes: string[] = []
    const { front, body } = splitFrontMatter(readFileSync(file, 'utf8'))
    const fm = (parseYaml(front) ?? {}) as Record<string, unknown>
    // content/stories/<level>/[<series>/]<slug>.md
    const levelDir = relative(join(ROOT, 'content', 'stories'), file).split(sep)[0]
    const level = String(fm.level ?? levelDir)
    const original = !fm.source
    const raw = parseStoryBody(body)
    const sentences = raw.flatMap((c) => c.p.flatMap((p) => p.s))
    let terms: Term[] = []
    try {
      terms = parseTerms(fm)
    } catch (err) {
      errors.push((err as Error).message)
    }
    const opts: AnalyzeOptions = { terms, katakanaScript: isKatakanaScript(sentences.map((s) => s.text).join('\n')) }
    const plainText = sentences.map((s) => extractRuby(s.text).plain).join('\n')
    for (const t of terms) if (!plainText.includes(t.s)) errors.push(`${t.name ? 'name' : 'gloss'} not in text: ${t.s}`)
    const unnamed = new Set<string>()
    const unknownKatakana = new Set<string>()
    const homographs = new Map<string, string>()
    const misread = new Map<string, string>()

    for (const k of ['title', 'title_en', 'level', 'category', 'summary', 'author', 'license'])
      if (!fm[k]) notes.push(`front matter: no ${k}`)
    if (level !== levelDir) errors.push(`level "${level}" does not match folder`)

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
      // 山ノ内町《やまのうちまち》: the ruby only covers the kanji run 内町, the reading the whole name
      for (const m of s.text.matchAll(/[㐀-鿿々]([぀-ヿ])([㐀-鿿々]+)《([^》]+)》/g)) {
        const [, kana, base, reading] = m
        if (s.text.lastIndexOf('｜', m.index) > s.text.lastIndexOf('》', m.index)) continue
        const at = hira(reading).indexOf(hira(kana))
        if (at >= 2 && reading.length - at - 1 >= base.length * 2)
          notes.push(`ruby ${base}《${reading}》 seems to cover more than ${base}: mark the start with ｜ — ${s.text}`)
      }
    }

    const target = levelJlpt(level)
    const words: Word[] = []
    let content = 0
    let above = 0
    const unknown = new Set<string>()
    const hard = new Map<string, number>()
    for (const s of sentences) {
      const { hints } = extractRuby(s.text)
      const ws = analyzeSentence(tokenizer, s.text, opts)
      await dict.annotate(ws)
      words.push(...ws)
      const persons = new Set(tk.tokenize(extractRuby(s.text).plain).filter((t) => t.pos_detail_2 === '人名').map((t) => t.surface_form))
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
        // names: a meaning from `names:`, or a dictionary entry that is a name too
        // (graded stories only: classics have too many; 山の上 and single kanji are tokenizer slips)
        if (original && w.p === 'name' && !w.m && /[぀-ヿ㐀-鿿]/.test(w.s) && !w.s.includes('の') && w.s.length > 1 && !unnamed.has(w.s) && !misread.has(w.s)) {
          const hit = await dict.bestEntry(w)
          if (!hit) unnamed.add(w.s)
          // tokens IPADIC calls a person's name (紫式部, 大石), not words it calls a name by mistake (毎日)
          else if (!isProperNoun(hit.entry) && hasKanji(w.s) && persons.has(w.s))
            misread.set(w.s, `name ${w.s} read as "${hit.entry.s[0]?.g[0]}" (add it to names:): ${s.text}`)
        }
        // katakana words: one the dictionary doesn't have, or that only matches a native
        // word read the same way, is usually a name, a sound word or a bad cut
        if (isKatakana(w.s) && w.p !== 'name' && !w.m && !opts.katakanaScript && isLookupWord(w) && w.s.length > 1) {
          const hit = await dict.bestEntry(w)
          if (!hit) unknownKatakana.add(w.s)
          else if (!/[ァ-ヺ]/.test(hit.reading.t) && !hit.entry.uk && hit.entry.k.length && !homographs.has(w.s)) {
            const hw = typeof hit.entry.k[0] === 'string' ? hit.entry.k[0] : hit.entry.k[0][0]
            homographs.set(w.s, `katakana ${w.s} read as ${hw} "${hit.entry.s[0]?.g[0]}" (if wrong, add it to glosses: or names:): ${s.text}`)
          }
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
    // graded stories must declare their names
    if (unnamed.size) errors.push(`names with no meaning (add them to names:): ${[...unnamed].join(' ')}`)
    if (unknownKatakana.size)
      notes.push(`katakana not in dictionary (add to glosses: or names:, or check the cut): ${[...unknownKatakana].join(' ')}`)
    notes.push(...homographs.values())
    errors.push(...misread.values())

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
