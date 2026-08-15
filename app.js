/* Word Connect — the shell every game mode plugs into.

   This file owns the session: which day and puzzle is in play, the clock, the
   move counter, the hint stock, the streak, the solve log, the dialogs and the
   toolbar. It owns no game rules at all.

   A mode (mode-grid.js, mode-odd.js, mode-anagram.js, mode-chunks.js) supplies
   the rules and the board, and keeps its own working data on `state` under keys
   it names in its header. Modes are plain objects registered in MODES at the
   bottom of this file, which is why app.js loads last. */

'use strict';

/* Hints are a stock, not a per-puzzle allowance: one arrives every five
   minutes up to a maximum of three. Refills are counted from wall-clock
   timestamps, so they keep coming while the game is closed — and so that
   starting a new puzzle can't be used to top them up. The stock is shared
   across modes, so a mode can't be farmed for another mode's hints. */
const HINT_MAX = 3;
const HINT_REFILL_MS = 5 * 60 * 1000;

/* Shuffling repeatedly is a way to have the game solve things for you by
   chance, so the button sits out five seconds after each use. */
const SHUFFLE_COOLDOWN_MS = 5000;

/* One save per mode, so leaving a grid half-finished to play an anagram
   doesn't cost you the grid. SAVE_LEGACY_KEY is the single-mode save this
   replaced — read once, so an upgrade mid-puzzle doesn't lose the board. */
const SAVE_KEY = 'word-connect-save-v2';
const SAVE_LEGACY_KEY = 'word-connect-save-v1';

/* Every solve is logged against its seed. It drives the unlock order — the
   next puzzle open in a mode is one past the highest solved in that mode
   today — and is the record a stats screen would be built from. Oldest
   entries fall off the end so it can't grow without limit. */
const HISTORY_KEY = 'word-connect-history-v1';
const HISTORY_MAX = 500;

/* Daily streak: days in a row on which the player finished a puzzle in any
   mode. Kept as a count plus the day it last advanced, rather than counted out
   of the solve log, so a long streak can't be lost to the log's cap. */
const STREAK_KEY = 'word-connect-streak-v1';

/* ---------- palette ----------

   Six hues at a fixed *perceptual* lightness. HSL won't do this: hsl(50 74% 61%)
   and hsl(276 74% 61%) claim the same lightness but the yellow is far brighter
   than the purple, so dark text on it varies from comfortable to unreadable.
   These are specified in OKLCH, where L really is perceived lightness, and
   converted to sRGB here so no CSS colour-space support is needed.

   Chroma is set as a fraction of what each hue can actually reach at that
   lightness, not as one number for all six: sRGB affords yellow far more
   chroma than purple, and a fixed value leaves the yellow looking like olive. */

const CARD_L = 0.80, CARD_VIVID = 0.92;   // face of a locked card
const BAND_L = 0.89, BAND_VIVID = 0.70;   // band behind the row
const ROW_HUES = [65, 100, 148, 245, 305, 20];  // orange, yellow, green, blue, purple, red

/* The same six, as the nearest emoji square — a shared result has to survive
   being pasted into a message, where CSS colours can't follow it. Keep this
   in step with ROW_HUES: row n takes entry n. */
const ROW_EMOJI = ['🟧', '🟨', '🟩', '🟦', '🟪', '🟥'];

function oklchToRgb(L, C, hDeg) {
  const h = hDeg * Math.PI / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;

  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ];
  const gamma = v => v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return lin.map(v => Math.round(Math.min(1, Math.max(0, gamma(v))) * 255));
}

/* True when the colour fits inside sRGB without any channel being clipped. */
function inGamut(L, C, hDeg) {
  const h = hDeg * Math.PI / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ].every(v => v >= -0.0001 && v <= 1.0001);
}

/* The most chroma this hue can hold at this lightness without sRGB clipping —
   clipping would drag the lightness with it, which is the thing we're fixing. */
function maxChroma(L, h) {
  let c = 0.4;
  while (c > 0 && !inGamut(L, c, h)) c -= 0.002;
  return Math.max(c, 0);
}

