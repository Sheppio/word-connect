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
- **Hint** pulls one group into the row it's already closest to (3 per puzzle).
  **Shuffle** re-scatters the unsolved cards. **Restart** returns to the opening
  layout.

Progress saves to `localStorage`, so closing the tab mid-puzzle loses nothing.

## Puzzles

Puzzle numbers are deterministic: puzzle 12 deals the same six groups in the same
opening arrangement on any device, so it can be shared or replayed. Each puzzle
draws six word sets from the pool in `data.js`, skipping any set that would put a
duplicate word on the board (`RUBY` is both a gemstone and a coding language, so
those two never appear together).

The pool holds 70+ sets — days of the week, months, countries, capitals, star
signs, planets, dogs, big cats, luxury cars, retro games, boxing, pasta,
gemstones, Greek gods and so on. To add more, append to `CATEGORIES` in
`data.js`:

```js
{ title: 'Sea Creatures', words: ['DOLPHIN', 'OCTOPUS', 'SHARK', 'CRAB'] }
```

Exactly four words per set, and keep them short — long words shrink to fit, but
four cards still have to share the width of a phone.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell: top bar, board, toolbar, dialog |
| `app.js` | Game state, drag and drop, row locking, hints, saving |
| `confetti.js` | Canvas particle burst for the win celebration |
| `data.js` | The word-set pool |
| `style.css` | Layout and theme, sized to fit one screen without scrolling |

## Deploying

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on
every push to `main` (Settings → Pages → Source: GitHub Actions). The
`github-pages` environment only accepts deployments from `main`, so work merged
or pushed there goes live a minute later. Any other static host works too — the
files are served as-is.
