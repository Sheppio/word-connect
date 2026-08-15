# Word Connect

Four phone-first word games sharing one pool of words, one clock and one streak.
The game opens on a home screen: your streak, and a card for each game saying
where you are in it. Each deals its own numbered puzzles every day.

| Game | What you do |
| --- | --- |
| **Word Connect** | Drag twenty-four cards into six rows of four related words |
| **Odd One Out** | Ten rounds of five words: tap the one that doesn't belong |
| **Anagram** | Unscramble five words from a single category |
| **Chunks** | Rebuild five words from the pieces they were cut into |

**Play it:** <https://sheppio.github.io/word-connect/> — or open `index.html`
directly. No build step, no dependencies, no server needed.

## Word Connect

Six rows, four columns, twenty-four shuffled cards. Drag related words together
until each row holds one complete group — a finished row locks itself and
reveals the group's name.

- **Drag** a card onto another to swap the two.
- **Or tap** one card then tap a second — the same swap, easier on small screens.
- Complete a row and it locks: the band takes the group's colour and the title
  appears on a banner. Locked cards can't be moved again.
- Clear all six rows to finish the puzzle. Confetti goes up over the completed
  board and the scorecard — time, moves, hints used — follows a few seconds
  later, so the finished grid gets a moment to itself.
- **Hint** pulls one group into the row it's already closest to. Hints are a
  stock rather than a per-puzzle allowance: you hold at most three, and one
  returns every five minutes. At zero the button is disabled and counts down to
  the next. Refills run on wall-clock time, so they accrue while the game is
  closed — and starting a new puzzle can't be used to top them up.
- **Shuffle** re-scatters the unsolved cards, then sits out five seconds —
  shuffling repeatedly is otherwise a way to have chance solve rows for you.
- Once a board is finished those two give way to **Next puzzle**, since there's
  nothing left to hint or shuffle.

## Odd One Out

Five words, four of them from one category. Tap the intruder to take the round;
ten rounds make a puzzle. A wrong tap costs nothing but the count, so the round
runs until it's found. A hint rules out one of the wrong answers. There is
nothing to shuffle, so that button doesn't appear.

The twenty categories a puzzle needs are picked in one go, which is what stops a
category appearing twice and stops the intruder being something the family could
fairly claim — a snake among reptiles would have no right answer.

## Anagram

Five scrambled words, all from one category, taken one at a time. The category
is the clue, which is why they all come from the same one. Tap a letter to place
it, tap a placed letter to take it back; fill every slot and the word checks
itself. A hint settles one letter for good, and shuffle re-scatters the letters
still on the rack.

A scramble is checked against every word in the pool before it is shown, because
`LEMON` scrambled must never read `MELON`.

## Chunks

Five words from one category, each cut into two or three pieces and jumbled
together. Tap pieces to build a word in the tray; tap a piece in the tray to take
it back. Finish a word and it locks — you never have to say which word you were
building, which matters because a piece can start more than one of them. The tray
turns red when what you're holding can't finish any word left.

The pieces are cut by rule, not looked up. Real syllabification needs a
pronunciation dictionary and this game makes no external requests, so
`chunkCuts()` in `mode-chunks.js` applies a look test instead: every piece
carries a vowel, no cut lands inside a digraph or between two vowels, and
consonants in between divide the way English divides them (`DIS·CUS`,
`LADY·BIRD`, `RING·MAS·TER`). 553 of the 566 eligible words come out with
nothing against them; compounds are its blind spot (`TIGH·TROPE`), and fourteen
words can't be cut at all and sit the mode out.

This is also the only mode that deals the pool's longest words: `MAX_WORD_LEN`
exists because four cards share the width of a phone, and there are only a dozen
pieces here, so `RINGMASTER` finally gets a game.

## The home screen

Where the game opens, whatever was last played — a puzzle left half finished is
one tap away and its card says so, rather than dropping you back into a board
you may be done with for now. Each card carries the game's name, what it asks of
you, and one line of state:

| Card says | Means |
| --- | --- |
| `Puzzle 3 · in progress` | a board with time or moves on it, waiting |
| `Puzzle 4 · 3 done today` | three finished today, the fourth is open |
| `Puzzle 1` | nothing played in this game today |

