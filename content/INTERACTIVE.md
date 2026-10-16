# Writing interactive stories (分岐)

An interactive story is a graded story where the reader makes choices that
change what happens, like a gamebook (ゲームブック) or a visual novel
(ビジュアルノベル). This file is about designing one so that making the choices
is fun and rewarding. The general house style in [STYLE.md](STYLE.md) applies
to every scene; the file format will be described in [README.md](README.md)
once the reader supports it.

## The short version

1. **A choice is a wish, never a test.** The reader picks what they *want* to
   see, not what is *correct*. There is no wrong answer and no penalty for
   understanding a choice only half.
2. **Make a promise, keep it, then remember it.** Each option makes the reader
   imagine a scene. The next scene delivers it right away, and a later scene
   brings it back.
3. **Always move towards something.** The story has a goal from the first
   scene, and every path gets closer to it. Branches change *how* you get
   there and *what you bring along*, not *whether* you get there.
4. **Every ending is an ending, none is a punishment.** Endings are different,
   not worse. No death, no game over, no "you failed".
5. **Reading it again is the point.** Other paths reveal new things about the
   same world, so a second read is a reward and not a chore. For a learner
   that rereading is also the best kind of practice.

## Why a choice feels rewarding

A good choice is a small loop of anticipation and payoff:

```
 frame        →  choose     →  deliver           →  remember
 "what do I      "I want       the next scene       a later scene
  want here?"     that one"     gives exactly        shows that the
                                that, plus a         choice still
                                little more          matters
```

**Frame.** Before a choice, the reader should know what they want and roughly
where each option leads. A choice without framing ("blind choice": a left and
a right door with nothing to tell them apart) is a coin toss, and a coin toss
is not satisfying to win. Let the text build the wish first: the smell of
takoyaki, the kid crying by the goldfish stall, the sky getting dark.

**Choose.** Each option is a concrete, appealing promise. Good options make the
reader picture the scene they lead to:

| weak                       | better                                       |
| -------------------------- | -------------------------------------------- |
| 右に行く / 左に行く         | 屋台の方へ行く / 神社の方へ行く               |
| 話す / 話さない             | 声をかける / 後ろからそっとついて行く         |
| はい / いいえ               | 「一緒に探そう！」 / 「お母さんはどこ？」     |

All options should be tempting. If one option is obviously the "good" one,
the choice is fake; if one is obviously boring, it is wasted. Choice of Games
puts it as: interesting choices are hard because *all* the options are
compelling, and even the "wrong" answers should be fun.

**Deliver.** The first sentence of the next scene pays off the option at once.
If the reader chose takoyaki, the scene starts with takoyaki, not with three
sentences of walking. Then give a little more than promised: a surprise, a
joke, a new character ("yes, and…").

**Remember.** Later scenes refer back to the choice. Without this, branches that
rejoin feel like the choice never happened. Choice of Games calls this delayed
branching: short `if` lines in later scenes that show earlier choices still
matter. Even one changed sentence ("My tongue still burns from the takoyaki")
does a lot. The lesson from Telltale's "Clementine will remember that" is that
the acknowledgement is welcome, but only if something later actually changes.
Don't promise consequences you don't deliver.

## Kinds of choices

Mix these. Most choices in a graded story should be the first three kinds.

| kind                  | what the reader decides                         | example                                       |
| --------------------- | ----------------------------------------------- | --------------------------------------------- |
| **Curiosity**         | what to find out or where to go                 | follow the cat, or look inside the old shop   |
| **Wish**              | what they'd like to have, eat, buy, try         | takoyaki, or goldfish scooping                |
| **Character**         | how the main character feels or speaks          | answer with a joke, or honestly               |
| **Companion**         | who to spend the scene with                     | go with your friend, or with grandpa          |
| **Daring**            | safe and calm, or risky and exciting            | take the shortcut through the dark woods      |
| **Bittersweet** (N3+) | two good things, you can only have one          | keep the lucky charm, or give it away         |

A *character* choice is often the cheapest one to write: the scene stays the
same and only a line or two changes, but the reader shapes who the main
character is. Several small character choices can add up to a personality that
shows at the ending (Emily Short calls this a *scored choice*).

**Don't write:**

