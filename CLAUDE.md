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

The board must fit one screen with no page scrolling, on a phone. Check any
layout change at 375px wide before shipping.

Every card on a board shares one type size, so the longest word sets the size
for all twenty-four. Words over `MAX_WORD_LEN` are never dealt — raise that
constant only after checking what it does to the type size at 375px.

Colours belong to the palette in `ROW_COLORS`: six hues at one saturation and
lightness. Adding a colour means adding a hue, not a hand-picked hex. Text on
those colours must clear WCAG AA (4.5:1); `test-polish.mjs` measures it.
