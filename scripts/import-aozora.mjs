#!/usr/bin/env node
// Import a public-domain text from Aozora Bunko (https://www.aozora.gr.jp/)
// into content/stories/<level>/<slug>.md in the format described in
// content/README.md.
//
// Usage:
//   node scripts/import-aozora.mjs <card URL | zip URL | local .zip/.txt> \
//     --level master --category literature --slug kumo-no-ito \
//     [--title-en "The Spider's Thread"] [--summary "..."] [--tags a,b] \
//     [--author-en "Akutagawa Ryūnosuke"] [--author 芥川龍之介] [--title ...] \
//     [--year 1918] [--source URL] [--chapters 1-3] [--stdout] [--force] \
//     [--ruby "犍陀多=かんだた,杜子春=とししゅん"]
//
// --ruby adds Aozora-style ruby to every occurrence of the given names that
// does not already have it (Aozora texts usually annotate only the first one).
// --chapters keeps only the listed ## sections (1-based), e.g. "1-3" or "1,3".
// --stdout prints the result instead of writing the file.
//
// A card URL looks like https://www.aozora.gr.jp/cards/000879/card92.html.
// The script finds the ruby zip on the card page, decodes the Shift_JIS text,
// strips the Aozora header and footer, converts the annotations and writes the
// story with one sentence per line. No npm dependencies.

import { inflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORIES = join(ROOT, 'content', 'stories');

const LEVELS = ['beginner-1', 'beginner-2', 'beginner-3', 'elementary', 'intermediate', 'advanced', 'master'];
const CATEGORIES = ['daily-life', 'food', 'travel', 'culture', 'folktale', 'history', 'nature', 'school', 'work',
  'society', 'science', 'humor', 'literature', 'news-style', 'conversation'];

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (key === 'stdout' || key === 'force' || key === 'help') opts[key] = true;
      else {
        if (i + 1 >= argv.length) die(`missing value for --${key}`);
        opts[key] = argv[++i];
      }
    } else opts._.push(a);
  }
  return opts;
}

function die(msg) {
  console.error(`import-aozora: ${msg}`);
  process.exit(1);
}

function warn(msg) {
  console.error(`import-aozora: warning: ${msg}`);
}

// ---------------------------------------------------------------- network

async function fetchBuffer(url) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'jp-reading-import/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  // Fall back to curl (it honours proxy settings that fetch may not).
  try {
    return execFileSync('curl', ['-sSfL', '--retry', '3', url], { maxBuffer: 64 << 20 });
  } catch {
    throw lastErr;
  }
}

// ---------------------------------------------------------------- zip

// Minimal zip reader: returns [{ name, data }] for every file entry.
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file (no end of central directory)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('latin1');
    p += 46 + nameLen + extraLen + commentLen;
    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('bad local file header');
    const start = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const raw = buf.subarray(start, start + compSize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`unsupported zip compression method ${method} for ${name}`);
    entries.push({ name, data });
  }
  return entries;
}

// ---------------------------------------------------------------- card page

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function cardField(html, label) {
  const re = new RegExp(`<td class="header">${label}：?</td>\\s*<td>([\\s\\S]*?)</td>`);
  const m = html.match(re);
  return m ? stripTags(m[1]) : '';
}

function parseCard(html, cardUrl) {
  const links = [...html.matchAll(/href="([^"]+\.zip)"/gi)].map((m) => new URL(m[1], cardUrl).href);
  const zip = links.find((l) => /_ruby_/.test(l)) || links[0];
  const firstPub = cardField(html, '初出');
  const yearMatch = firstPub.match(/(1[6-9]\d\d|20\d\d)/);
  return {
    zip,
    title: cardField(html, '作品名'),
    author: cardField(html, '作家名').replace(/\s+/g, ''),
    authorRomaji: cardField(html, 'ローマ字表記'),
    year: yearMatch ? Number(yearMatch[1]) : undefined,
  };
}

// ---------------------------------------------------------------- gaiji

const jisCache = new Map();
let iconvMissing = false;