- **Tests**: choices that need you to understand a sign, a rule or a clue to
  pick the "right" one. Reading comprehension is never the gate.
- **Right and wrong answers**: options where one leads somewhere bad because
  the reader made a mistake.
- **Blind choices**: options with nothing to want or picture.
- **False choices**: two options that continue with exactly the same text. If
  two options rejoin immediately, at least the first lines must differ.
- **Choice overload**: more than three options, or options so long they need a
  translation to compare. Two or three short lines is right for most levels.

## Progress: a goal you can feel

Branching stories lose energy when the reader can't tell whether they are
getting anywhere. Give the story a goal in the first scene and make it visible:

- **A clear goal.** Find the lost cat before the fireworks. Cook grandma's
  recipe for her birthday. Reach the top of the mountain by sunrise. Deliver the
  letter before the last train.
- **A clock or a counter.** Time of day (6 o'clock, 7 o'clock, the fireworks at
  8), ingredients gathered, stations passed. These are also natural meeting
  points for the branches.
- **Things you carry.** A goldfish in a bag, a new friend, a broken umbrella, a
  secret. What the reader picked up along the way comes back at the ending.
  This makes the ending feel *earned* by the path, which is the strongest
  reward a branching story has.
- **No wasted scenes.** Every scene, on every path, moves towards the goal or
  adds something to carry. A detour is fine if it pays off later.
- **Open a question, answer it.** Plant something the reader wants explained
  (who keeps leaving the notes? why is the old man waiting at the station?)
  and answer it before the end, on every path. Some paths may answer it more
  fully than others; that is a reason to read again.

## Structure

Every scene needs Japanese, a translation, readings and an audit, so the number
of scenes is the real cost of an interactive story. Use structures where the
branches come back together.

**Branch and bottleneck (default).** Branches split for a scene or two and meet
again at shared events (the clock times, the climax). Small *flags* remember
what happened on the way, and the shared scenes and the ending use them. This
is what most visual novels and Choice of Games titles do: the story feels
personal while the amount of text stays manageable.

```
            ┌─ takoyaki ─┐            ┌─ follow the cat ──┐
 park ──────┤            ├── 7 pm ────┤                   ├── fireworks ── ending
            └─ goldfish ─┘            └─ help a lost kid ─┘

 flags remembered on the way: goldfish, followed-cat, helped-kid
 → the fireworks scene and the ending change with them
```

**Short side branch.** A choice that leads to a scene of a few sentences and
comes back. Good for curiosity and character choices, and cheap.

**Hub.** A central place with several short scenes that can be visited in any
order before the story moves on (stalls at a festival, rooms in a house). Limit
how many the reader can visit before the clock moves on, so they see some but
not all, and remember which ones they saw.

**Route split (visual-novel style).** A shared opening (共通ルート) followed by
a choice that leads into one of two or three longer routes, each with its own
ending, often following a different character. Best for a series (連載) or a
long advanced story; the routes can show the same events from different sides,
the way 428 〜封鎖された渋谷で〜 switches between five people on one day.

**Avoid the time cave**: branches that keep splitting and never rejoin. The
number of scenes doubles with every choice, the reader sees a small part of
what was written, and the paths are too short to build anything. Early
Choose Your Own Adventure books worked this way, with dozens of endings, many
of them sudden deaths; later books moved to fewer endings and longer paths.
Write the later kind.

## Size

One read-through (start to an ending) is as long as a normal story of that
level (see the table in README.md). The whole story is usually 2–3 times that.

| level        | sentences between choices | choices per read-through | endings |
| ------------ | ------------------------- | ------------------------ | ------- |
| beginner-2   | 4–8                       | 1–2                      | 2       |
| beginner-3   | 4–8                       | 2–3                      | 2–3     |
| elementary   | 6–10                      | 3–4                      | 2–3     |
| intermediate | 8–15                      | 3–5                      | 3–4     |
| advanced     | 10–20                     | 4–6                      | 3–5     |

Beginner 1 stories are too short to branch. Don't let a scene run too long
without a choice: Choice of Games' rule for English is 100–200 words between
choices and never 400 or more. A learner reads much more slowly, so keep
scenes short and let the reader act often.