function oklch(L, vivid, h) {
  const [r, g, b] = oklchToRgb(L, maxChroma(L, h) * vivid, h);
  return `rgb(${r} ${g} ${b})`;
}

/* [band behind the row, face of the locked cards] */
const ROW_COLORS = ROW_HUES.map(h => [
  oklch(BAND_L, BAND_VIVID, h),
  oklch(CARD_L, CARD_VIVID, h)
]);

/* Published to CSS so a stylesheet can reach the palette without hand-picking
   a hex — the modes use --row-2-card for right and --row-5-card for wrong. */
ROW_COLORS.forEach(([band, card], i) => {
  document.documentElement.style.setProperty(`--row-${i}-band`, band);
  document.documentElement.style.setProperty(`--row-${i}-card`, card);
});

/* ---------- the word pool ---------- */

function longestToken(word) {
  return word.split(' ').reduce((n, part) => Math.max(n, part.length), 0);
}

/* Words of `catIdx` that no other category in `idxs` also claims. A word listed
   under two categories is ambiguous, so it can only be dealt when its rival
   isn't on the board. `fits` is the mode's own rule about shape — the grid caps
   the length, the anagram wants no spaces — and is applied here rather than
   afterwards so the surviving order is the order a mode shuffles. */
function exclusiveWords(catIdx, idxs, fits) {
  const rivals = new Set();
  idxs.forEach(other => {
    if (other !== catIdx) CATEGORIES[other].words.forEach(w => rivals.add(w));
  });
  return CATEGORIES[catIdx].words.filter(
    w => !rivals.has(w) && (!fits || fits(w)));
}

/* Categories that overlap in meaning without sharing a word — a cobra belongs
   under Snakes and equally under Reptiles — declare each other in `conflicts`
   and never appear together. */
function categoriesClash(a, b) {
  const ca = CATEGORIES[a], cb = CATEGORIES[b];
  return (ca.conflicts || []).includes(cb.title) ||
         (cb.conflicts || []).includes(ca.title);
}

/* `count` categories that can each still field `need` words nothing else on the
   board claims. Every mode picks its categories this way; only `fits` and the
   numbers change. */
function pickCategories(rnd, count, need, fits) {
  const order = shuffled(CATEGORIES.map((_, i) => i), rnd);
  const picked = [];
  for (const idx of order) {
    if (picked.length === count) break;
    if (picked.some(c => categoriesClash(c, idx))) continue;
    const trial = picked.concat(idx);
    if (trial.every(c => exclusiveWords(c, trial, fits).length >= need)) picked.push(idx);
  }
  return picked;
}

/* ---------- puzzle seeds ----------

   A puzzle is identified by "<local date>-<number that day>": 20260813-1 is the
   first puzzle of 13 August, 20260813-45 the forty-fifth. Other modes carry
   their name in the middle — 20260813-anagram-1 — so each mode deals its own
   sequence and the grid's seeds are the ones they always were.

   The board is a pure function of that string, so the same seed deals the same
   puzzle on any device, and there's no limit on how many a day holds. Players
   only ever see the number, since the date is implied by playing today.

   The date comes from the device's own calendar day, so it turns over at the
   player's midnight rather than UTC's. */

function localDay(date) {
  const d = date || new Date();
  return String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
}

function dayLabel(day) {
  const d = new Date(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8));
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function seedFor(day, index, mode) {
  return (!mode || mode === 'grid') ? `${day}-${index}` : `${day}-${mode}-${index}`;
}

/* Stable string hash (xmur3) — same result on every engine, which is the whole
   point of seeding a shared puzzle from text. */
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

function seedRandom(day, index, mode) {
  return mulberry32(hashSeed(seedFor(day, index, mode)));
}

/* ---------- deterministic randomness ---------- */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- session state ----------

   Everything above the line belongs to the shell. Below it each mode keeps its
   own board on this object; see the header of the mode's file for which keys
   are its own. One object means one save path, whatever is being played. */