The streak sits above them, spelled out rather than squeezed into the header
chip, and lights the moment anything is finished today. The `?` beside each card
reads that game's rules without starting it; the rules also appear once, by
themselves, the first time you enter a game (`word-connect-seen-v1` remembers
which games have introduced themselves).

The house button in a game's header returns here. The board's clock stops while
you're on the home screen, and a celebration in progress is cleared rather than
followed here — its later volleys are on timers, so `stopCelebrating()` cancels
those as well as clearing the canvas.

## Shared between the games

Progress saves to `localStorage`, one save per game, so leaving a grid half
finished to play an anagram doesn't cost you the grid. The hint stock, the
clock, the move counter and the streak are the shell's rather than any one
game's — see `app.js`, which owns the session and no rules at all.

## Streak

The flame in the header counts consecutive days on which the player finished
**a puzzle in any of the four games**. It's lit once today's is done and grey
while it's still outstanding, so the state answers "have I played today?" at a
glance. Miss a whole day and it goes back to zero.

Stored in `word-connect-streak-v1` as `{ count, lastDay }` rather than counted
out of the solve log, so a long streak can't be lost to the log's 500-entry cap.
The flame greys itself at midnight without needing a reload.

## The solve log

Every completed puzzle is appended to `word-connect-history-v1` in
`localStorage`, keyed by its seed:

```json
{ "seed": "20260813-anagram-2", "day": "20260813", "mode": "anagram",
  "puzzle": 2, "solvedAt": 1786627045116, "seconds": 95, "moves": 8, "hints": 0 }
```

It drives the unlock order — the next puzzle open in a game is one past the
highest solved in *that game* today — and is the record a stats or personal-best
screen would be built from. `loadHistory()` returns it, oldest first, and the
last 500 entries are kept. Solving the same puzzle twice appends a second entry
rather than replacing the first, so attempts stay distinguishable. Entries
written before there were modes carry no `mode` and are read as grid.

## Puzzles

**Everyone gets the same puzzles in the same order each day, as many as they
want.** A puzzle is identified by a seed of `<local date>-<number that day>` —
`20260813-1` is the first grid of 13 August, `20260813-45` the forty-fifth. The
other games carry their name in the middle, `20260813-anagram-1`, so each deals
its own sequence and the grid's seeds are the ones they always were. **Never
change how a grid seed is built**: it would re-deal every puzzle everyone has
already played.

A puzzle is a pure function of its seed (hashed with xmur3, dealt with
mulberry32): no device state, no clock, no stored randomness, so the same seed
deals the same puzzle anywhere. Players only ever see the number — Puzzle 1,
Puzzle 2 — since the date is implied by playing today.

Puzzles unlock in order **within a game**: the highest number open today is one
past the highest solved in that game, worked out from the solve log rather than
tracked separately so it can't drift. Earlier puzzles can be revisited freely; a
save pointing at a locked one is pulled back.

The date is the device's own calendar day, so it turns over at the player's
midnight rather than UTC's.

### Sharing

Only Word Connect shares, since it's the one people compare. **Share result**
hands over a **picture of the win sheet** — the same dialog
minus its buttons, plus the date — drawn on a canvas by `share-card.js` and
passed to the share sheet as a PNG. The measurements there mirror `.sheet`,
`.result-grid` and `.solved-list` in `style.css`; change one and change the
other, or the picture stops looking like the dialog it came from.

All that travels with the picture is the link, since a picture can't be
clicked — everything else is already in the image. The written summary below is
the fallback for when the picture *can't* go: no canvas, no file sharing, or no
clipboard images each sends it instead of failing the share.

```
Word Connect · Puzzle 10 · 13 Aug 2026
1:25 · 14 moves · 0 hints

🟧 Pasta
🟨 Retro Games
🟩 Bathroom
🟦 Aircraft
🟪 Flowers
🟥 Drinks
```

`ROW_EMOJI` sits beside `ROW_HUES` and has to be kept in step with it — row *n*
takes entry *n*. Note that naming the groups gives away the answer to anyone
who plays the same puzzle afterwards; drop the titles from `resultSummary()`
and `resultImage()` if that ever matters more than showing off the board.

`data.js` holds 71 categories and about a thousand words. Each category lists
far more members than a row can hold — twelve months, seven days, dozens of
countries — and a puzzle takes **four at random** from each of six categories,
so the same category plays differently every time it appears.