// Convert a JIS X 0213 men-ku-ten code to Unicode using the system iconv.
function jisx0213ToUnicode(plane, row, cell) {
  const key = `${plane}-${row}-${cell}`;
  if (jisCache.has(key)) return jisCache.get(key);
  let out = null;
  if (!iconvMissing && row >= 1 && row <= 94 && cell >= 1 && cell <= 94) {
    const bytes = plane === 1 ? [0xa0 + row, 0xa0 + cell] : [0x8f, 0xa0 + row, 0xa0 + cell];
    try {
      const s = execFileSync('iconv', ['-f', 'EUC-JISX0213', '-t', 'UTF-8'], {
        input: Buffer.from(bytes), stdio: ['pipe', 'pipe', 'ignore'],
      }).toString('utf8');
      if (s && !s.includes('�')) out = s;
    } catch (err) {
      if (err.code === 'ENOENT') {
        iconvMissing = true;
        warn('iconv not found; JIS X 0213 gaiji cannot be converted and will be dropped');
      }
    }
  }
  jisCache.set(key, out);
  return out;
}

function resolveGaiji(note) {
  const u = note.match(/U\+([0-9A-Fa-f]{4,6})/);
  if (u) return String.fromCodePoint(parseInt(u[1], 16));
  const j = note.match(/(?:水準|、)\s*([12])-(\d{1,2})-(\d{1,2})/);
  if (j) return jisx0213ToUnicode(Number(j[1]), Number(j[2]), Number(j[3]));
  return null;
}

// ---------------------------------------------------------------- text conversion

const OPEN = '「『（〔【〈《(［';
const CLOSE = '」』）〕】〉》)］';
const TERMINATORS = '。！？!?';

function bracketDepth(s) {
  let d = 0;
  for (const ch of s) {
    if (OPEN.includes(ch)) d++;
    else if (CLOSE.includes(ch)) d = Math.max(0, d - 1);
  }
  return d;
}

// Split a paragraph line into sentences: after 。！？ outside brackets.
function splitSentences(line) {
  const chars = [...line];
  // Openers that are never closed (a typo in the source) must not swallow
  // the rest of the paragraph: find them first and treat them as plain text.
  const stack = [];
  for (let i = 0; i < chars.length; i++) {
    if (OPEN.includes(chars[i])) stack.push(i);
    else if (CLOSE.includes(chars[i])) stack.pop();
  }
  const unmatched = new Set(stack);
  if (unmatched.size) warn(`unclosed bracket in: ${line.slice(0, 40)}…`);

  const out = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    cur += ch;
    if (unmatched.has(i)) continue;
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && TERMINATORS.includes(ch)) {
      // Also swallow repeated terminators and stray (unbalanced) closers.
      while (i + 1 < chars.length && (TERMINATORS + CLOSE).includes(chars[i + 1])) cur += chars[++i];
      if (QUOTATIVE.test(chars.slice(i + 1).join('').trimStart())) continue;
      out.push(cur);
      cur = '';
    }
  }
  out.push(cur);
  return out.map((s) => s.replace(/^\s+|\s+$/g, '')).filter(Boolean);
}

// Does `text` (the next source line) continue the sentence ended by `prev`?
function continuesSentence(prev, text) {
  if (/[、，]$/.test(prev)) return true;
  if (/^[「『]/.test(text) && !/[。．！？!?」』）)…―]$/.test(prev)) return true;
  if (/[」』]$/.test(prev) && /^(と(?!ころ|うとう|にかく|ても|もかく|たん)|って)/.test(text)) return true;
  if (QUOTATIVE.test(text)) return true;
  return false;
}

// A line/sentence can't begin with quotative と + verb (…。と答えた。): it ends
// a quote, e.g. after ――-style dialogue that has no closing bracket.
// Sentence-initial conjunctions such as と申しますのは / と思うと are excluded.
const QUOTATIVE = /^(と|って)(?!(申|云|言|い)[しいうっえ]?(ます|まし)?(のは|のも|と|ても|えば|訳|わけ)|申すのは|思(う|った)(と|ら|間)|思えば)(答|云|言|い[っうわいえ]|申|叫|聞|訊|問|思|呟|つぶや|囁|ささや|笑|怒鳴|どな|尋|たずね|仰|おっしゃ|歌|唱|書|呼|喚|わめ|独)/;

function cleanNotes(s) {
  return s.replace(/［＃[^］]*］/g, '');
}

