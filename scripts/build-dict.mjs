#!/usr/bin/env node
// Builds the dictionary data the app loads at runtime:
//   public/data/dict/j/<bucket>.json   Japanese → entries (JMdict + pitch accent + JLPT)
//   public/data/dict/e/<bucket>.json   English word → short result list
//   public/data/dict/k/<bucket>.json   kanji info (KANJIDIC2)
//   public/data/dict/meta.json
//
// Sources are downloaded once into .cache/ (see SOURCES below). The output is
// not committed; CI runs this script before building the site.

import { createReadStream, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import sax from 'sax'
import { J_BUCKETS, E_BUCKETS, K_BUCKETS, bucketOf, normalizeKey, englishWords } from '../src/lib/dictKeys.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.cache')
const OUT = join(ROOT, 'public', 'data', 'dict')

const SOURCES = {
  jmdict: 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz',
  kanjidic: 'http://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz',
  accents: 'https://raw.githubusercontent.com/mifunetoshiro/kanjium/master/data/source_files/raw/accents.txt',
  n5: 'https://raw.githubusercontent.com/elzup/jlpt-word-list/master/src/n5.csv',
  n4: 'https://raw.githubusercontent.com/elzup/jlpt-word-list/master/src/n4.csv',
  n3: 'https://raw.githubusercontent.com/elzup/jlpt-word-list/master/src/n3.csv',
  n2: 'https://raw.githubusercontent.com/elzup/jlpt-word-list/master/src/n2.csv',
  n1: 'https://raw.githubusercontent.com/elzup/jlpt-word-list/master/src/n1.csv',
}
const FILES = {
  jmdict: 'JMdict_e.gz',
  kanjidic: 'kanjidic2.xml.gz',
  accents: 'accents.txt',
  n5: 'jlpt-n5.csv',
  n4: 'jlpt-n4.csv',
  n3: 'jlpt-n3.csv',
  n2: 'jlpt-n2.csv',
  n1: 'jlpt-n1.csv',
}

async function download(name) {
  const file = join(CACHE, FILES[name])
  if (existsSync(file)) return file
  const url = SOURCES[name]
  console.log(`downloading ${url}`)
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await pipeline(res.body, createWriteStream(file + '.part'))
      const { renameSync } = await import('node:fs')
      renameSync(file + '.part', file)
      return file
    } catch (err) {
      if (attempt >= 4) throw new Error(`failed to download ${url}: ${err.message}`)
      await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)))
    }
  }
}

// ---------------------------------------------------------------------------
// XML parsing helpers

function parseXml(file, gz, { onOpen, onClose, onText, entities = {} }) {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { trim: false })
    // JMdict and KANJIDIC declare entities in their internal DTD. sax does not
    // read DTDs, so register them up front, mapping each to its own name
    // (e.g. &v5k; → "v5k") which is the compact code we want anyway.
    Object.assign(parser._parser.ENTITIES, entities)
    parser.on('opentag', (n) => onOpen?.(n.name, n.attributes))
    parser.on('closetag', (name) => onClose?.(name))
    parser.on('text', (t) => onText?.(t))
    parser.on('error', reject)
    parser.on('end', resolve)
    let stream = createReadStream(file)
    if (gz) stream = stream.pipe(createGunzip())
    stream.pipe(parser)
  })
}

async function readDtdEntities(file) {
  // Read the head of the file (the DTD) and collect <!ENTITY name "...">.
  const entities = {}
  const descriptions = {}
  await new Promise((resolve, reject) => {
    let buf = ''
    const s = createReadStream(file).pipe(createGunzip())
    s.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      if (buf.includes(']>')) s.destroy()
    })
    s.on('close', resolve)
    s.on('error', reject)
    s.on('end', resolve)
    s.on('close', () => {
      for (const m of buf.matchAll(/<!ENTITY\s+([\w-]+)\s+"([^"]*)">/g)) {
        entities[m[1]] = m[1]
        descriptions[m[1]] = m[2]
      }
    })
  })
  return { entities, descriptions }
}

// ---------------------------------------------------------------------------
// Supplementary data: pitch accent and JLPT levels

function loadAccents(file) {
  const map = new Map() // "word|reading" → "0,2"
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const [word, reading, acc] = line.split('\t')
    if (!word || !acc) continue
    const r = reading || word
    map.set(`${toHira(word)}|${toHira(r)}`, acc.trim())
  }
  return map
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

function loadJlpt(files) {
  const map = new Map() // "word|reading" → level number (5 = N5 … 1 = N1)
  for (const [level, file] of files) {
    const lines = readFileSync(file, 'utf8').split('\n').slice(1)
    for (const line of lines) {
      if (!line.trim()) continue
      const [expr, reading] = parseCsvLine(line)
      // Some rows list alternatives like "あっち; あちら"
      for (const e of expr.split(/[;；、]/).map((s) => s.trim()).filter(Boolean)) {
        const r = (reading || e).split(/[;；、]/)[0].trim()
        const key = `${toHira(e)}|${toHira(r)}`
        if (!map.has(key) || map.get(key) < level) map.set(key, level)
      }
    }
  }
  return map
}

