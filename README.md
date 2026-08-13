# Word Connect

A phone-first word grouping game. Six rows, four columns, twenty-four shuffled
cards. Drag related words together until each row holds one complete group — a
finished row locks itself and reveals the group's name.

**Play it:** <https://sheppio.github.io/word-connect/> — or open `index.html`
directly. No build step, no dependencies, no server needed.

## How it plays

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
  **Restart** returns to the opening layout.

Progress saves to `localStorage`, so closing the tab mid-puzzle loses nothing.

## The solve log

Every completed puzzle is appended to `word-connect-history-v1` in
`localStorage`, keyed by its seed:

```json
{ "seed": "20260813-2", "day": "20260813", "puzzle": 2,
  "solvedAt": 1786627045116, "seconds": 95, "moves": 8, "hints": 0 }
```

Nothing in the game reads it yet — it's the record a stats, streaks or
personal-best screen would be built from. `loadHistory()` returns it, oldest
first, and the last 500 entries are kept. Solving the same puzzle twice appends
a second entry rather than replacing the first, so attempts stay distinguishable.

## Puzzles

**Everyone gets the same puzzles in the same order each day, as many as they
want.** A puzzle is identified by a seed of `<local date>-<number that day>` —
`20260813-1` is the first puzzle of 13 August, `20260813-45` the forty-fifth.
The board is a pure function of that string (hashed with xmur3, dealt with
mulberry32): no device state, no clock, no stored randomness, so the same seed
deals the same cards anywhere. Players only ever see the number — Puzzle 1,
Puzzle 2 — since the date is implied by playing today.

The date is the device's own calendar day, so it turns over at the player's
midnight rather than UTC's. The win sheet offers the result to the share sheet
(or the clipboard) naming the date and puzzle number, so a friend can find the
same board. The menu walks to any other puzzle of the day.

`data.js` holds 70 categories and about a thousand words. Each category lists
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
| `index.html` | Page shell: top bar, board, toolbar, dialog |
| `app.js` | Game state, drag and drop, row locking, hints, saving |
| `confetti.js` | Canvas particle burst for the win celebration |
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
