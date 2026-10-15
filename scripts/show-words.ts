// Prints how a Japanese line is tokenized: surface, reading, lemma, part of speech.
//   npx tsx scripts/show-words.ts "雲間から洩《も》れた月の光が波の上を照していました。"
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as kuromoji from '@patdx/kuromoji'
import NodeDictionaryLoader from '@patdx/kuromoji/node'
import { analyzeSentence, isKatakanaScript, type Tokenizer } from '../src/lib/analyze'
import type { KToken } from '../src/lib/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const tk = await new kuromoji.TokenizerBuilder({
  loader: new NodeDictionaryLoader({ dic_path: join(ROOT, 'node_modules', '@patdx', 'kuromoji', 'dict') } as never),
}).build()
const tokenizer: Tokenizer = { tokenize: (t) => tk.tokenize(t) as unknown as KToken[] }
const lines = process.argv.slice(2)
const opts = { katakanaScript: isKatakanaScript(lines.join('\n')) }
for (const line of lines) {
  console.log(line)
  console.log('  ' + analyzeSentence(tokenizer, line, opts).map((w) => `${w.s}${w.r && w.r !== w.s ? `[${w.r}]` : ''}${w.b && w.b !== w.s ? `<${w.b}>` : ''}/${w.p}`).join(' '))
}