const state = {
  day: localDay(),     // YYYYMMDD the current puzzle belongs to
  mode: 'grid',
  level: 1,            // which puzzle of that day, within this mode

  moves: 0,
  hints: HINT_MAX,     // carried across puzzles and modes
  nextHintAt: 0,       // epoch ms the next refill lands, 0 when full
  hintsUsed: 0,        // this puzzle only, for the scorecard
  shuffleReadyAt: 0,   // epoch ms the shuffle button comes back
  elapsed: 0,
  done: false
};

let winTimer = null;   // pending win sheet, held back while we celebrate

function mode() { return MODES[state.mode] || MODES.grid; }

/* ---------- dom ---------- */

const appEl = document.getElementById('app');
const boardEl = document.getElementById('board');
const liveEl = document.getElementById('live');
const overlayEl = document.getElementById('overlay');
const sheetTitle = document.getElementById('sheet-title');
const sheetBody = document.getElementById('sheet-body');
const sheetActions = document.getElementById('sheet-actions');
const sheetVersion = document.getElementById('sheet-version');

function announce(msg) { liveEl.textContent = msg; }

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function vibrate(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
}

/* ---------- starting a puzzle ---------- */

/* Puzzle `level` of `day` in `modeId`. The shell resets the session, then hands
   over to the mode to build its board. */
function startPuzzle(day, level, modeId, restore) {
  const m = MODES[modeId || state.mode] || MODES.grid;

  state.day = day;
  state.level = level;
  state.mode = m.id;
  state.moves = restore ? (restore.moves | 0) : 0;
  state.elapsed = restore ? (restore.elapsed | 0) : 0;
  state.hintsUsed = restore ? (restore.hintsUsed | 0) : 0;
  state.done = false;

  /* Hints and the shuffle cooldown survive moving between puzzles and modes;
     only a save restores them, and only to something sane. */
  if (restore) {
    state.hints = Math.min(HINT_MAX, Math.max(0, restore.hints | 0));
    state.nextHintAt = restore.nextHintAt || 0;
    state.shuffleReadyAt = restore.shuffleReadyAt || 0;
  }
  grantDueHints();
  watchShuffleCooldown();

  clearTimeout(winTimer);  /* don't let a previous puzzle's sheet land on this one */
  boardEl.className = 'board mode-' + m.id;
  boardEl.textContent = '';

  m.start(restore && restore.game);
  refreshHud();
  save();
}

/* Another puzzle in the mode already in play. */
function startLevel(index, restore) {
  startPuzzle(state.day || localDay(), index, state.mode, restore);
}

/* The next puzzle is the next one today — if midnight has passed mid-session,
   that means the new day's first. */
function nextPuzzle() {
  const today = localDay();
  if (state.day !== today) startPuzzle(today, 1, state.mode);
  else startLevel(state.level + 1);
}

/* Switch modes, picking up where that mode was left off today. */
function switchMode(modeId) {
  if (!MODES[modeId]) return;
  const saved = loadSave(modeId);
  const today = localDay();
  if (saved && saved.day === today) {
    const level = Math.min(saved.level, nextUnlocked(modeId));
    startPuzzle(today, level, modeId, level === saved.level && validSave(modeId, saved) ? saved : null);
  } else {
    startPuzzle(today, 1, modeId);
  }
}

/* ---------- finishing ---------- */

function finish() {
  state.done = true;
  recordSolve();

  /* Any mode, any puzzle: playing once today keeps the streak alive. */
  const grew = state.day === localDay() && bumpStreak();
  refreshHud();
  if (grew) refreshStreak(true);
  save();
  vibrate([20, 60, 30]);
  announce(mode().doneMessage || 'Puzzle complete!');

  /* Hold the finished board on screen for a moment — the win sheet would
     cover the thing just achieved. */
  const celebrating = !prefersReducedMotion();
  if (celebrating) celebrate();

  clearTimeout(winTimer);
  winTimer = setTimeout(showWinSheet, celebrating ? 3200 : 800);
}

