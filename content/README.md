# Content library

Everything under `content/` is plain text that lives in git. The build step
(`pnpm run build:content`) turns it into JSON (pre-tokenized, with furigana,
dictionary forms and keyword lists) that the app loads.

```
content/
  stories/<level>/<slug>.md               reading texts
  stories/<level>/<series>/series.yml     a series (連載) …
  stories/<level>/<series>/<slug>.md      … and its episodes
  grammar/<id>.md                         grammar articles
```

Adding a text is a pull request that adds one Markdown file. No code changes.
For how to write a good story and translation, see [STYLE.md](STYLE.md).
`pnpm run audit -- <slug>` reports missing translations, keywords that aren't in
the text, readings the tokenizer guessed, names that need a `names:` entry,
katakana words the dictionary misreads, and vocabulary above the level.

## Stories

Path: `content/stories/<level>/<slug>.md`. The slug (file name without `.md`)
is the story id and must be unique across all levels. Use lowercase ASCII and
dashes, e.g. `rainy-day-cafe.md`.

### Levels

| level folder   | label        | approx. JLPT | typical length          |
| -------------- | ------------ | ------------ | ----------------------- |
| `beginner-1`   | Beginner 1   | N5 (early)   | 5–12 short sentences    |
| `beginner-2`   | Beginner 2   | N5           | 10–20 sentences         |
| `beginner-3`   | Beginner 3   | N5–N4        | 15–25 sentences         |
| `elementary`   | Elementary   | N4           | 20–35 sentences         |
| `intermediate` | Intermediate | N3           | 30–50 sentences         |
| `advanced`     | Advanced     | N2           | 40–70 sentences         |
| `master`       | Master       | N1 / native  | anything, incl. classics |

### Categories

Use one of: `daily-life`, `food`, `travel`, `culture`, `folktale`, `history`,
`nature`, `school`, `work`, `society`, `science`, `humor`, `literature`,
`news-style`, `conversation`.

### File format

```markdown
---
title: 雨の日のカフェ
title_en: A Rainy Day Café
level: beginner-2
category: daily-life
tags: [cafe, weather]
summary: Yuki spends a rainy afternoon in a small café.
author: JP Reading (original)
license: CC BY 4.0
keywords:
  - 雨|あめ|rain
  - 喫茶店|きっさてん|coffee shop, café
names:
  - ゆき|Yuki (given name)
---

## 第一章

今日は雨です。
> Today it is raining.
ゆきさんは喫茶店に行きます。
> Yuki goes to a café.

店の中は静かです。
> It is quiet inside the shop.
```

Rules:

- **Front matter** is YAML. Required: `title`, `level`, `category`.
  Recommended: `title_en`, `summary`, `author`, `license`, `tags`.
  For public-domain texts also set `source` (URL) and `year`.
  Quote values that contain `:`.
- **`keywords`** (optional) is the pre-reading vocabulary list shown before the
  story, one `word|reading|meaning` per item. If omitted, the build picks
  keywords automatically from the text.
- **`names`** lists the proper nouns in the story (people, places, temples,
  shops, pets), one `word|reading|meaning` per item, or `word|meaning` for a
  word in kana: `清水寺|きよみずでら|Kiyomizu-dera (famous temple in Kyoto)`,
  `エマ|Emma (given name)`. The dictionary has no names: without this, tapping
  エマ shows 絵馬 "votive tablet" and 大野 shows "large field". A listed name is
  always cut as one word, gets its reading on every occurrence, and the lookup
  shows the meaning given here. Write the meaning as the English name plus what
  it is, in brackets.
- **`glosses`** (optional) is the same for other words the dictionary gets
  wrong in this story, usually sound words: `ワン|woof (a dog's bark)` (the
  dictionary reads it as 湾 "bay").
- **One sentence per line.** A line of Japanese is one sentence.
- **Translation**: a line starting with `> ` directly after a Japanese line is
  that sentence's English translation. Translations are optional (classic
  literature usually has none) but every original graded story should have
  them for every sentence.
- **Paragraphs** are separated by a blank line.
- **Chapters**: a line starting with `## ` starts a new chapter (the audio
  player can start from any chapter). `# ` lines are ignored (the title comes
  from the front matter).
- **Reading hints (ruby)**: the tokenizer guesses readings. Where it would be
  wrong (names, rare readings), add Aozora-style ruby:
  `｜朱鷺《とき》`, or `朱鷺《とき》` (the reading applies to the run of kanji
  directly before `《`). Use ruby for every personal name written in kanji.
- Dialogue in 「」 is fine. Keep 「」 on the same line as the rest of the
  sentence.
- Use full-width Japanese punctuation (。、「」！？).

## Series

A series (連載, *rensai*) is a set of stories that are read in order and
together tell one bigger story, like the chapters of a book or the episodes
of a TV show. Each episode is a normal story file with its own keywords and
translations, short enough for its level, and should end with a reason to
read the next one.

All episodes of a series are at the same level: the series is a folder
inside a level folder, and the build fails if an episode's `level:` differs.

```
content/stories/beginner-3/library-letters/
  series.yml
  the-letter-in-the-book.md
  the-second-letter.md
  under-the-cherry-tree.md
```

`series.yml`:

```yaml
title: 図書館の手紙
title_en: Letters in the Library Books
category: daily-life
summary: Mina finds a letter hidden in an old library book. It tells her where to find the next one.
author: JP Reading (original)
episodes:            # story ids (file names without .md), in reading order
  - the-letter-in-the-book
  - the-second-letter
  - under-the-cherry-tree
```

The folder name is the series id (lowercase ASCII and dashes). Every `.md`
in the folder must be listed in `episodes`, and every listed episode must
be in the folder. Keep names and their readings the same across episodes
(each episode has its own `names:` list). Add a new episode by adding its
file and appending it to `episodes`; the series shows as NEW in the app.

In the app a series has its own card on the home screen and in the library,
and a page with its episodes (`#/series/<id>`). Episodes show "Ep. n" on
their cards, the reader links back to the series and offers the next
episode when you finish one, and recommendations only suggest the next
unread episode of a series.

## Grammar articles

Path: `content/grammar/<id>.md`. The id is referenced from the reader's
grammar breakdown, so keep ids stable.

```markdown
---
title: Te-form
title_jp: て形
jlpt: N5
order: 10
summary: Connects actions, makes requests and builds many other forms.
---

Body in Markdown. Japanese example sentences in a list, with an em dash
before the translation:

- 窓を開けて、外を見ました。 — I opened the window and looked outside.
```

## Licensing

Original texts in this repository are licensed CC BY 4.0 unless the front
matter says otherwise. Texts from Aozora Bunko are public domain in Japan;
keep their `source` URL.