function convert(text) {
  let lines = text.replace(/\r\n?/g, '\n').split('\n');

  // --- header: title / author lines, then the ----- explanation block.
  const dashIdx = [];
  for (let i = 0; i < Math.min(lines.length, 60); i++) if (/^-{20,}\s*$/.test(lines[i])) dashIdx.push(i);
  let headerEnd;
  let bodyStart;
  if (dashIdx.length >= 2) {
    headerEnd = dashIdx[0];
    bodyStart = dashIdx[1] + 1;
  } else {
    headerEnd = lines.findIndex((l) => l.trim() === '');
    if (headerEnd < 0) headerEnd = 0;
    bodyStart = headerEnd;
  }
  const header = lines.slice(0, headerEnd).map((l) => l.trim()).filter(Boolean);
  const title = (header[0] || '').replace(/^〔(.*)〕$/, '$1');
  let authorLine = header.length > 1 ? header[header.length - 1] : '';
  if (/訳$/.test(authorLine) && header.length > 2) authorLine = header[header.length - 2];

  // --- footer: 底本： onward.
  let end = lines.length;
  for (let i = lines.length - 1; i >= bodyStart; i--) {
    if (/^底本[：:]/.test(lines[i])) { end = i; break; }
  }
  lines = lines.slice(bodyStart, end);

  // --- gaiji and odoriji (くの字点).
  const unresolved = [];
  lines = lines.map((l) => l
    .replace(/※［＃([^］]*)］/g, (_, note) => {
      const ch = resolveGaiji(note);
      if (ch) return ch;
      unresolved.push(note);
      return '';
    })
    .replace(/／″＼/g, '〴〵')
    .replace(/／＼/g, '〳〵'));
  for (const n of unresolved) warn(`dropped unresolvable gaiji ［＃${n}］`);

  // --- walk lines, build blocks: { type: 'heading', text } | { type: 'para', lines: [] }
  const blocks = [];
  let para = null;
  let inBlock = false; // inside ［＃ここから…］ … ［＃ここで…終わり］
  let headingBuf = null; // multi-line heading
  let lastWasDialogue = false;
  const breakPara = () => { para = null; lastWasDialogue = false; };
  const pushLine = (l, newPara) => {
    if (!para || newPara) {
      para = { type: 'para', lines: [] };
      blocks.push(para);
    }
    para.lines.push(l);
  };

  for (const raw of lines) {
    // Multi-line heading: ［＃ここから中見出し］ … ［＃ここで中見出し終わり］
    if (/［＃ここから[大中小]?見出し］/.test(raw)) { headingBuf = []; continue; }
    if (headingBuf) {
      if (/［＃ここで[大中小]?見出し終わり］/.test(raw)) {
        blocks.push({ type: 'heading', text: headingBuf.join('　') });
        headingBuf = null;
        breakPara();
      } else {
        const t = cleanNotes(raw).trim().replace(/^　+|　+$/g, '');
        if (t) headingBuf.push(t);
      }
      continue;
    }

    const isHeading = /［＃「[^］]*」は[大中小]?見出し］/.test(raw) || /［＃[大中小]見出し］/.test(raw);
    if (isHeading) {
      let t = cleanNotes(raw).replace(/^[\s　]+|[\s　]+$/g, '');
      if (!t) t = (raw.match(/［＃「([^］]*)」は[大中小]?見出し］/) || [])[1] || '';
      if (t) blocks.push({ type: 'heading', text: t });
      breakPara();
      continue;
    }

    const opensBlock = /［＃ここから[^］]*］/.test(raw);
    const closesBlock = /［＃ここで[^］]*終わり］/.test(raw);
    const pageBreak = /［＃改(ページ|丁|段|見開き)］/.test(raw);
    const line = cleanNotes(raw);
    if (opensBlock) inBlock = true;
    if (closesBlock && !line.trim()) { inBlock = false; continue; }

    if (!line.trim()) {
      if (raw.trim() === '' || pageBreak) breakPara();
      if (closesBlock) inBlock = false;
      continue;
    }
    // Scene-break markers such as ＊　＊　＊
    if (/^[\s　＊*※・◇◆○●□■]+$/.test(line)) { breakPara(); continue; }

    // Each indented line (　…) is a paragraph. Unindented dialogue lines
    // (「…」) are grouped: a run of consecutive dialogue lines forms one
    // paragraph. Other unindented lines (verse, text after a block) continue
    // the current paragraph.
    const isDialogue = /^[「『（〈【〔(]/.test(line);
    const startsPara = /^\s/.test(line) || (isDialogue && !lastWasDialogue);
    const text = line.replace(/^\s+/, '').replace(/\s+$/, '');

    const prev = para && para.lines.length ? para.lines[para.lines.length - 1] : null;
    if (inBlock && prev !== null && bracketDepth(prev) > 0) {
      // Inside an indented block (song, sign, letter) a quote that spans
      // several lines is kept on one line. An indented continuation is a
      // wrapped line; otherwise it is a verse line, joined with a space.
      const sep = /^\s/.test(line) || /[、。，．！？!?―…]$/.test(prev) ? '' : '　';
      para.lines[para.lines.length - 1] = prev + sep + text;
    } else if (prev !== null && continuesSentence(prev, text)) {
      // Aozora breaks the line before and after dialogue even mid-sentence
      // (…言いながら、／「…」／と言いました。). Rejoin such sentences.
      para.lines[para.lines.length - 1] = prev + text;
    } else if (inBlock) {
      pushLine(text, false);
    } else {
      pushLine(text, startsPara);
    }
    lastWasDialogue = isDialogue && !inBlock;
    if (closesBlock) inBlock = false;
  }

  // --- serialize
  const out = [];
  for (const b of blocks) {
    if (b.type === 'heading') {
      out.push('', `## ${b.text}`, '');
    } else {
      const sentences = b.lines.flatMap(splitSentences);
      if (!sentences.length) continue;
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(...sentences);
      out.push('');
    }
  }
  const body = out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  return { title, author: authorLine.replace(/\s+/g, ''), body };
}

// Keep only the chapters (## sections) whose 1-based indexes are listed.
function selectChapters(body, spec) {
  const want = new Set();
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let i = a; i <= (b || a); i++) want.add(i);
  }
  const sections = body.split(/^(?=## )/m);
  const pre = sections[0].startsWith('## ') ? '' : sections.shift();
  const kept = sections.filter((_, i) => want.has(i + 1));
  return (pre + kept.join('')).trim() + '\n';
}

// Add ruby to every occurrence of a word that does not already carry it.
// spec: "犍陀多=かんだた,杜子春=とししゅん"
function addRuby(body, spec) {
  const pairs = spec.split(',').map((p) => p.split('=').map((x) => x.trim())).filter(([b, r]) => b && r);
  pairs.sort((a, b) => b[0].length - a[0].length);
  const isKanji = (ch) => /[\p{Script=Han}々〆ヶ]/u.test(ch || '');
  return body.split('\n').map((line) => {
    if (line.startsWith('## ')) return line;
    for (const [base, reading] of pairs) {
      let out = '';
      let i = 0;
      while (true) {
        const j = line.indexOf(base, i);
        if (j < 0) { out += line.slice(i); break; }
        const after = line[j + base.length];
        const before = line[j - 1];
        out += line.slice(i, j);
        // Skip if already annotated, or inside a longer ruby base / reading.
        const inReading = line.lastIndexOf('《', j) > line.lastIndexOf('》', j);
        if (after === '《' || before === '｜' || inReading) {
          out += base;
        } else {
          // ｜ marks where the ruby base starts; needed after another kanji
          // or when the base itself is not all kanji (｜池の尾《いけのお》).
          const bar = isKanji(before) || ![...base].every(isKanji) ? '｜' : '';
          out += `${bar}${base}《${reading}》`;
        }
        i = j + base.length;
      }
      line = out;
    }
    return line;
  }).join('\n');
}

// ---------------------------------------------------------------- YAML

function yamlStr(s) {
  s = String(s);
  if (s === '' || /[:#\[\]{}&*!|>'"%@`,?]|^[\s-]|\s$|^(true|false|null|yes|no|~|[\d.]+)$/i.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

function frontMatter(meta) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) lines.push(`${k}: [${v.map(yamlStr).join(', ')}]`);
    else if (typeof v === 'number') lines.push(`${k}: ${v}`);
    else lines.push(`${k}: ${yamlStr(v)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

// ---------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const input = opts._[0];
  if (opts.help || !input) {
    console.log('Usage: node scripts/import-aozora.mjs <card URL | zip URL | file> --level <level> '
      + '--category <category> --slug <slug> [--title-en ..] [--summary ..] [--tags a,b] [--author-en ..] '
      + '[--author ..] [--title ..] [--year YYYY] [--source URL] [--chapters 1-3] [--ruby 名前=なまえ,..] [--stdout] [--force]');
    process.exit(input ? 0 : 1);
  }
  const level = opts.level || die('--level is required');
  const category = opts.category || die('--category is required');
  const slug = opts.slug || die('--slug is required');
  if (!LEVELS.includes(level)) die(`unknown level "${level}" (one of ${LEVELS.join(', ')})`);
  if (!CATEGORIES.includes(category)) die(`unknown category "${category}" (one of ${CATEGORIES.join(', ')})`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) die('slug must be lowercase ASCII words joined by dashes');

  // --- obtain the zip/txt
  let card = {};
  let zipBuf;
  let source = opts.source;
  if (/^https?:/.test(input) && /\.html?(\?|#|$)/.test(input)) {
    const html = (await fetchBuffer(input)).toString('utf8');
    card = parseCard(html, input);
    if (!card.zip) die(`no .zip link found on ${input}`);
    console.error(`import-aozora: downloading ${card.zip}`);
    zipBuf = await fetchBuffer(card.zip);
    source ??= input;
  } else if (/^https?:/.test(input)) {
    zipBuf = await fetchBuffer(input);
    source ??= input;
  } else {
    zipBuf = readFileSync(input);
  }

  let txtBuf;
  if (zipBuf.readUInt32LE(0) === 0x04034b50) {
    const entry = readZip(zipBuf).find((e) => /\.txt$/i.test(e.name));
    if (!entry) die('zip contains no .txt file');
    txtBuf = entry.data;
  } else txtBuf = zipBuf;
  const text = new TextDecoder('shift_jis').decode(txtBuf);

  // --- convert
  const conv = convert(text);
  let body = conv.body;
  if (opts.chapters) body = selectChapters(body, opts.chapters);
  if (opts.ruby) body = addRuby(body, opts.ruby);
  const leftovers = body.match(/［＃[^］]*］/g);
  if (leftovers) warn(`leftover notes: ${[...new Set(leftovers)].join(' ')}`);

  const authorJa = opts.author || conv.author || card.author || '';
  let authorEn = opts['author-en'];
  if (!authorEn && card.authorRomaji) authorEn = card.authorRomaji.replace(/,\s*/, ' ');
  const meta = {
    title: opts.title || conv.title || card.title,
    title_en: opts['title-en'],
    level,
    category,
    tags: opts.tags ? opts.tags.split(',').map((t) => t.trim()).filter(Boolean) : ['aozora', 'classic'],
    summary: opts.summary,
    author: authorEn ? `${authorJa} (${authorEn})` : authorJa,
    year: opts.year ? Number(opts.year) : card.year,
    source,
    license: 'Public domain (Aozora Bunko)',
  };
  const doc = `${frontMatter(meta)}\n\n${body}`;

  if (opts.stdout) {
    process.stdout.write(doc);
    return;
  }

  // --- write, refusing to clobber other stories
  const target = join(STORIES, level, `${slug}.md`);
  if (existsSync(STORIES)) {
    for (const lv of readdirSync(STORIES)) {
      const other = join(STORIES, lv, `${slug}.md`);
      if (other !== target && existsSync(other)) die(`slug "${slug}" already used by ${other}`);
    }
  }
  if (existsSync(target) && !opts.force) {
    const existing = readFileSync(target, 'utf8');
    if (!source || !existing.includes(`source: ${yamlStr(source)}`)) {
      die(`${target} exists and was not imported from this source (use --force to overwrite)`);
    }
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, doc);
  const chars = body.replace(/《[^》]*》|｜|\s|^## .*$/gm, '').length;
  console.error(`import-aozora: wrote ${target} (${chars} characters of text)`);
}

main().catch((err) => die(err.stack || String(err)));
