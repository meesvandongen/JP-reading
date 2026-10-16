import { effect, signal } from '@preact/signals'

export type Theme = 'system' | 'light' | 'dark' | 'sepia'
export type KanjiAid = 'furigana' | 'romaji' | 'none'
export type KanaAid = 'romaji' | 'none'
export type AidScope = 'all' | 'unknown' | 'jlpt'
export type TranslationMode = 'off' | 'sentence' | 'paragraph'
export type FontFamily = 'sans' | 'serif' | 'rounded' | 'handwriting' | 'system'
export type ReviewMode = 'recognition' | 'listening' | 'production'

export interface Settings {
  theme: Theme
  /** reading aid shown over kanji */
  kanjiAid: KanjiAid
  /** reading aid shown over kana */
  kanaAid: KanaAid
  /** which words get reading aids */
  aidScope: AidScope
  /** with aidScope = 'jlpt': hide aids for words at this JLPT level or easier (5 = N5) */
  aidJlpt: number
  translation: TranslationMode
  pitchAccent: boolean
  jlptHighlight: boolean
  highlightSaved: boolean
  fontFamily: FontFamily
  fontSize: number
  lineHeight: number
  vertical: boolean
  /** TTS */
  voice: string
  rate: number
  autoScroll: boolean
  /** flashcards */
  newPerDay: number
  reviewMode: ReviewMode
  reviewShowSentence: boolean
  autoplayCardAudio: boolean
  /** goals */
  weeklyGoal: number
  goalUnit: 'stories' | 'minutes'
  /** reminders */
  reminderEnabled: boolean
  reminderTime: string
  /** chosen during onboarding */
  level: string
  onboarded: boolean
  /** library filters, remembered across visits ('all' = no filter) */
  libraryLevel: string
  libraryCategory: string
  libraryFilter: string
}

const DEFAULTS: Settings = {
  theme: 'system',
  kanjiAid: 'furigana',
  kanaAid: 'none',
  aidScope: 'all',
  aidJlpt: 5,
  translation: 'off',
  pitchAccent: false,
  jlptHighlight: false,
  highlightSaved: true,
  fontFamily: 'sans',
  fontSize: 22,
  lineHeight: 2.1,
  vertical: false,
  voice: '',
  rate: 1,
  autoScroll: true,
  newPerDay: 15,
  reviewMode: 'recognition',
  reviewShowSentence: true,
  autoplayCardAudio: false,
  weeklyGoal: 3,
  goalUnit: 'stories',
  reminderEnabled: false,
  reminderTime: '20:00',
  level: 'beginner-1',
  onboarded: false,
  libraryLevel: 'all',
  libraryCategory: 'all',
  libraryFilter: 'all',
}

const KEY = 'jp-reading:settings'

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS }
}

export const settings = signal<Settings>(load())

export function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch }
}

export function resetSettings() {
  settings.value = { ...DEFAULTS, onboarded: true }
}

effect(() => {
  const s = settings.value
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
})

// Theme → <html data-theme>
const media = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null
function applyTheme() {
  const t = settings.value.theme
  const resolved = t === 'system' ? (media?.matches ? 'dark' : 'light') : t
  document.documentElement.dataset.theme = resolved
  const meta = document.querySelectorAll('meta[name="theme-color"]')
  const color = resolved === 'dark' ? '#1b1a19' : resolved === 'sepia' ? '#f3e9d7' : '#c0392b'
  meta.forEach((m) => m.setAttribute('content', color))
}
effect(applyTheme)
media?.addEventListener('change', applyTheme)

export const FONTS: Record<FontFamily, { label: string; css: string; google?: string }> = {
  sans: { label: 'Gothic', css: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif", google: 'Noto+Sans+JP:wght@400;700' },
  serif: { label: 'Mincho', css: "'Noto Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', serif", google: 'Noto+Serif+JP:wght@400;700' },
  rounded: { label: 'Rounded', css: "'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', sans-serif", google: 'Zen+Maru+Gothic:wght@400;700' },
  handwriting: { label: 'Textbook', css: "'Klee One', 'UD Digi Kyokasho N', cursive", google: 'Klee+One:wght@400;600' },
  system: { label: 'System', css: "system-ui, -apple-system, 'Hiragino Sans', 'Yu Gothic UI', sans-serif" },
}

const loadedFonts = new Set<string>()
export function ensureFont(f: FontFamily) {
  const g = FONTS[f].google
  if (!g || loadedFonts.has(g)) return
  loadedFonts.add(g)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${g}&display=swap`
  document.head.appendChild(link)
}
effect(() => ensureFont(settings.value.fontFamily))
