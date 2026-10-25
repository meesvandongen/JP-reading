# 読む読む JP Reading

A free, open-source Japanese graded reader in the spirit of Yomu Yomu. It's a
Progressive Web App hosted on Cloudflare Workers: install it on your phone or
desktop and it works offline.

## Features

**Library**
- Graded stories in seven levels (Beginner 1–3, Elementary, Intermediate,
  Advanced, Master) and topics such as daily life, food, travel, culture,
  folktales, history, science, news and conversation.
- **Series (連載)**: stories at one level that are read in order and tell one
  bigger story, with a series page, per-episode progress and a "Next
  episode" button at the end of each episode.
- Public-domain classics from Aozora Bunko: Akutagawa, Natsume Sōseki, Dazai
  Osamu, Miyazawa Kenji, Niimi Nankichi and others.
- Recommendations based on your level and reading history, a "Continue
  reading" shelf, favorites, NEW badges, search and filters.
- **Read any Japanese text.** Paste text, open a `.txt` file, or share text
  from another app (share target). It's tokenized in your browser and you get
  the same reader as the library.

**Reader**
- Tap any word for its meaning, reading, romaji, pitch accent, JLPT level,
  part of speech, other forms and the kanji it uses (with stroke order
  animation). The lookup opens as a small panel that keeps the sentence in view
  above it, and you can tap the next word without closing it. Swipe the panel up
  (or press "More details") for everything.
- Press and hold any word to select its sentence: the full translation, a
  word-by-word breakdown, audio and copy. Texts without a translation use the
  browser's on-device translator where available, or offer Google Translate and
  DeepL links. Press and hold no longer starts the browser's text selection
  (or Android's web search).
- A grammar breakdown for conjugated words, e.g.
  食べさせられました → 食べる + causative + passive + polite + past, with links
  to grammar articles.
- Reading aids:
  - furigana or romaji over kanji, and romaji over kana
  - shown for all words, only for words you don't know yet, or by JLPT level
    (adjustable furigana)
- Sentence translations, per sentence (tap to reveal) or per paragraph.
- JLPT vocabulary highlighting, pitch-accent coloring and underlined saved
  words.
- Fonts (Gothic, Mincho, Rounded, Textbook, System), text size, line spacing,
  vertical writing (縦書き), and light, sepia and dark themes.
- Audio via text-to-speech:
  - the current sentence is highlighted and followed as it plays
  - speed from 0.5× to 1.5×
  - start from any chapter or any sentence
  - lock-screen / background controls (Media Session)
- A keyword list before each story, and a resource hub with keywords, saved
  words, the grammar used in the story, and info about it.
- Progress is saved per story, and you can mark stories as finished.

**Flashcards (SRS)**
- Save words while reading, together with the sentence you found them in.
- Spaced-repetition reviews (Again / Hard / Good / Easy) in three modes:
  reading → meaning, listening → meaning, and meaning → word.
- A daily new-card limit, a word list, and export to Anki.

**Dictionary and grammar**
- JMdict with about 220,000 entries, searchable in Japanese, romaji or
  English, with pitch accent (Kanjium) and JLPT levels.
- Kanji pages from KANJIDIC2 with KanjiVG stroke order animations.
- 63 grammar articles from N5 to N3, with audio for the examples.

**Progress**
- Daily streak, a weekly goal (stories or minutes), an activity heat map,
  per-level completion and totals.
- Reading reminders: notifications through Periodic Background Sync when
  installed, or a calendar (.ics) file with a daily alarm.
- Backup and restore of all your data as a JSON file.

**PWA**
- Installable, with app shortcuts, a share target and a `.txt` file handler.
- Library and app shell are precached for offline use. The dictionary is
  cached as you use it, or you can download all of it for offline use.
- Shows a prompt when an update is available.

Everything runs client-side. Your data stays in your browser (IndexedDB).

## Adding texts

Texts are Markdown files in [`content/stories/<level>/`](content/stories), and a
series is a folder of them with a `series.yml`. See
[`content/README.md`](content/README.md) for the format: YAML front matter,
one sentence per line, `> ` translation lines, `## ` chapters, and
`漢字《かんじ》` reading hints, a `names:` list for proper nouns, and [`content/STYLE.md`](content/STYLE.md) for
the house style. Check a story with `pnpm run audit -- <slug>`. Open a pull request. CI validates the files, and
the text appears in the app after merge.

Public-domain texts from Aozora Bunko can be imported with:

```sh
node scripts/import-aozora.mjs https://www.aozora.gr.jp/cards/000879/card92.html \
  --level master --category literature --slug kumo-no-ito --title-en "The Spider's Thread"
```

## Development

```sh
pnpm install
pnpm run data         # download sources and build the dictionary into public/data/dict (~25 s)
pnpm run dev          # tokenizes content/ into public/data/library, then starts Vite (via `vp dev`)
pnpm test
pnpm run audit        # content quality report (translations, readings, keywords, level)
pnpm run build        # content + typecheck + production build into dist/
```

How it works:
- `scripts/build-dict.mjs` turns JMdict, KANJIDIC2, Kanjium accents and the
  JLPT lists into small JSON shards. A tap fetches one or two shards, about
  10 KB gzipped.
- `scripts/build-content.ts` pre-tokenizes the library with kuromoji (IPADIC)
  and the same analysis code the browser uses (`src/lib/`). It groups
  morphemes into words, adds furigana, dictionary forms, grammar tags, JLPT
  levels and pitch accents, and picks keywords.
- Imported texts go through the same pipeline in a Web Worker (`src/workers/`).
- The UI is Preact with signals. `vite-plugin-pwa` (Workbox) generates the
  service worker.

## Deployment

The site is served as [Workers static assets](https://developers.cloudflare.com/workers/static-assets/)
from the Worker `jp-reading` (see [`wrangler.jsonc`](wrangler.jsonc)).
[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
deploys `main` to production, and builds every other branch as a Preview whose
URL it posts as a comment on the pull request.

Workers Builds settings (**Workers & Pages → jp-reading → Settings → Build**):

| Setting | Value |
| --- | --- |
| Build command | `pnpm run build:cf` |
| Deploy command | `pnpm exec wrangler deploy` |
| Preview command | `pnpm exec wrangler preview` (with preview builds enabled for all non-production branches) |
| Root directory | `/` |

`pnpm run build:cf` unshallows the clone (stories get their "added" date from
git history), downloads the dictionary sources and builds into `dist/`.
`.github/workflows/ci.yml` runs the tests and the build on every push and pull
request.

To deploy by hand: `pnpm run data && pnpm run build && pnpm run deploy`.

## Credits

- [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) and
  [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) (EDRDG),
  CC BY-SA 4.0
- Pitch accents: [Kanjium](https://github.com/mifunetoshiro/kanjium), CC BY-SA 4.0
- JLPT lists: Jonathan Waller via
  [elzup/jlpt-word-list](https://github.com/elzup/jlpt-word-list)
- Stroke order: [KanjiVG](https://kanjivg.tagaini.net), CC BY-SA 3.0
- Tokenizer: [kuromoji.js](https://github.com/patdx/kuromoji.js) with IPADIC
- Classic texts: [Aozora Bunko](https://www.aozora.gr.jp) (public domain)

Original stories are CC BY 4.0. This project is not affiliated with Yomu Yomu.
