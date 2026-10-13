/// <reference lib="webworker" />
// Tokenizes and analyzes arbitrary Japanese text off the main thread.

import * as kuromoji from '@patdx/kuromoji'
import { analyzeChapters, allWords, type Tokenizer } from '../lib/analyze'
import { parsePlainText } from '../lib/text'
import { Dictionary } from '../lib/dict'
import type { KToken } from '../lib/types'

declare const self: DedicatedWorkerGlobalScope

let base = ''
let tokenizerP: Promise<Tokenizer> | null = null
let loaded = 0

async function fetchDictFile(name: string): Promise<ArrayBuffer> {
  const res = await fetch(`${base}kuromoji/${name}`)
  if (!res.ok) throw new Error(`Failed to load tokenizer dictionary (${res.status})`)
  const buf = await res.arrayBuffer()
  loaded++
  self.postMessage({ type: 'progress', loaded, total: 12 })
  const bytes = new Uint8Array(buf)
  // Some servers transparently decompress .gz files; only gunzip real gzip data.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
    return new Response(stream).arrayBuffer()
  }
  return buf
}

function getTokenizer(): Promise<Tokenizer> {
  if (!tokenizerP) {
    tokenizerP = new kuromoji.TokenizerBuilder({
      loader: { loadArrayBuffer: (url: string) => fetchDictFile(url.split('/').pop()!) },
    })
      .build()
      .then((t) => ({ tokenize: (s: string) => t.tokenize(s) as unknown as KToken[] }))
    tokenizerP.catch(() => (tokenizerP = null))
  }
  return tokenizerP
}

let dict: Dictionary | null = null
let dictVersion = ''

self.onmessage = async (ev: MessageEvent) => {
  const { id, type } = ev.data
  try {
    if (type === 'init') {
      base = ev.data.base
      dictVersion = ev.data.dictVersion ?? ''
      dict = new Dictionary(async (p) => {
        const r = await fetch(`${base}data/dict/${p}?v=${dictVersion}`)
        if (!r.ok) throw new Error('dictionary unavailable')
        return r.json()
      })
      self.postMessage({ id, ok: true })
      return
    }
    if (type === 'analyze') {
      const tokenizer = await getTokenizer()
      const chapters = analyzeChapters(tokenizer, parsePlainText(ev.data.text))
      if (dict && dictVersion) {
        try {
          await dict.annotate(allWords(chapters))
        } catch {
          /* offline without dictionary: still usable */
        }
      }
      self.postMessage({ id, ok: true, result: chapters })
      return
    }
    if (type === 'tokenize') {
      const tokenizer = await getTokenizer()
      self.postMessage({ id, ok: true, result: tokenizer.tokenize(ev.data.text) })
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: (err as Error).message })
  }
}