/* Three volleys: corners, then the board itself, then a lighter encore. */
function celebrate() {
  const corners = (count, power) => {
    fireConfetti({ x: 0, y: 1, angle: 62, spread: 55, count, power });
    fireConfetti({ x: 1, y: 1, angle: 118, spread: 55, count, power });
  };

  setTimeout(() => corners(55, 17), 220);
  setTimeout(() => fireConfetti({ x: .5, y: .55, angle: 90, spread: 150, count: 70, power: 12 }), 950);
  setTimeout(() => corners(35, 15), 1700);
}

function showWinSheet() {
  if (!state.done) return;
  const m = mode();
  const rows = m.winRows ? m.winRows() : [];
  const found = rows.map(r =>
    `<li><span class="chip" style="background:${r.color}"></span>${r.label}</li>`).join('');

  const stats = m.winStats ? m.winStats() : [
    { value: formatTime(state.elapsed), label: 'time' },
    { value: String(state.moves), label: m.counter },
    { value: String(state.hintsUsed), label: 'hints' }
  ];

  openSheet(`Puzzle #${state.level} solved! 🎉`, `
    <div class="result-grid">
      ${stats.map(s => `<div><strong>${s.value}</strong>${s.label}</div>`).join('')}
    </div>
    <ul class="solved-list">${found}</ul>`,
    [{ label: 'Next puzzle', primary: true, onClick: nextPuzzle }]
      .concat(m.winActions ? m.winActions() : []));
}

/* ---------- tools ---------- */

/* Hand over every refill that has come due — several, if the game has been
   closed for a while. Returns true when the stock changed. */
function grantDueHints() {
  if (state.hints >= HINT_MAX) { state.nextHintAt = 0; return false; }
  if (!state.nextHintAt) { state.nextHintAt = Date.now() + HINT_REFILL_MS; return false; }

  let granted = 0;
  while (state.hints < HINT_MAX && Date.now() >= state.nextHintAt) {
    state.hints++;
    granted++;
    state.nextHintAt = state.hints >= HINT_MAX ? 0 : state.nextHintAt + HINT_REFILL_MS;
  }
  return granted > 0;
}

function msToNextHint() {
  if (state.hints >= HINT_MAX || !state.nextHintAt) return 0;
  return Math.max(0, state.nextHintAt - Date.now());
}

/* The stock is the shell's; what a hint *does* belongs to the mode. */
function useHint() {
  if (state.hints <= 0 || state.done) return;
  const m = mode();
  if (!m.hint) return;

  if (m.hint() === false) return;   // nothing left to give away

  /* the clock starts the moment the stock drops below full */
  if (state.hints >= HINT_MAX) state.nextHintAt = Date.now() + HINT_REFILL_MS;
  state.hints--;
  state.hintsUsed++;
  refreshHud();
  save();
}

function msToShuffle() {
  return Math.max(0, (state.shuffleReadyAt || 0) - Date.now());
}

/* Ticked faster than the one-second clock so five seconds counts down cleanly
   and the button returns the moment it's due. */
let shuffleTimer = null;

function watchShuffleCooldown() {
  clearInterval(shuffleTimer);
  refreshShuffleButton();
  if (msToShuffle() <= 0) return;
  shuffleTimer = setInterval(() => {
    refreshShuffleButton();
    if (msToShuffle() <= 0) { clearInterval(shuffleTimer); shuffleTimer = null; }
  }, 200);
}

function refreshShuffleButton() {
  const btn = document.getElementById('btn-shuffle');
  const label = document.getElementById('shuffle-label');
  const secs = Math.ceil(msToShuffle() / 1000);
  const cooling = secs > 0 && !state.done;

  btn.disabled = cooling || state.done;
  btn.classList.toggle('waiting', cooling);
  label.textContent = cooling ? `${secs}s` : 'Shuffle';
  btn.setAttribute('aria-label',
    cooling ? `Shuffle, ready in ${secs} second${secs === 1 ? '' : 's'}` : 'Shuffle');
}

function doShuffle() {
  if (state.done || msToShuffle() > 0) return;
  const m = mode();
  if (!m.shuffle) return;
  m.shuffle();
  state.shuffleReadyAt = Date.now() + SHUFFLE_COOLDOWN_MS;
  watchShuffleCooldown();
}

/* ---------- hud, timer ---------- */