function toHira(s) {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

// ---------------------------------------------------------------------------
// JMdict

const COMMON_PRI = new Set(['news1', 'ichi1', 'spec1', 'spec2', 'gai1'])

function priScore(pris) {
  // Lower is more frequent. nfXX gives frequency bands of 500 words.
  let score = 100
  for (const p of pris) {
    if (/^nf\d\d$/.test(p)) score = Math.min(score, parseInt(p.slice(2), 10))
    else if (COMMON_PRI.has(p)) score = Math.min(score, 60)
    else if (p === 'news2' || p === 'ichi2' || p === 'gai2') score = Math.min(score, 80)
  }
  return score
}

async function buildJmdict(file, accents, jlpt) {
  const { entities, descriptions } = await readDtdEntities(file)
  const entries = []
  let entry, kEle, rEle, sense, text = '', glossType = null
  await parseXml(file, true, {
    entities,
    onOpen(name, attrs) {
      text = ''
      switch (name) {
        case 'entry': entry = { id: 0, k: [], r: [], s: [], pri: [] }; break
        case 'k_ele': kEle = { t: '', inf: [], pri: [] }; break
        case 'r_ele': rEle = { t: '', inf: [], pri: [], restr: [], nokanji: false }; break
        case 'sense': sense = { pos: [], g: [], misc: [], field: [], dial: [], info: [], xref: [], stagk: [], stagr: [] }; break
        case 'gloss': glossType = attrs.g_type || null; break
        case 're_nokanji': rEle.nokanji = true; break
      }
    },
    onText(t) { text += t },
    onClose(name) {
      const t = text.trim()
      switch (name) {
        case 'ent_seq': entry.id = parseInt(t, 10); break
        case 'keb': kEle.t = t; break
        case 'ke_inf': kEle.inf.push(t); break
        case 'ke_pri': kEle.pri.push(t); break
        case 'k_ele': entry.k.push(kEle); kEle = null; break
        case 'reb': rEle.t = t; break
        case 're_inf': rEle.inf.push(t); break
        case 're_pri': rEle.pri.push(t); break
        case 're_restr': rEle.restr.push(t); break
        case 'r_ele': entry.r.push(rEle); rEle = null; break
        case 'pos': sense.pos.push(t); break
        case 'misc': sense.misc.push(t); break
        case 'field': sense.field.push(t); break
        case 'dial': sense.dial.push(t); break
        case 's_inf': sense.info.push(t); break
        case 'xref': sense.xref.push(t.replace(/・\d+$/, '')); break
        case 'stagk': sense.stagk.push(t); break
        case 'stagr': sense.stagr.push(t); break
        case 'gloss': sense.g.push(glossType && glossType !== 'expl' ? `${t}` : t); glossType = null; break
        case 'sense':
          // JMdict omits pos on later senses when it equals the previous one
          if (!sense.pos.length && entry.s.length) sense.pos = entry.s[entry.s.length - 1].pos
          entry.s.push(sense); sense = null; break
        case 'entry': entries.push(finishEntry(entry, accents, jlpt)); entry = null; break
      }
      text = ''
    },
  })
  return { entries, descriptions }
}

function finishEntry(e, accents, jlpt) {
  const pris = [...e.k.flatMap((k) => k.pri), ...e.r.flatMap((r) => r.pri)]
  const score = priScore(pris)
  const common = pris.some((p) => COMMON_PRI.has(p))
  // Pitch accent per reading
  const acc = e.r.map((r) => {
    const rh = toHira(r.t)
    for (const k of e.k) {
      const a = accents.get(`${toHira(k.t)}|${rh}`)
      if (a) return a
    }
    return accents.get(`${rh}|${rh}`) || null
  })
  // JLPT: best (highest number = easiest) level across forms
  let lv = 0
  const forms = e.k.length ? e.k.map((k) => k.t) : e.r.map((r) => r.t)
  for (const f of forms) {
    for (const r of e.r) {
      const l = jlpt.get(`${toHira(f)}|${toHira(r.t)}`)
      if (l && l > lv) lv = l
    }
  }
  if (!lv && e.k.length) {
    // kana-written usage of a kanji word (e.g. する、こと)
    for (const r of e.r) {
      const l = jlpt.get(`${toHira(r.t)}|${toHira(r.t)}`)
      if (l && l > lv) lv = l
    }
  }
  // Compact form. Arrays keep the JSON small; see src/lib/dict.ts for the reader.
  const out = {
    i: e.id,
    k: e.k.map((k) => (k.inf.length ? [k.t, k.inf] : k.t)),
    r: e.r.map((r, i) => {
      const x = { t: r.t }
      if (r.restr.length) x.x = r.restr
      if (r.nokanji) x.n = 1
      if (r.inf.length) x.f = r.inf
      if (acc[i]) x.a = acc[i]
      return Object.keys(x).length === 1 ? r.t : x
    }),
    s: e.s.map((s) => {
      const x = { p: s.pos, g: s.g }
      if (s.misc.length) x.m = s.misc
      if (s.field.length) x.d = s.field
      if (s.dial.length) x.l = s.dial
      if (s.info.length) x.n = s.info
      if (s.xref.length) x.x = s.xref
      if (s.stagk.length) x.sk = s.stagk
      if (s.stagr.length) x.sr = s.stagr
      return x
    }),
  }
  if (common) out.c = 1
  if (score < 100) out.q = score
  if (lv) out.j = lv
  // usually-kana flag on first sense means the word is normally written in kana
  if (e.s[0]?.misc.includes('uk')) out.uk = 1
  return out
}

function rankOf(entry, key) {
  // Lower rank sorts first in lookup results.
  const q = entry.q ?? 100
  const kanjiHit = entry.k.some((k) => normalizeKey(typeof k === 'string' ? k : k[0]) === key)
  // Kana keys: words usually written in kana beat kanji words read the same way.
  const kanaBias = kanjiHit || !entry.k.length ? 0 : entry.uk ? -150 : 50
  return (entry.c ? 0 : 1000) + q * 5 + kanaBias - (entry.j ? 60 + entry.j * 10 : 0)
}

function writeJapaneseShards(entries) {
  const buckets = Array.from({ length: J_BUCKETS }, () => ({ e: [], idx: new Map(), keys: {} }))
  for (const entry of entries) {
    const keys = new Set()
    for (const k of entry.k) keys.add(normalizeKey(typeof k === 'string' ? k : k[0]))
    for (const r of entry.r) keys.add(normalizeKey(typeof r === 'string' ? r : r.t))
    for (const key of keys) {
      const b = buckets[bucketOf(key, J_BUCKETS)]
      let pos = b.idx.get(entry.i)
      if (pos === undefined) {
        pos = b.e.length
        b.e.push(entry)
        b.idx.set(entry.i, pos)
      }
      ;(b.keys[key] ||= []).push(pos)
    }
  }
  mkdirSync(join(OUT, 'j'), { recursive: true })
  let bytes = 0
  buckets.forEach((b, i) => {
    for (const [key, list] of Object.entries(b.keys)) {
      list.sort((x, y) => rankOf(b.e[x], key) - rankOf(b.e[y], key))
    }
    const json = JSON.stringify({ e: b.e, k: b.keys })
    bytes += json.length
    writeFileSync(join(OUT, 'j', `${i}.json`), json)
  })
  console.log(`  japanese shards: ${J_BUCKETS} files, ${(bytes / 1e6).toFixed(1)} MB`)
}

function writeEnglishShards(entries) {
  const index = new Map() // word → [[rank, kanji, reading, gloss]]
  for (const e of entries) {
    const firstKanji = e.k.length ? (typeof e.k[0] === 'string' ? e.k[0] : e.k[0][0]) : ''
    const firstReading = typeof e.r[0] === 'string' ? e.r[0] : e.r[0].t
    const word = e.uk || !firstKanji ? '' : firstKanji
    const short = e.s[0]?.g.slice(0, 3).join('; ') ?? ''
    const seen = new Set()
    e.s.forEach((s, si) => {
      s.g.forEach((g, gi) => {
        const words = englishWords(g)
        const exact = g.toLowerCase().replace(/^to /, '').replace(/\s*\(.*?\)\s*/g, ' ').trim()
        for (const w of words) {
          if (seen.has(w)) continue
          seen.add(w)
          // Prefer entries where this word is the whole gloss, in the first sense
          const rank = (e.c ? 0 : 1000) + (e.q ?? 100) * 3 + si * 40 + gi * 5 + (exact === w ? 0 : 60) - (e.j ? 60 + e.j * 10 : 0)
          let list = index.get(w)
          if (!list) index.set(w, (list = []))
          list.push([rank, word, firstReading, short, e.j ?? 0])
        }
      })
    })
  }
  const buckets = Array.from({ length: E_BUCKETS }, () => ({}))
  for (const [w, list] of index) {
    list.sort((a, b) => a[0] - b[0])
    buckets[bucketOf(w, E_BUCKETS)][w] = list.slice(0, 40).map((x) => x.slice(1))
  }
  mkdirSync(join(OUT, 'e'), { recursive: true })
  let bytes = 0
  buckets.forEach((b, i) => {
    const json = JSON.stringify(b)
    bytes += json.length
    writeFileSync(join(OUT, 'e', `${i}.json`), json)
  })
  console.log(`  english shards: ${E_BUCKETS} files, ${(bytes / 1e6).toFixed(1)} MB`)
}

// ---------------------------------------------------------------------------
// KANJIDIC2

async function buildKanjidic(file) {
  const kanji = []
  let ch, text = '', rType = null, mLang = null, inMisc = false, cpType = null, radType = null
  await parseXml(file, true, {
    entities: {},
    onOpen(name, attrs) {
      text = ''
      if (name === 'character') ch = { c: '', m: [], on: [], kun: [], nanori: [], s: 0, g: 0, j: 0, f: 0, rad: 0 }
      else if (name === 'reading') rType = attrs.r_type
      else if (name === 'meaning') mLang = attrs.m_lang || 'en'
      else if (name === 'misc') inMisc = true
      else if (name === 'rad_value') radType = attrs.rad_type
      else if (name === 'cp_value') cpType = attrs.cp_type
    },
    onText(t) { text += t },
    onClose(name) {
      const t = text.trim()
      if (!ch) return
      switch (name) {
        case 'literal': ch.c = t; break
        case 'grade': if (inMisc) ch.g = parseInt(t, 10); break
        case 'stroke_count': if (!ch.s) ch.s = parseInt(t, 10); break
        case 'freq': ch.f = parseInt(t, 10); break
        case 'jlpt': ch.j = parseInt(t, 10); break
        case 'rad_value': if (radType === 'classical') ch.rad = parseInt(t, 10); break
        case 'misc': inMisc = false; break
        case 'reading':
          if (rType === 'ja_on') ch.on.push(t)
          else if (rType === 'ja_kun') ch.kun.push(t)
          break
        case 'meaning': if (mLang === 'en') ch.m.push(t); break
        case 'nanori': ch.nanori.push(t); break
        case 'character': {
          const x = { c: ch.c, m: ch.m, on: ch.on, kun: ch.kun, s: ch.s }
          if (ch.g) x.g = ch.g
          if (ch.j) x.j = ch.j
          if (ch.f) x.f = ch.f
          if (ch.rad) x.rad = ch.rad
          if (ch.nanori.length) x.n = ch.nanori.slice(0, 6)
          kanji.push(x)
          ch = null
          break
        }
      }
      text = ''
    },
  })
  const buckets = Array.from({ length: K_BUCKETS }, () => ({}))
  for (const k of kanji) buckets[k.c.codePointAt(0) % K_BUCKETS][k.c] = k
  mkdirSync(join(OUT, 'k'), { recursive: true })
  let bytes = 0
  buckets.forEach((b, i) => {
    const json = JSON.stringify(b)
    bytes += json.length
    writeFileSync(join(OUT, 'k', `${i}.json`), json)
  })
  console.log(`  kanji shards: ${K_BUCKETS} files, ${kanji.length} kanji, ${(bytes / 1e6).toFixed(1)} MB`)
  return kanji.length
}

// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(CACHE, { recursive: true })
  const files = {}
  for (const name of Object.keys(SOURCES)) files[name] = await download(name)

  if (existsSync(OUT)) rmSync(OUT, { recursive: true })
  mkdirSync(OUT, { recursive: true })

  console.log('loading pitch accents and JLPT lists…')
  const accents = loadAccents(files.accents)
  const jlpt = loadJlpt([[5, files.n5], [4, files.n4], [3, files.n3], [2, files.n2], [1, files.n1]])

  console.log('parsing JMdict…')
  const { entries, descriptions } = await buildJmdict(files.jmdict, accents, jlpt)
  console.log(`  ${entries.length} entries, ${entries.filter((e) => e.r.some((r) => r.a)).length} with pitch accent, ${entries.filter((e) => e.j).length} with JLPT level`)
  writeJapaneseShards(entries)
  writeEnglishShards(entries)

  console.log('parsing KANJIDIC2…')
  const kanjiCount = await buildKanjidic(files.kanjidic)

  writeFileSync(join(OUT, 'tags.json'), JSON.stringify(descriptions))
  // Version changes only when the sources or this script change, so offline
  // caches of the shards survive redeploys of the site.
  const hash = createHash('sha1')
  for (const f of Object.values(files)) hash.update(readFileSync(f))
  hash.update(readFileSync(fileURLToPath(import.meta.url)))
  hash.update(readFileSync(join(ROOT, 'src', 'lib', 'dictKeys.js')))
  writeFileSync(
    join(OUT, 'meta.json'),
    JSON.stringify({
      version: hash.digest('hex').slice(0, 10),
      built: new Date().toISOString(),
      entries: entries.length,
      kanji: kanjiCount,
      buckets: { j: J_BUCKETS, e: E_BUCKETS, k: K_BUCKETS },
    }),
  )
  console.log('done →', OUT)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
