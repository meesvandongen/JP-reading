import { useEffect, useState } from 'preact/hooks'
import type { StoryDoc } from '../lib/types'
import { hasJapanese } from '../lib/kana'
import { textStats } from '../lib/stats'
import { analyzeText, tokenizerProgress } from '../services/analyzer'
import { customTexts, deleteText, getText, saveText } from '../state/db'
import { navigate, route } from '../router'
import { Icon } from '../components/Icon'

const SAMPLE = `吾輩は猫である。名前はまだ無い。
どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。`

/** Pending text handed over by the share target / file handler (see main.tsx). */
export const pendingImport: { title?: string; text?: string } = {}

export function ImportPage() {
  const editId = route.value.query.get('edit')
  const [title, setTitle] = useState(pendingImport.title ?? '')
  const [text, setText] = useState(pendingImport.text ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    pendingImport.title = undefined
    pendingImport.text = undefined
    if (editId) {
      getText(editId).then((t) => {
        if (!t) return
        setTitle(t.meta.title)
        setText(t.text)
      })
    }
  }, [editId])

  const onFile = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const content = await file.text()
    setText(content.replace(/^---[\s\S]*?---\s*/, ''))
    if (!title) setTitle(file.name.replace(/\.(txt|md)$/i, ''))
  }

  const submit = async () => {
    setError(null)
    if (!hasJapanese(text)) {
      setError('That does not look like Japanese text.')
      return
    }
    setBusy(true)
    try {
      const chapters = await analyzeText(text)
      const first = text.trim().split('\n')[0]
      const firstLine = (first.split(/(?<=[。！？!?])/)[0] ?? first).slice(0, 24)
      const id = editId ?? `my-${Date.now().toString(36)}`
      const doc: StoryDoc & { text: string } = {
        meta: {
          id,
          title: title.trim() || firstLine,
          level: 'custom',
          category: 'misc',
          added: new Date().toISOString(),
          ...textStats(chapters),
        },
        keywords: [],
        chapters,
        text,
      }
      await saveText(doc)
      navigate(`/read/${id}`, { replace: true })
    } catch (err) {
      setError(
        navigator.onLine
          ? `Could not analyze the text: ${(err as Error).message}`
          : 'The tokenizer has not been downloaded yet and you are offline. Connect once to enable reading your own texts offline.',
      )
    } finally {
      setBusy(false)
    }
  }

  const prog = tokenizerProgress.value
  return (
    <div class="page import">
      <header class="topbar">
        <button class="icon-btn" onClick={() => navigate('/')} aria-label="Back">
          <Icon name="back" />
        </button>
        <div class="topbar-title">{editId ? 'Edit text' : 'Read your own text'}</div>
      </header>
      <p class="muted">
        Paste any Japanese text. It is split into sentences and words on your device, with furigana, dictionary look-up, grammar breakdowns and
        audio — the same as the library stories. Your texts stay in this browser.
      </p>
      <label class="field">
        <span>Title</span>
        <input type="text" value={title} placeholder="(optional)" onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
      </label>
      <label class="field">
        <span>Japanese text</span>
        <textarea lang="ja" rows={12} value={text} placeholder={SAMPLE} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      </label>
      <div class="row-inline wrap">
        <button class="btn primary" disabled={busy || !text.trim()} onClick={submit}>
          {busy ? 'Analyzing…' : 'Read it'}
        </button>
        <label class="btn ghost">
          <Icon name="upload" size={18} /> Open .txt file
          <input type="file" accept=".txt,.md,text/plain" hidden onChange={onFile} />
        </label>
        {!text && (
          <button class="btn ghost" onClick={() => setText(SAMPLE)}>
            Try a sample
          </button>
        )}
      </div>
      {busy && prog && prog.loaded < prog.total && (
        <div class="notice">
          Downloading the Japanese tokenizer (about 12 MB, only once)… {Math.round((prog.loaded / prog.total) * 100)}%
          <div class="bar">
            <span style={{ width: `${(prog.loaded / prog.total) * 100}%` }} />
          </div>
        </div>
      )}
      {error && <div class="notice error">{error}</div>}

      {customTexts.value.length > 0 && (
        <section>
          <h2 class="section-title">My texts</h2>
          <ul class="text-list">
            {customTexts.value.map((t) => (
              <li>
                <button class="link grow" onClick={() => navigate(`/read/${t.id}`)} lang="ja">
                  {t.title}
                </button>
                <span class="muted small">{t.chars.toLocaleString()} 字</span>
                <button class="icon-btn" aria-label="Edit" onClick={() => navigate(`/import?edit=${t.id}`)}>
                  <Icon name="edit" size={18} />
                </button>
                <button
                  class="icon-btn"
                  aria-label="Delete"
                  onClick={() => {
                    if (confirm(`Delete “${t.title}”?`)) deleteText(t.id)
                  }}
                >
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p class="muted small">
        Tip: install the app and use your phone's <b>Share</b> menu to send Japanese text from any app straight here.
      </p>
    </div>
  )
}