let timerId = null;

function refreshHud() {
  const m = mode();
  document.getElementById('level-num').textContent = String(state.level);
  document.getElementById('moves').textContent = String(state.moves);
  document.getElementById('moves-label').textContent = ' ' + m.counter;
  document.getElementById('timer').textContent = formatTime(state.elapsed);
  refreshStreak(false);
  refreshHintButton();
  refreshShuffleButton();

  /* a finished puzzle has nothing to hint or shuffle — the way on takes over */
  document.getElementById('btn-hint').hidden = state.done || !m.hint;
  document.getElementById('btn-shuffle').hidden = state.done || !m.shuffle;
  document.getElementById('btn-next').hidden = !state.done;
}

/* With hints in stock the button counts them; with none it counts down to the
   next one, so the wait is visible rather than a dead button. */
function refreshHintButton() {
  const btn = document.getElementById('btn-hint');
  const badge = document.getElementById('hint-count');
  const label = document.getElementById('hint-label');
  const waiting = state.hints <= 0 && msToNextHint() > 0;

  btn.disabled = state.hints <= 0 || state.done;
  btn.classList.toggle('waiting', waiting && !state.done);
  badge.hidden = state.hints <= 0;
  badge.textContent = String(state.hints);
  label.textContent = waiting && !state.done
    ? formatTime(Math.ceil(msToNextHint() / 1000))
    : 'Hint';
  btn.setAttribute('aria-label', waiting && !state.done
    ? `Hint, none left, next in ${formatTime(Math.ceil(msToNextHint() / 1000))}`
    : `Hint, ${state.hints} left`);
}

/* The flame lights once anything has been finished today and greys out again at
   midnight, so it always shows whether today is still outstanding. */
let streakShownFor = '';

function refreshStreak(bumped) {
  const { count, todayDone } = currentStreak();
  const el = document.getElementById('streak');
  streakShownFor = localDay();

  document.getElementById('streak-count').textContent = String(count);
  el.classList.toggle('lit', todayDone);
  el.setAttribute('aria-label', count === 0
    ? 'No streak yet — finish a puzzle today to start one'
    : `${count} day streak, ${todayDone ? 'played today' : 'not played today'}`);

  if (bumped && !prefersReducedMotion()) {
    el.classList.remove('bumped');
    void el.offsetWidth;
    el.classList.add('bumped');
  }
}

