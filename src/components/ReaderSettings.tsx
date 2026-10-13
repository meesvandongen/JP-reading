import { settings, updateSettings, FONTS, type FontFamily, type Settings } from '../state/settings'
import { voices, speak } from '../services/tts'
import { Sheet } from './Sheet'

function Seg<K extends keyof Settings>({
  k,
  options,
}: {
  k: K
  options: [Settings[K], string][]
}) {
  const v = settings.value[k]
  return (
    <div class="seg-control" role="radiogroup">
      {options.map(([val, label]) => (
        <button role="radio" aria-checked={v === val} class={v === val ? 'on' : ''} onClick={() => updateSettings({ [k]: val } as Partial<Settings>)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ k, label, hint }: { k: keyof Settings; label: string; hint?: string }) {
  return (
    <label class="toggle row">
      <span>
        {label}
        {hint && <span class="muted small block">{hint}</span>}
      </span>
      <input type="checkbox" checked={!!settings.value[k]} onChange={(e) => updateSettings({ [k]: (e.target as HTMLInputElement).checked } as Partial<Settings>)} />
    </label>
  )
}

export function ReadingOptions() {
  const s = settings.value
  return (
    <div class="settings-list">
      <div class="setting">
        <div class="setting-label">Reading aid over kanji</div>
        <Seg k="kanjiAid" options={[['furigana', 'Furigana'], ['romaji', 'Romaji'], ['none', 'Off']]} />
      </div>
      <div class="setting">
        <div class="setting-label">Reading aid over kana</div>
        <Seg k="kanaAid" options={[['romaji', 'Romaji'], ['none', 'Off']]} />
      </div>
      <div class="setting">
        <div class="setting-label">Show reading aids for</div>
        <Seg k="aidScope" options={[['all', 'All words'], ['unknown', 'Unknown words'], ['jlpt', 'By JLPT level']]} />
        {s.aidScope === 'unknown' && <p class="muted small">Hidden for words you marked as known and flashcards you have learned well.</p>}
        {s.aidScope === 'jlpt' && (
          <div class="row-inline">
            <span class="small">Hide for words at</span>
            <select value={String(s.aidJlpt)} onChange={(e) => updateSettings({ aidJlpt: Number((e.target as HTMLSelectElement).value) })}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option value={String(n)}>N{n}</option>
              ))}
            </select>
            <span class="small">and easier</span>
          </div>
        )}
      </div>
      <div class="setting">
        <div class="setting-label">Translations</div>
        <Seg k="translation" options={[['off', 'Off'], ['sentence', 'Per sentence'], ['paragraph', 'Per paragraph']]} />
        {s.translation === 'sentence' && <p class="muted small">Tap a blurred translation to reveal it.</p>}
      </div>
      <Toggle k="pitchAccent" label="Pitch accent colors" hint="Heiban · Atamadaka · Nakadaka · Odaka" />
      {s.pitchAccent && (
        <div class="legend small">
          <span class="pa-heiban">■ flat</span> <span class="pa-atamadaka">■ head-high</span> <span class="pa-nakadaka">■ middle-high</span>{' '}
          <span class="pa-odaka">■ tail-high</span>
        </div>
      )}
      <Toggle k="jlptHighlight" label="Highlight JLPT vocabulary" />
      {s.jlptHighlight && (
        <div class="legend small">
          <span class="jl-5">N5</span> <span class="jl-4">N4</span> <span class="jl-3">N3</span> <span class="jl-2">N2</span> <span class="jl-1">N1</span>
        </div>
      )}
      <Toggle k="highlightSaved" label="Underline saved words" />

      <div class="setting">
        <div class="setting-label">Font</div>
        <div class="font-options">
          {(Object.keys(FONTS) as FontFamily[]).map((f) => (
            <button class={`font-opt ${s.fontFamily === f ? 'on' : ''}`} style={{ fontFamily: FONTS[f].css }} onClick={() => updateSettings({ fontFamily: f })}>
              <span lang="ja">読む</span>
              <span class="small">{FONTS[f].label}</span>
            </button>
          ))}
        </div>
      </div>
      <div class="setting">
        <div class="setting-label">
          Text size <span class="muted">{s.fontSize}px</span>
        </div>
        <input type="range" min="14" max="40" step="1" value={s.fontSize} onInput={(e) => updateSettings({ fontSize: Number((e.target as HTMLInputElement).value) })} />
      </div>
      <div class="setting">
        <div class="setting-label">
          Line spacing <span class="muted">{s.lineHeight.toFixed(1)}</span>
        </div>
        <input type="range" min="1.5" max="3" step="0.1" value={s.lineHeight} onInput={(e) => updateSettings({ lineHeight: Number((e.target as HTMLInputElement).value) })} />
      </div>
      <Toggle k="vertical" label="Vertical text (縦書き)" />
      <div class="setting">
        <div class="setting-label">Theme</div>
        <Seg k="theme" options={[['system', 'Auto'], ['light', 'Light'], ['sepia', 'Sepia'], ['dark', 'Dark']]} />
      </div>
      <div class="setting">
        <div class="setting-label">Voice</div>
        {voices.value.length ? (
          <div class="row-inline">
            <select value={s.voice} onChange={(e) => updateSettings({ voice: (e.target as HTMLSelectElement).value })}>
              <option value="">Automatic</option>
              {voices.value.map((v) => (
                <option value={v.voiceURI}>
                  {v.name}
                  {v.localService ? '' : ' (online)'}
                </option>
              ))}
            </select>
            <button class="chip" onClick={() => speak('こんにちは。日本語を読みましょう。')}>
              Test
            </button>
          </div>
        ) : (
          <p class="muted small">No Japanese voice found on this device. Install a Japanese text-to-speech voice in your system settings to enable audio.</p>
        )}
      </div>
      <div class="setting">
        <div class="setting-label">
          Speech speed <span class="muted">{s.rate}×</span>
        </div>
        <input type="range" min="0.5" max="1.5" step="0.05" value={s.rate} onInput={(e) => updateSettings({ rate: Number((e.target as HTMLInputElement).value) })} />
      </div>
      <Toggle k="autoScroll" label="Follow audio while listening" />
    </div>
  )
}

export function ReaderSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Reading settings">
      <ReadingOptions />
    </Sheet>
  )
}
