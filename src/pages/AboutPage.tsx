import { back } from '../router'
import { Icon } from '../components/Icon'
import { library } from '../services/library'

export function AboutPage() {
  const lib = library.value
  return (
    <div class="page about prose">
      <header class="topbar">
        <button class="icon-btn" onClick={() => back('/progress')} aria-label="Back">
          <Icon name="back" />
        </button>
        <div class="topbar-title">About</div>
      </header>
      <h1>
        <span lang="ja">読む読む</span> JP Reading
      </h1>
      <p>
        A free, open-source Japanese reader. Graded stories from Beginner 1 to Master, classic literature, and any text you paste — all with
        tap-to-look-up dictionary, furigana or romaji, pitch accent, JLPT highlighting, grammar breakdowns, sentence translations, text-to-speech
        and spaced-repetition flashcards. It runs entirely in your browser and works offline.
      </p>
      {lib && (
        <p class="muted">
          Library: {lib.stories.length} stories · {lib.grammar.length} grammar articles · updated {new Date(lib.built).toLocaleDateString()}
        </p>
      )}
      <h2>Add a story</h2>
      <p>
        Every text is a Markdown file in the <code>content/stories</code> folder of the repository. Add one with a pull request and it appears in the
        app after the next deploy. See <code>content/README.md</code> for the format.
      </p>
      <h2>Credits & licenses</h2>
      <ul>
        <li>
          <b>JMdict</b> and <b>KANJIDIC2</b> — Electronic Dictionary Research and Development Group (EDRDG), CC BY-SA 4.0.{' '}
          <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noopener noreferrer">
            License
          </a>
        </li>
        <li>
          <b>Pitch accent</b> — Kanjium data by mifunetoshiro, CC BY-SA 4.0.
        </li>
        <li>
          <b>JLPT word lists</b> — based on Jonathan Waller's JLPT resources (tanos.co.uk), CC BY, via elzup/jlpt-word-list.
        </li>
        <li>
          <b>Stroke order</b> — KanjiVG by Ulrich Apel, CC BY-SA 3.0.
        </li>
        <li>
          <b>Tokenizer</b> — kuromoji.js with the IPADIC dictionary (Apache 2.0 / IPADIC license).
        </li>
        <li>
          <b>Classic literature</b> — Aozora Bunko (青空文庫), public domain.
        </li>
        <li>
          <b>Original stories</b> — written for this project, CC BY 4.0.
        </li>
      </ul>
      <p class="muted small">Inspired by graded-reader apps such as Yomu Yomu. Not affiliated with them.</p>
    </div>
  )
}