Words that honestly belong to two categories are listed under **both**:
`ORANGE` is a fruit and a colour, `PYTHON` a snake and a language, `TURKEY` a
country and a bird, `JAGUAR` a cat and a car. `buildPuzzle()` only deals a word
that is unique among the six categories on that board, so a card can never
belong to two rows at once. Listing an overlap is therefore how you *prevent*
ambiguity, not how you cause it — if you add a word that could sit in another
category, add it there too.

That guard compares words. Two categories can also overlap in *meaning* without
sharing one — every snake is also a reptile — so a category may name others in
`conflicts` and the picker will never deal them onto the same board:

```js
{ title: 'Reptiles', words: [...], conflicts: ['Snakes'] }
```

To add material, extend a pool or append a category:

```js
{ title: 'Sea Creatures', words: ['DOLPHIN', 'OCTOPUS', 'SHARK', 'CRAB', 'WHALE'] }
```

At least four words per category. **Words longer than eight characters are never
dealt** (`MAX_WORD_LEN` in `app.js`) — every card on a board shares one type
size, so a single long word would shrink all twenty-four. Over-length words can
stay in the pool; they simply sit out. Spaces are free, since the card wraps:
`POLE VAULT` is measured as its longest word, five characters.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell: home screen, top bar, board, toolbar, dialog |
| — | *scripts load modes first, then `app.js`, which registers them* |
| `app.js` | The shell: session, clock, hints, streak, saves, dialogs, mode registry |
| `mode-grid.js` | Word Connect: the grid, drag and drop, row locking, sharing |
| `mode-odd.js` | Odd One Out |
| `mode-anagram.js` | Anagram |
| `mode-chunks.js` | Chunks, including the word-splitting rules |
| `confetti.js` | Canvas particle burst for the win celebration |
| `share-card.js` | Draws the win sheet as a PNG for sharing |
| `version.js` | Version string; the build hash is stamped in at deploy time |
| `data.js` | The word-set pool |
| `style.css` | Layout and theme, sized to fit one screen without scrolling |

## Versioning

A line like `v0.1.1 · a8d3ae98` sits under the How to play sheet. Bump
`APP_VERSION` in `version.js` in the same commit as the change it describes —
patch for a fix or small improvement, minor for a new feature. `APP_BUILD` is
left alone: the deploy workflow rewrites it with the commit it is publishing,
and the build fails if that stamp doesn't take. Opened from a working copy it
reads `dev`, which is how you can tell a local copy from the live one.

## Deploying

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on
every push to `main` (Settings → Pages → Source: GitHub Actions). The
`github-pages` environment only accepts deployments from `main`, so work merged
or pushed there goes live a minute later. Any other static host works too — the
files are served as-is.

## Adding a game

A mode is a plain object registered in `MODES` at the foot of `app.js`. It
supplies rules and a board; the shell supplies everything else.

```js
const MY_MODE = {
  id: 'mine', name: 'My Game', blurb: 'One line for the home card',
  tint: 'rgb(126 200 255)',   // the dot on its home card
  counter: 'moves',           // what the number in the header counts
  help: ['Shown on the How to play sheet'],

  start(saved) { /* build from state.day and state.level, draw into boardEl */ },
  serialize() { return { …}; },        // saved under this mode's own key
  validate(game) { return true; },     // shape check before a save is trusted
  hint() { /* return false when there's nothing left to give */ },
  shuffle: null,                       // null hides the button
  winRows() { return [{ color, label }]; }
};
```

Three rules the shell relies on:

- **Deal from the seed, never from `Math.random`.** `seedRandom(day, level, id)`
  gives you a generator; `pickCategories()` picks categories nothing else on the
  board can claim. Shuffling what's already on screen is the one fair use of
  real randomness.
- **Call `finish()` when the puzzle is complete.** It records the solve, moves
  the streak, celebrates and shows the scorecard.
- **Keep your working data on `state`**, under keys named in your file's header.
  One object means one save path, whatever is being played.
- **Size anything you draw from the board's width, and test the widest case.**
  `fitAllText()`, `anaFit()` and `chFit()` all shrink one shared size until the
  longest item fits, so a board reads as a set rather than as an accident.

Add the id to `MODE_ORDER` too — that's the order the home screen lists them in.
