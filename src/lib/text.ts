// Parsing of story bodies (see content/README.md) and of arbitrary pasted text.

export interface RawSentence {
  text: string
  en?: string
}
export interface RawParagraph {
  s: RawSentence[]
}
export interface RawChapter {
  title?: string
  p: RawParagraph[]
}

export interface Hint {
  start: number
  end: number
  reading: string
}

/**
 * Split `---` YAML front matter from a Markdown document.
 */
export function splitFrontMatter(md: string): { front: string; body: string } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md)
  if (!m) return { front: '', body: md }
  return { front: m[1], body: md.slice(m[0].length) }
}

/** Parse a story body: one sentence per line, `> ` translations, `## ` chapters. */
export function parseStoryBody(body: string): RawChapter[] {
  const chapters: RawChapter[] = [{ p: [] }]
  let para: RawParagraph | null = null
  let last: RawSentence | null = null
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      para = null
      last = null
      continue
    }
    if (line.startsWith('## ')) {
      const ch = chapters[chapters.length - 1]
      if (!ch.p.length && !ch.title) ch.title = line.slice(3).trim()
      else chapters.push({ title: line.slice(3).trim(), p: [] })
      para = null
      last = null
      continue
    }
    if (line.startsWith('# ') || line.startsWith('<!--')) continue
    if (line.startsWith('>')) {
      const en = line.replace(/^>\s?/, '').trim()
      if (last) last.en = last.en ? `${last.en} ${en}` : en
      continue
    }
    if (!para) {
      para = { s: [] }
      chapters[chapters.length - 1].p.push(para)
    }
    last = { text: line }
    para.s.push(last)
  }
  return chapters.filter((c) => c.p.length || c.title)
}

const OPEN = '「『（(［【〈《“'
const CLOSE = '」』）)］】〉》”'
const ENDERS = '。！？!?．'

/** Split a run of Japanese text into sentences, keeping quotes together. */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  let cur = ''
  let depth = 0
  const chars = Array.from(text)
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    cur += ch
    if (OPEN.includes(ch)) depth++
    else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1)
    if (depth === 0 && (ENDERS.includes(ch) || (CLOSE.includes(ch) && ch !== '）' && ch !== ')'))) {
      // absorb trailing enders/closers (！？」 etc.)
      while (i + 1 < chars.length && (ENDERS.includes(chars[i + 1]) || CLOSE.includes(chars[i + 1]))) {
        cur += chars[++i]
      }
      // a closing quote followed by と/って continues the sentence
      if (CLOSE.includes(ch) && i + 1 < chars.length && /[とっ]/.test(chars[i + 1])) continue
      if (cur.trim()) out.push(cur.trim())
      cur = ''
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** Parse arbitrary pasted text into chapters/paragraphs/sentences. */
export function parsePlainText(text: string): RawChapter[] {
  const paragraphs: RawParagraph[] = []
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)
  for (const block of blocks) {
    // Within a block, a line that starts with an indent (full-width space) or
    // a quote begins a new paragraph — common in Japanese prose.
    const lines = block.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim())
    let cur: string[] = []
    const flush = () => {
      if (!cur.length) return
      const sentences = splitSentences(cur.join(''))
      if (sentences.length) paragraphs.push({ s: sentences.map((t) => ({ text: t })) })
      cur = []
    }
    for (const line of lines) {
      if (/^[　\s]/.test(line) || /^[「『]/.test(line.trim())) flush()
      cur.push(line.trim())
    }
    flush()
  }
  return [{ p: paragraphs }]
}

/**
 * Extract Aozora-style ruby: `｜朱鷺《とき》` or `朱鷺《とき》`.
 * Returns the plain text plus reading hints by character offset.
 */
export function extractRuby(text: string): { plain: string; hints: Hint[] } {
  const hints: Hint[] = []
  let plain = ''
  const re = /｜([^《｜]+)《([^》]+)》|((?:[㐀-䶿一-鿿豈-﫿々〆ヶ]|[\ud840-\ud87f][\udc00-\udfff])+)《([^》]+)》/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    plain += text.slice(last, m.index)
    const base = m[1] ?? m[3]
    const reading = m[2] ?? m[4]
    hints.push({ start: plain.length, end: plain.length + base.length, reading })
    plain += base
    last = m.index + m[0].length
  }
  plain += text.slice(last)
  // stray markers
  plain = plain.replace(/[｜]/g, '')
  return { plain, hints }
}