function formatTime(s) {
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function tick() {
  /* Hints refill on wall-clock time, so they keep running while the puzzle is
     finished or the tab is in the background. */
  if (grantDueHints()) {
    announce(state.hints === 1 ? 'A hint is available.' : `${state.hints} hints available.`);
    vibrate(12);
    save();
  }
  refreshHintButton();
  /* midnight rolls the flame back to grey without a reload */
  if (streakShownFor !== localDay()) refreshStreak(false);

  if (state.done || document.hidden) return;
  state.elapsed++;
  document.getElementById('timer').textContent = formatTime(state.elapsed);
  if (state.elapsed % 10 === 0) save();
}

/* ---------- persistence ---------- */

/* { grid: {...}, odd: {...} } — one entry per mode, plus lastMode. */
function loadSaves() {
  let all = null;
  try { all = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { /* ignore */ }
  if (all && all.modes) return all;

  /* the single-mode save this replaced, so an upgrade mid-puzzle keeps it */
  try {
    const old = JSON.parse(localStorage.getItem(SAVE_LEGACY_KEY) || 'null');
    if (old && Array.isArray(old.board)) {
      return { lastMode: 'grid', modes: { grid: Object.assign({ mode: 'grid', game: old }, old) } };
    }
  } catch (e) { /* ignore */ }
  return { lastMode: 'grid', modes: {} };
}

function loadSave(modeId) {
  const s = loadSaves().modes[modeId];
  return s && s.day ? s : null;
}

function validSave(modeId, saved) {
  const m = MODES[modeId];
  return !!(m && saved && saved.game && (!m.validate || m.validate(saved.game)));
}

function save() {
  const all = loadSaves();
  all.lastMode = state.mode;
  all.modes[state.mode] = {
    day: state.day,
    level: state.level,
    mode: state.mode,
    moves: state.moves,
    hints: state.hints,
    nextHintAt: state.nextHintAt,
    hintsUsed: state.hintsUsed,
    shuffleReadyAt: state.shuffleReadyAt,
    elapsed: state.elapsed,
    game: mode().serialize ? mode().serialize() : null
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(all));
  } catch (e) { /* private mode — play on without saving */ }
}

/* The full solve log, oldest first. Entries from before there were modes have
   no `mode`, and were all grid. */
function loadHistory() {
  try {
    const all = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(all) ? all : [];
  } catch (e) { return []; }
}

/* Puzzles are played in order within a mode: the highest number open today is
   one past the highest solved. Derived from the solve log rather than tracked
   separately, so it can't drift out of step with what was actually finished. */
function highestSolvedToday(modeId) {
  const today = localDay();
  const want = modeId || state.mode;
  return loadHistory().reduce(
    (n, h) => h.day === today && (h.mode || 'grid') === want ? Math.max(n, h.puzzle) : n, 0);
}

function nextUnlocked(modeId) { return highestSolvedToday(modeId) + 1; }

function recordSolve() {
  const entry = {
    seed: seedFor(state.day, state.level, state.mode),
    day: state.day,
    mode: state.mode,
    puzzle: state.level,
    solvedAt: Date.now(),
    seconds: state.elapsed,
    moves: state.moves,
    hints: state.hintsUsed
  };
  try {
    const all = loadHistory();
    all.push(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(all.slice(-HISTORY_MAX)));
  } catch (e) { /* storage blocked or full — losing the log mustn't stop play */ }
  return entry;
}

function dayBefore(day) {
  const d = new Date(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8));
  d.setDate(d.getDate() - 1);
  return localDay(d);
}

function loadStreak() {
  try {
    const s = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null');
    if (s && typeof s.count === 'number' && typeof s.lastDay === 'string') return s;
  } catch (e) { /* fall through */ }
  return { count: 0, lastDay: '' };
}

/* Where the streak stands right now. It survives the day after it last
   advanced — that's the day the player still has time to keep it alive — and
   is spent once a whole day passes without a puzzle. */
function currentStreak() {
  const s = loadStreak();
  const today = localDay();
  if (s.lastDay === today) return { count: s.count, todayDone: true };
  if (s.lastDay === dayBefore(today)) return { count: s.count, todayDone: false };
  return { count: 0, todayDone: false };
}

/* Called when any puzzle in any mode is solved. */
function bumpStreak() {
  const today = localDay();
  const s = loadStreak();
  if (s.lastDay === today) return false;      // already counted today
  s.count = s.lastDay === dayBefore(today) ? s.count + 1 : 1;
  s.lastDay = today;
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  return true;
}

/* ---------- overlays ---------- */

function openSheet(title, bodyHtml, actions, showVersion) {
  sheetTitle.textContent = title;
  sheetBody.innerHTML = bodyHtml;
  sheetActions.textContent = '';
  sheetVersion.textContent = `v${APP_VERSION} · ${APP_BUILD}`;
  sheetVersion.hidden = !showVersion;
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn' + (a.primary ? ' primary' : '');
    if (a.icon) b.insertAdjacentHTML('beforeend', a.icon);
    const label = document.createElement('span');
    label.className = 'btn-label';
    label.textContent = a.label;
    b.appendChild(label);
    b.addEventListener('click', () => {
      if (!a.keepOpen) closeSheet();
      a.onClick && a.onClick(b);
    });
    sheetActions.appendChild(b);
  });
  overlayEl.hidden = false;
  /* the board and toolbar are behind a dialog — take them out of reach so a
     stray tap or a screen reader can't land on the buttons underneath */
  appEl.inert = true;

  /* scroll only when the content really doesn't fit (see .sheet.scrollable) */
  const sheet = overlayEl.querySelector('.sheet');
  sheet.classList.remove('scrollable');
  if (sheet.scrollHeight > sheet.clientHeight + 1) sheet.classList.add('scrollable');
}

