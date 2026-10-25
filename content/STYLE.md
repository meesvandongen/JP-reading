# Writing guide for graded stories

This is the house style for original stories and translations in
`content/stories/`. The file format is in [README.md](README.md); this file is
about making a story good to learn from.

## What makes a good story here

- **A story, not a vocabulary list.** Something happens: a small problem, a
  surprise, a turn at the end, a joke that lands, a warm or bittersweet
  moment. Even a ten-sentence Beginner 1 story should have a point.
- **Natural Japanese.** Write what a Japanese author of graded readers would
  write. Grade the language by choosing simpler words and structures, not by
  writing unnatural Japanese. Repetition is good at low levels.
- **Japanese life and culture** where it fits, without turning into a
  guidebook. Non-fiction (history, science, society, news-style) should be
  accurate; check facts and avoid claims you are not sure of.
- **Varied characters and settings**: children and old people, cities and
  the countryside, Japanese people and foreigners living in Japan.

## Level guidelines

| level        | grammar                                                     | vocabulary and script                                                                   |
| ------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| beginner-1   | です/ます, present and past, ～が います/あります, simple particles | N5 words. N5 kanji where natural (人, 日, 山, 大きい), other words in kana              |
| beginner-2   | + て-form, ～たい, ～ましょう, ～から (because), simple quotes    | N5 + a few N4 words; introduce new words in the keyword list                             |
| beginner-3   | + plain form in quotes, ～と思います, ～たり, simple conditionals  | N5–N4. Kanji for N5/N4 words                                                             |
| elementary   | N4 grammar: plain-form narration is fine, ～そう, ～ように, passive | N4 with some N3. Normal kanji use for N4 words                                         |
| intermediate | N3 grammar, plain narration (だ/である), longer sentences         | N3 with some N2; normal written Japanese                                                |
| advanced     | N2: essays, explainers, literary fiction                       | Normal written Japanese                                                                 |

Sentence counts are in README.md. Every sentence of an original story has a
translation.

## Kana, kanji and readings

- The app shows furigana, so a word in kanji is not harder than the same word
  in kana. Prefer kanji for words that are normally written in kanji once the
  level allows it.
- **Long runs of hiragana confuse the tokenizer**: `かぎをれいぞうこに` becomes one
  "word", `おせち料理` becomes お + せ + ち. If a beginner word in kana gets
  split wrongly, write it in kanji with a reading (`冷蔵庫《れいぞうこ》`), put the
  kana word next to punctuation, or rephrase. Always check with
  `scripts/show-words.ts`.
- **Every personal name in kanji gets ruby** (`大野《おおの》さん`) on every
  occurrence. Add ruby wherever the tokenizer would guess wrong (place names,
  rare readings, counters like 八《やっ》つ). If the ruby has to cover kana
  inside the name, mark its start with ｜ (`｜山ノ内町《やまのうちまち》`).
- **List every name in `names:`** in the front matter: people, pets, places,
  temples, shops, companies, in kanji, kana or katakana. JMdict has no names,
  so otherwise a name shows a common word that happens to be spelled or read
  the same (エマ → 絵馬 "votive tablet", 山本 → "foot of a mountain") or
  nothing at all (清水寺). The audit lists the names it finds.
- **Katakana**: a run of katakana is kept as one word (スマートフォン, メロンパン).
  A katakana word that is a sound or a name (ワン, カーン, コロ) can match a native
  word read the same way; the audit reports those, and `glosses:` or `names:`
  fixes them. Texts written in katakana instead of hiragana (雨ニモマケズ) are
  detected and tokenized as hiragana.
- Full-width punctuation only: 。、「」！？…… Keep dialogue in 「」 on one line
  with its sentence.

## Translations

- **Faithful and natural.** Translate what the sentence says, in idiomatic
  English. A learner uses the translation to check their understanding, so
  don't add information that isn't in the Japanese, don't drop clauses, and
  keep the meaning of each sentence in its own line. Within that, write English
  a native speaker would write (「よろしくお願いします」 is "Nice to meet you" or
  "Thanks in advance", not "Please treat me well").
- **Keep tense and person consistent** within a story. Japanese narration
  mixes tenses; English usually shouldn't.
- Names: given names as is (Yuki, Shota), family names with Mr./Ms. where the
  Japanese uses さん for an adult (大野さん → Mr. Ono). Historical names may use
  macrons (Inō Tadataka). Keep culture words when English has no good
  equivalent and the story explains them (onigiri, otoshidama).
- Sound words and set phrases: translate the effect (ドキドキ → "my heart was
  pounding"; いただきます → "Let's eat" or leave it with a gloss).

## Keywords

5–10 words a reader at this level probably doesn't know yet, most important
first, each `word|reading|meaning`. Use the dictionary form unless the story is
Beginner 1–2, where the ます form as it appears in the text is fine. Every
keyword must appear in the text (the audit checks).

## Checking your work

```sh
pnpm run data                                        # once: builds the dictionary
pnpm exec vpx scripts/audit-content.ts <path-part>   # report for matching stories
pnpm exec vpx scripts/show-words.ts "文を一つ。"      # how a line is tokenized
```

A new story should come out of the audit with no ERROR (this includes names
missing from `names:`), no "possible misparse", "reading guessed" or
"katakana … read as" lines, and with few words far above its level.