Keep flags few (up to about five per story) and give them clear names
(`goldfish`, `helped-kid`), so that the shared scenes and endings can be
checked by hand.

## Endings

- **Each ending resolves the goal**, in its own way. Being late for the
  fireworks and watching them from the bridge with a lost child is an ending,
  not a failure.
- **Endings are different, not ranked.** Each one is a good place to stop. Sad
  or bittersweet endings are fine at higher levels when the story earned them,
  never as a punishment for a choice.
- **The ending reflects the path.** Use the flags: what you carry, who is with
  you, how the main character spoke. Even when two paths reach the same ending,
  a few lines should differ.
- **A secret ending is a bonus, not the goal.** One extra ending for readers
  who did something curious (followed the cat every time it appeared) is a
  nice surprise. Don't make a "true ending" that the other endings are wrong
  versions of.
- **Leave a door open.** An ending can wonder about the road not taken ("I
  still wonder where the cat went…"). That is the invitation to read again.

## Reading again

For a learner, a second and third read is valuable: the same words and grammar
come back in new sentences. Design for it:

- **Each path shows something new.** A character's secret, the other side of an
  event, why the old man was waiting. The 999 / Zero Escape games go further:
  what you learn on one route opens another. A light version of that works
  well here: a path that only makes full sense after you've read another.
- **Shared scenes stay short.** The scenes every path passes through will be
  read several times. Keep them brief and let the branches carry most of the
  text.
- **Choices you haven't taken should look inviting.** The reader shows which
  options were already chosen and which endings were found ("2 / 3 endings"),
  like the flowchart in かまいたちの夜 特別篇. The full map of the story is shown
  after the first ending, not before; showing the whole structure up front
  spoils the paths.

## Language

- **Options are Japanese at the story's level**, short (a verb phrase or a short
  line of dialogue) and written in parallel form: 屋台の方へ行く / 神社の方へ行く.
  Each option has a translation, available like any other sentence.
- **Option text is not a hint system.** Don't hide the meaning of a choice in a
  hard word; if an option needs a word above the level, put it in the keywords.
- **Keywords** cover the whole story, not one path; choose words that appear on
  most paths.
- **Names and readings** must be the same in every scene, like in a series.
- Everything else in [STYLE.md](STYLE.md) applies per scene: natural
  Japanese, full translations, ruby for names, a clean audit.

## Checklist

- [ ] The goal is clear in the first scene.
- [ ] Every choice has 2–3 short options, each concrete and tempting, none
      correct or wrong.
- [ ] The first sentence after each option delivers what it promised.
- [ ] Every choice is referred to again later, at least once.
- [ ] Every path is a normal story length for the level, and moves towards the
      goal.
- [ ] Every ending resolves the goal and reflects the path; none is a
      punishment.
- [ ] At least one path reveals something the others don't.
- [ ] Every scene can be reached, and every path reaches an ending.
- [ ] Each scene passes the audit like a normal story.

## Sources and further reading

- Sam Kabo Ashwell, [Standard Patterns in Choice-Based Games](https://www.ifwiki.org/Standard_Patterns_in_Choice-Based_Games)
  (time cave, gauntlet, branch and bottleneck, sorting hat, loop and grow, …)
- Emily Short, [Small-Scale Structures in CYOA](https://emshort.blog/2016/11/05/small-scale-structures-in-cyoa/)
  (scored choices, re-enterable conversations, endgame branching)
- Dan Fabulich, [4 common mistakes in interactive novels](https://choiceofgames.com/2011/12/4-common-mistakes-in-interactive-novels)
  (delayed branching, easy choices, words per choice)
- Peter Mawhorter's choice poetics, summarized in
  [Choice Poetics](https://emshort.blog/2019/04/09/choice-poetics-peter-mawhorter/)
  (framing, options, outcomes; blind, false and dead-end choices)
- Christian Swinehart, One Book, Many Readings, a visual analysis of twelve
  Choose Your Own Adventure books ([overview](https://flowingdata.com/2009/11/19/choose-your-own-adventure-a-detailed-visual-analysis))
- Sound novels: かまいたちの夜 (flowchart), 428 〜封鎖された渋谷で〜 (five
  viewpoints on one day, see [Real Sound](https://realsound.jp/tech/2018/09/post-246257.html))