function closeSheet() {
  overlayEl.hidden = true;
  appEl.inert = false;
}

/* The menu: which game to play, and the rules of the one in play. */
function showMenu() {
  const cards = MODE_ORDER.map(id => {
    const m = MODES[id];
    const here = id === state.mode ? ' current' : '';
    return `<button class="mode-card${here}" data-mode="${id}">
      <span class="mode-icon" style="background:${m.tint}"></span>
      <span class="mode-text"><strong>${m.name}</strong>${m.blurb}</span>
    </button>`;
  }).join('');

  openSheet('Games', `<div class="mode-list">${cards}</div>`,
    [{ label: 'How to play', onClick: showHelp }, { label: 'Close', primary: true }], true);

  sheetBody.querySelectorAll('.mode-card').forEach(btn => {
    btn.addEventListener('click', () => {
      closeSheet();
      if (btn.dataset.mode !== state.mode) switchMode(btn.dataset.mode);
    });
  });
}

function showHelp() {
  const m = mode();
  const actions = [{ label: 'Got it', primary: true }];
  if (state.day !== localDay()) {
    actions.push({ label: "Today's first puzzle", onClick: () => startPuzzle(localDay(), 1, state.mode) });
  }

  openSheet(m.name, `
    <p class="sheet-sub">Puzzle ${state.level} · ${dayLabel(state.day)}</p>
    <ul>
      ${m.help.map(li => `<li>${li}</li>`).join('')}
      <li>Play as many as you like — they unlock in order, so finish one to
          reach the next. Everyone gets the same puzzles in the same order each
          day, so times are worth comparing.</li>
      <li>Finish a puzzle in any game today to keep your streak — the flame
          lights up once you have, and goes out if you miss a day.</li>
    </ul>`, actions, true);
}

/* ---------- wiring ---------- */

document.getElementById('btn-hint').addEventListener('click', useHint);
document.getElementById('btn-shuffle').addEventListener('click', doShuffle);
document.getElementById('btn-menu').addEventListener('click', showMenu);
document.getElementById('btn-next').addEventListener('click', nextPuzzle);

/* Tapping the backdrop — including the gap around the dialog — dismisses it. */
overlayEl.addEventListener('click', e => {
  if (e.target === overlayEl || e.target.classList.contains('sheet-wrap')) closeSheet();
});

let resizeId = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeId);
  resizeId = setTimeout(() => { const m = mode(); m.fit && m.fit(); }, 120);
});

/* Belt and braces against page-level pinch/scroll interfering with drags. */
document.addEventListener('gesturestart', e => e.preventDefault());

/* ---------- the mode registry ---------- */

const MODES = {
  grid: GRID_MODE,
  odd: ODD_MODE,
  anagram: ANAGRAM_MODE,
  chunks: CHUNKS_MODE
};
const MODE_ORDER = ['grid', 'odd', 'anagram', 'chunks'];

/* ---------- startup ----------

   Yesterday's part-finished board is stale news — a new day starts at its own
   first puzzle. Within the same day the save is honoured, in whichever mode was
   last played. */
const savedAll = loadSaves();
const savedGame = savedAll.modes[savedAll.lastMode] || null;

if (savedGame) {
  /* the hint stock refills on real time, so it isn't the day's to reset */
  state.hints = Math.min(HINT_MAX, Math.max(0, savedGame.hints | 0));
  state.nextHintAt = savedGame.nextHintAt || 0;
}

if (savedGame && savedGame.day === localDay() && MODES[savedAll.lastMode]) {
  /* never resume past what's been unlocked, whatever the save claims */
  const level = Math.min(savedGame.level, nextUnlocked(savedAll.lastMode));
  const intact = level === savedGame.level && validSave(savedAll.lastMode, savedGame);
  startPuzzle(savedGame.day, level, savedAll.lastMode, intact ? savedGame : null);
} else {
  startPuzzle(localDay(), 1, 'grid');
}
if (!savedGame) showHelp();
timerId = setInterval(tick, 1000);
document.fonts && document.fonts.ready.then(() => { const m = mode(); m.fit && m.fit(); });
