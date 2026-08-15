# Working on Word Connect

## Bump the version on every commit

`APP_VERSION` in `version.js` must be raised in the same commit as the change
it describes — never leave it stale.

- **patch** (`0.1.1` → `0.1.2`) — fixes, tweaks, small improvements
- **minor** (`0.1.2` → `0.2.0`) — a new feature or a visible change in how the
  game plays
- **major** — a rewrite or a break in saved progress

Leave `APP_BUILD` alone. The Pages workflow rewrites it with the commit being
published, and fails the deploy if that stamp doesn't take.

## Shipping

Develop on `claude/word-grouping-game-taexak`, then push the same commits to
`main` — the `github-pages` environment only accepts deployments from `main`,
and pushing there is what puts the change live.

## House style

No frameworks, no build step, no external requests: the game is plain HTML, CSS
and JS served as static files. Keep it that way — anything added has to work by
opening `index.html` from disk.

## Four games, one shell

`app.js` owns the session — clock, moves, hint stock, streak, saves, dialogs —
and no game rules whatsoever. Each game lives in its own `mode-*.js` and is
registered in `MODES` at the foot of `app.js`; the modes load first, which is
why `app.js` is last in `index.html`. README's "Adding a game" has the shape of
a mode object.

**A grid seed must keep dealing the puzzle it always dealt.** `seedFor()` leaves
`20260813-1` alone and gives the other games a name in the middle. Changing how
the grid picks its categories or words re-deals every puzzle every player has
already played, so any change there has to be checked against the old output
first.

Playing one puzzle in any game keeps the day's streak.

The board must fit one screen with no page scrolling, on a phone. Check any
layout change at 375px wide before shipping.

Every card on a board shares one type size, so the longest word sets the size
for all twenty-four. Words over `MAX_WORD_LEN` are never dealt — raise that
constant only after checking what it does to the type size at 375px.

Row colours come from `ROW_HUES` in OKLCH, at one perceptual lightness with
chroma set as a fraction of each hue's maximum. Add a hue, never a hand-picked
hex — HSL lightness is not perceptual, and matching it across hues is what made
the purple and red rows unreadable. Dark text on every row colour must clear
WCAG AAA (7:1); `test-polish.mjs` measures it from the live CSS.
