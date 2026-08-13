/* Word Connect — drag related words into the same row.
   State lives in `board` (24 slots, row-major). Everything else renders from it. */

'use strict';

const ROWS = 6;
const COLS = 4;
const SLOTS = ROWS * COLS;
/* Hints are a stock, not a per-puzzle allowance: one arrives every five
   minutes up to a maximum of three. Refills are counted from wall-clock
   timestamps, so they keep coming while the game is closed — and so that
   starting a new puzzle can't be used to top them up. */
const HINT_MAX = 3;
const HINT_REFILL_MS = 5 * 60 * 1000;

/* Shuffling repeatedly is a way to have the game solve rows for you by chance,
   so the button sits out five seconds after each use. */
const SHUFFLE_COOLDOWN_MS = 5000;
const STORE_KEY = 'word-connect-save-v1';

/* Every solve is logged against its seed. Nothing reads it yet — it's the
   record a stats or streaks screen would be built from. Oldest entries fall
   off the end so it can't grow without limit. */
const HISTORY_KEY = 'word-connect-history-v1';
const HISTORY_MAX = 500;

/* Daily streak: days in a row on which the player finished that day's first
   puzzle. Kept as a count plus the day it last advanced, rather than counted
   out of the solve log, so a long streak can't be lost to the log's cap. */
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

/* Longest word we will deal. Every card on a board shares one type size, so a
   single long word would shrink all twenty-four; over this length a word is
   simply left in the pool undealt. Spaces are free — "POLE VAULT" wraps. */
const MAX_WORD_LEN = 8;

function longestToken(word) {
  return word.split(' ').reduce((n, part) => Math.max(n, part.length), 0);
}

/* ---------- puzzle seeds ----------

   A puzzle is identified by "<local date>-<number that day>": 20260813-1 is the
   first puzzle of 13 August, 20260813-45 the forty-fifth. The board is a pure
   function of that string, so the same seed deals the same cards on any device,
   and there's no limit on how many puzzles a day holds. Players only ever see
   the number — Puzzle 1, Puzzle 2 — since the date is implied by playing today.

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

function seedFor(day, index) { return `${day}-${index}`; }

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

/* ---------- puzzle construction ---------- */

/* Words of `catIdx` that no other category in `idxs` also claims. A word listed
   under two categories is ambiguous, so it can only be dealt when its rival
   isn't on the board. */
function exclusiveWords(catIdx, idxs) {
  const rivals = new Set();
  idxs.forEach(other => {
    if (other !== catIdx) CATEGORIES[other].words.forEach(w => rivals.add(w));
  });
  return CATEGORIES[catIdx].words.filter(
    w => !rivals.has(w) && longestToken(w) <= MAX_WORD_LEN);
}

/* Six categories that can each still field four unambiguous words, then four
   words from each, then the lot shuffled across the board. */
function buildPuzzle(day, index) {
  const rnd = mulberry32(hashSeed(seedFor(day, index)));
  const order = shuffled(CATEGORIES.map((_, i) => i), rnd);

  const picked = [];
  for (const idx of order) {
    if (picked.length === ROWS) break;
    const trial = picked.concat(idx);
    if (trial.every(c => exclusiveWords(c, trial).length >= COLS)) picked.push(idx);
  }

  const groups = picked.map((catIdx, g) => ({
    catIdx,
    title: CATEGORIES[catIdx].title,
    color: ROW_COLORS[g % ROW_COLORS.length][0],
    cardColor: ROW_COLORS[g % ROW_COLORS.length][1],
    words: shuffled(exclusiveWords(catIdx, picked), rnd).slice(0, COLS)
  }));

  const cards = [];
  groups.forEach((g, gi) => g.words.forEach(w => cards.push({ word: w, group: gi })));

  /* Shuffle until no row is accidentally already complete. */
  let board;
  for (let attempt = 0; attempt < 200; attempt++) {
    board = shuffled(cards, rnd);
    if (!hasCompleteRow(board)) break;
  }
  return { groups, board };
}

function hasCompleteRow(board) {
  for (let r = 0; r < ROWS; r++) {
    const g = board[r * COLS].group;
    let same = true;
    for (let c = 1; c < COLS; c++) if (board[r * COLS + c].group !== g) { same = false; break; }
    if (same) return true;
  }
  return false;
}

/* ---------- game state ---------- */

const state = {
  day: localDay(),     // YYYYMMDD the current puzzle belongs to
  level: 1,            // which puzzle of that day

  groups: [],
  board: [],          // 24 cards: { word, group }
  locked: [],         // per row: group index, or -1
  moves: 0,
  hints: HINT_MAX,     // carried across puzzles
  nextHintAt: 0,       // epoch ms the next refill lands, 0 when full
  hintsUsed: 0,        // this puzzle only, for the scorecard
  shuffleReadyAt: 0,   // epoch ms the shuffle button comes back
  elapsed: 0,
  done: false
};

let cardEls = new Map();   // word -> element
let rowEls = [];           // { row, label }
let selected = null;       // index of the tapped card awaiting a partner
let winTimer = null;       // pending win sheet, held back while we celebrate

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

/* ---------- setup ---------- */

/* Puzzle `index` of `day`. startLevel() is the shorthand for another puzzle on
   the day already in play. */
function startLevel(index, restore) {
  startPuzzle(state.day || localDay(), index, restore);
}

/* The next puzzle is the next one today — if midnight has passed mid-session,
   that means the new day's first. */
function nextPuzzle() {
  const today = localDay();
  if (state.day !== today) startPuzzle(today, 1);
  else startLevel(state.level + 1);
}

function startPuzzle(day, level, restore) {
  const puzzle = buildPuzzle(day, level);

  /* A save from an older word list can't be trusted — start the level clean. */
  if (restore) {
    const expected = new Set(puzzle.board.map(c => c.word));
    const ok = restore.board.length === SLOTS &&
      restore.board.every(c => c && expected.has(c.word) && c.group >= 0 && c.group < ROWS);
    if (!ok) restore = null;
  }

  state.day = day;
  state.level = level;
  state.groups = puzzle.groups;
  state.board = restore ? restore.board.map(c => ({ word: c.word, group: c.group })) : puzzle.board;
  state.locked = restore ? restore.locked.slice() : new Array(ROWS).fill(-1);
  state.moves = restore ? restore.moves : 0;
  state.elapsed = restore ? restore.elapsed : 0;
  state.hintsUsed = restore ? (restore.hintsUsed || 0) : 0;
  /* Hints survive moving to another puzzle; only a save restores them. */
  if (restore) {
    state.hints = Math.min(HINT_MAX, Math.max(0, restore.hints | 0));
    state.nextHintAt = restore.nextHintAt || 0;
    state.shuffleReadyAt = restore.shuffleReadyAt || 0;
  }
  grantDueHints();
  watchShuffleCooldown();
  /* a restored board may already be finished — reloading on one should offer
     the way on, not a hint button with nothing left to hint */
  state.done = state.locked.every(g => g >= 0);
  selected = null;
  clearTimeout(winTimer);  /* don't let a previous puzzle's sheet land on this one */

  buildDom();
  applyBoard(false);
  fitAllText();
  for (let r = 0; r < ROWS; r++) if (state.locked[r] >= 0) paintRow(r, false);
  refreshHud();
  dealIn();
  save();
}

/* Cards drop onto the board in reading order rather than simply appearing. */
function dealIn() {
  if (prefersReducedMotion()) return;
  for (let i = 0; i < SLOTS; i++) {
    const el = cardEls.get(state.board[i].word);
    el.animate(
      [{ transform: 'translateY(14px) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 320, delay: i * 11, easing: 'cubic-bezier(.2,.9,.3,1.05)', fill: 'backwards' }
    );
  }
}

function buildDom() {
  boardEl.textContent = '';
  cardEls = new Map();
  rowEls = [];

  for (let r = 0; r < ROWS; r++) {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset.row = String(r);
    row.setAttribute('role', 'row');

    const label = document.createElement('div');
    label.className = 'row-label';
    row.appendChild(label);

    boardEl.appendChild(row);
    rowEls.push({ row, label });
  }

  for (const card of state.board) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'card';
    el.setAttribute('role', 'gridcell');
    el.dataset.word = card.word;

    const text = document.createElement('span');
    text.className = 'card-text';
    text.textContent = card.word;
    el.appendChild(text);

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('click', e => e.preventDefault());
    el.addEventListener('keydown', onCardKeyDown);
    el.addEventListener('contextmenu', e => e.preventDefault());

    cardEls.set(card.word, el);
  }
}

/* Put every card in its slot; animate the ones that moved (FLIP). */
function applyBoard(animate) {
  const before = new Map();
  if (animate) {
    cardEls.forEach((el, word) => {
      if (el.isConnected) before.set(word, el.getBoundingClientRect());
    });
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const card = state.board[r * COLS + c];
      rowEls[r].row.appendChild(cardEls.get(card.word));
    }
  }

  if (animate && !prefersReducedMotion()) {
    cardEls.forEach((el, word) => {
      const from = before.get(word);
      if (!from) return;
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (!dx && !dy) return;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: 300, easing: 'cubic-bezier(.34,1.32,.44,1)' }  /* settles with a nudge */
      );
    });
  }

  updateAria();
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function updateAria() {
  for (let r = 0; r < ROWS; r++) {
    const lockedGroup = state.locked[r];
    for (let c = 0; c < COLS; c++) {
      const el = cardEls.get(state.board[r * COLS + c].word);
      const where = `row ${r + 1}, position ${c + 1}`;
      el.setAttribute('aria-label',
        lockedGroup >= 0
          ? `${state.board[r * COLS + c].word}, locked in ${state.groups[lockedGroup].title}`
          : `${state.board[r * COLS + c].word}, ${where}`);
      el.disabled = lockedGroup >= 0;
    }
  }
}

/* One type size for the whole board: the largest at which every card fits.
   Varying sizes card to card read as an accident, so the board shares a size
   and only a card that still overflows at the floor is shrunk on its own.
   Geometry doesn't change when cards swap, so this runs per deal, not per move. */
const MIN_SHARED_SIZE = 11;

function fitAllText() {
  const els = [...cardEls.values()].filter(el => el.isConnected && el.clientWidth > 0);
  if (!els.length) return;

  const texts = els.map(el => el.firstChild);
  const room = els.map(el => ({ w: el.clientWidth - 6, h: el.clientHeight - 4 }));
  const setAll = size => texts.forEach(t => { t.style.fontSize = size + 'px'; });
  const overflows = i => texts[i].scrollWidth > room[i].w || texts[i].scrollHeight > room[i].h;
  const anyOverflow = () => texts.some((_, i) => overflows(i));

  let size = Math.min(21, Math.round(room[0].h * 0.44));
  setAll(size);
  while (size > MIN_SHARED_SIZE && anyOverflow()) {
    size -= 0.5;
    setAll(size);
  }

  /* a word too long even at the floor gets shrunk by itself */
  texts.forEach((text, i) => {
    let own = size;
    while (own > 7 && overflows(i)) {
      own -= 0.5;
      text.style.fontSize = own + 'px';
    }
  });
}

/* ---------- moves ---------- */

function rowOf(index) { return Math.floor(index / COLS); }
function isLockedIndex(index) { return state.locked[rowOf(index)] >= 0; }

function indexOfEl(el) {
  const word = el.dataset.word;
  return state.board.findIndex(c => c.word === word);
}

function swap(i, j, countMove) {
  if (i === j || i < 0 || j < 0) return false;
  if (isLockedIndex(i) || isLockedIndex(j)) return false;
  [state.board[i], state.board[j]] = [state.board[j], state.board[i]];
  if (countMove) state.moves++;
  return true;
}

function commit() {
  applyBoard(true);
  checkRows();
  refreshHud();
  save();
}

function checkRows() {
  let newlySolved = 0;
  for (let r = 0; r < ROWS; r++) {
    if (state.locked[r] >= 0) continue;
    const g = state.board[r * COLS].group;
    let same = true;
    for (let c = 1; c < COLS; c++) if (state.board[r * COLS + c].group !== g) { same = false; break; }
    if (!same) continue;
    state.locked[r] = g;
    paintRow(r, true);
    newlySolved++;
    announce(`${state.groups[g].title} complete.`);
  }
  if (newlySolved) {
    updateAria();
    if (state.locked.every(g => g >= 0)) finish();
  }
}

function paintRow(r, animate) {
  const { row, label } = rowEls[r];
  const g = state.groups[state.locked[r]];
  row.style.setProperty('--row-color', g.color);
  row.style.setProperty('--row-card-color', g.cardColor);
  row.classList.add('solved');
  label.textContent = g.title;
  for (let c = 0; c < COLS; c++) {
    const el = cardEls.get(state.board[r * COLS + c].word);
    el.classList.add('locked');
    el.classList.remove('selected', 'drop-target');
    if (animate && !prefersReducedMotion()) {
      el.classList.remove('pop');
      void el.offsetWidth;
      el.style.animationDelay = (c * 55) + 'ms';
      el.classList.add('pop');
    }
  }
  if (animate) vibrate(18);
}

function vibrate(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
}

/* ---------- selection (tap a card, then tap another) ---------- */

function setSelected(index) {
  if (selected !== null) {
    const prev = cardEls.get(state.board[selected].word);
    if (prev) prev.classList.remove('selected');
  }
  selected = index;
  if (index !== null) {
    cardEls.get(state.board[index].word).classList.add('selected');
    announce(`${state.board[index].word} selected. Choose a card to swap it with.`);
  }
}

function tapCard(index) {
  if (isLockedIndex(index) || state.done) return;
  if (selected === null) { setSelected(index); return; }
  if (selected === index) { setSelected(null); return; }
  const from = selected;
  setSelected(null);
  if (swap(from, index, true)) commit();
}

function onCardKeyDown(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  tapCard(indexOfEl(e.currentTarget));
}

/* ---------- drag and drop ---------- */

let drag = null;

function onPointerDown(e) {
  if (e.button !== undefined && e.button > 0) return;
  if (drag) return;  /* a second finger mustn't hijack the drag in progress */
  const el = e.currentTarget;
  const index = indexOfEl(el);
  if (index < 0 || isLockedIndex(index) || state.done) return;

  drag = {
    id: e.pointerId,
    index,
    el,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastT: performance.now(),
    tilt: 0,
    moved: false,
    ghost: null,
    target: null
  };
  el.classList.add('pressed');

  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;

  if (!drag.moved) {
    if (Math.hypot(dx, dy) < 8) return;
    drag.moved = true;
    drag.el.classList.remove('pressed');
    beginGhost(e.clientX, e.clientY);
    setSelected(null);
  }

  e.preventDefault();
  moveGhost(e.clientX, e.clientY);
  highlightTarget(e.clientX, e.clientY);
}

function beginGhost(x, y) {
  const rect = drag.el.getBoundingClientRect();
  const ghost = drag.el.cloneNode(true);
  ghost.classList.add('ghost');
  ghost.style.width = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  document.body.appendChild(ghost);
  drag.ghost = ghost;
  drag.baseX = rect.left;
  drag.baseY = rect.top;
  /* keep the card under the finger where it was first grabbed */
  drag.offsetX = Math.min(Math.max(drag.startX - rect.left, 0), rect.width);
  drag.offsetY = Math.min(Math.max(drag.startY - rect.top, 0), rect.height);
  drag.el.classList.add('dragging');
  moveGhost(x, y);
  vibrate(8);
}

function moveGhost(x, y) {
  /* lean into the direction of travel, eased so it doesn't jitter */
  const now = performance.now();
  const speed = (x - drag.lastX) / Math.max(now - drag.lastT, 8) * 16;
  drag.lastX = x;
  drag.lastT = now;
  drag.tilt += (Math.max(-8, Math.min(8, speed * 0.9)) - drag.tilt) * 0.25;

  drag.ghost.style.transform =
    `translate(${x - drag.offsetX - drag.baseX}px, ${y - drag.offsetY - drag.baseY}px)` +
    ` rotate(${drag.tilt.toFixed(2)}deg) scale(1.1)`;
}

function highlightTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  const card = el && el.closest ? el.closest('.card') : null;
  const valid = card && card !== drag.el && !card.classList.contains('ghost') &&
    !card.classList.contains('locked') ? card : null;

  if (drag.target === valid) return;
  if (drag.target) drag.target.classList.remove('drop-target');
  drag.target = valid;
  if (valid) valid.classList.add('drop-target');
}

function onPointerUp(e) {
  if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);

  const d = drag;
  drag = null;
  d.el.classList.remove('pressed');

  if (!d.moved) { tapCard(d.index); return; }

  if (d.ghost) d.ghost.remove();
  d.el.classList.remove('dragging');
  if (d.target) d.target.classList.remove('drop-target');

  if (e.type === 'pointercancel' || !d.target) return;

  const to = indexOfEl(d.target);
  const from = indexOfEl(d.el);
  if (swap(from, to, true)) commit();
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

function useHint() {
  if (state.hints <= 0 || state.done) return;
  /* the clock starts the moment the stock drops below full */
  if (state.hints >= HINT_MAX) state.nextHintAt = Date.now() + HINT_REFILL_MS;

  /* Find the (unsolved group, open row) pairing that is already closest. */
  let best = null;
  const openRows = [];
  for (let r = 0; r < ROWS; r++) if (state.locked[r] < 0) openRows.push(r);
  const openGroups = state.groups.map((_, g) => g).filter(g => !state.locked.includes(g));

  for (const g of openGroups) {
    for (const r of openRows) {
      let matches = 0;
      for (let c = 0; c < COLS; c++) if (state.board[r * COLS + c].group === g) matches++;
      if (!best || matches > best.matches) best = { g, r, matches };
    }
  }
  if (!best) return;

  /* Pull the group's stray cards into that row. */
  for (let c = 0; c < COLS; c++) {
    const slot = best.r * COLS + c;
    if (state.board[slot].group === best.g) continue;
    const donor = state.board.findIndex(
      (card, i) => card.group === best.g && !isLockedIndex(i) && rowOf(i) !== best.r
    );
    if (donor < 0) break;
    swap(slot, donor, false);
  }

  state.hints--;
  state.hintsUsed++;
  setSelected(null);
  commit();
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
  const open = [];
  for (let i = 0; i < SLOTS; i++) if (!isLockedIndex(i)) open.push(i);
  const cards = shuffled(open.map(i => state.board[i]), Math.random);
  open.forEach((slot, k) => { state.board[slot] = cards[k]; });
  setSelected(null);
  state.shuffleReadyAt = Date.now() + SHUFFLE_COOLDOWN_MS;
  watchShuffleCooldown();
  commit();
  announce('Cards shuffled.');
}

/* ---------- hud, timer, persistence ---------- */

let timerId = null;

function refreshHud() {
  document.getElementById('level-num').textContent = String(state.level);
  refreshStreak(false);
  document.getElementById('moves').textContent = String(state.moves);
  document.getElementById('timer').textContent = formatTime(state.elapsed);
  refreshHintButton();
  refreshShuffleButton();

  /* a finished board has nothing to hint or shuffle — the way on takes over */
  document.getElementById('btn-hint').hidden = state.done;
  document.getElementById('btn-shuffle').hidden = state.done;
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

/* The flame lights once the day's first puzzle is done and greys out again at
   midnight, so it always shows whether today is still outstanding. */
let streakShownFor = '';

function refreshStreak(bumped) {
  const { count, todayDone } = currentStreak();
  const el = document.getElementById('streak');
  streakShownFor = localDay();

  document.getElementById('streak-count').textContent = String(count);
  el.classList.toggle('lit', todayDone);
  el.setAttribute('aria-label', count === 0
    ? 'No streak yet — finish today\'s first puzzle to start one'
    : `${count} day streak, ${todayDone ? "today's first puzzle done" : 'today not played yet'}`);

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

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      day: state.day,
      level: state.level,
      board: state.board,
      locked: state.locked,
      moves: state.moves,
      hints: state.hints,
      nextHintAt: state.nextHintAt,
      hintsUsed: state.hintsUsed,
      shuffleReadyAt: state.shuffleReadyAt,
      elapsed: state.elapsed
    }));
  } catch (e) { /* private mode — play on without saving */ }
}

/* The full solve log, oldest first. */
function loadHistory() {
  try {
    const all = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(all) ? all : [];
  } catch (e) { return []; }
}

/* Puzzles are played in order: the highest number open today is one past the
   highest solved. Derived from the solve log rather than tracked separately,
   so it can't drift out of step with what was actually finished. */
function highestSolvedToday() {
  const today = localDay();
  return loadHistory().reduce((n, h) => h.day === today ? Math.max(n, h.puzzle) : n, 0);
}

function nextUnlocked() { return highestSolvedToday() + 1; }

function recordSolve() {
  const entry = {
    seed: seedFor(state.day, state.level),
    day: state.day,
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
   is spent once a whole day passes without the first puzzle. */
function currentStreak() {
  const s = loadStreak();
  const today = localDay();
  if (s.lastDay === today) return { count: s.count, todayDone: true };
  if (s.lastDay === dayBefore(today)) return { count: s.count, todayDone: false };
  return { count: 0, todayDone: false };
}

/* Called when the day's first puzzle is solved. */
function bumpStreak() {
  const today = localDay();
  const s = loadStreak();
  if (s.lastDay === today) return false;      // already counted today
  s.count = s.lastDay === dayBefore(today) ? s.count + 1 : 1;
  s.lastDay = today;
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  return true;
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.board) || s.board.length !== SLOTS) return null;
    if (!Array.isArray(s.locked) || s.locked.length !== ROWS) return null;
    return s;
  } catch (e) { return null; }
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
}

function closeSheet() {
  overlayEl.hidden = true;
  appEl.inert = false;
}

function finish() {
  state.done = true;
  recordSolve();

  /* only the day's first puzzle, and only on the day it belongs to */
  const grew = state.level === 1 && state.day === localDay() && bumpStreak();
  refreshHud();
  if (grew) refreshStreak(true);
  save();
  vibrate([20, 60, 30]);
  announce('All six groups complete!');

  /* Hold the finished board on screen for a moment — the last row's cards are
     still popping, and the win sheet would cover the thing just achieved. */
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
  const found = state.groups.map(g =>
    `<li><span class="chip" style="background:${g.cardColor}"></span>${g.title}</li>`).join('');
  openSheet(`Puzzle #${state.level} solved! 🎉`, `
    <div class="result-grid">
      <div><strong>${formatTime(state.elapsed)}</strong>time</div>
      <div><strong>${state.moves}</strong>moves</div>
      <div><strong>${state.hintsUsed}</strong>hints</div>
    </div>
    <ul class="solved-list">${found}</ul>`, [
    { label: 'Next puzzle', primary: true, onClick: nextPuzzle },
    { label: 'Share result', icon: SHARE_ICON, keepOpen: true, onClick: shareResult }
  ]);
}

/* One dot linked to two — kept on a single line so the button's accessible
   name is just its label. */
const SHARE_ICON = '<svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="m8.6 10.9 6.8-3.8M8.6 13.1l6.8 3.8"/>' +
  '<circle cx="6" cy="12" r="2.7"/><circle cx="18" cy="6" r="2.7"/>' +
  '<circle cx="18" cy="18" r="2.7"/></svg>';

/* Hand the result to the share sheet where there is one, otherwise the
   clipboard. The puzzle number is the point: it identifies the exact board. */
async function shareResult(btn) {
  const hints = `${state.hintsUsed} hint${state.hintsUsed === 1 ? '' : 's'}`;
  const url = (location.origin + location.pathname).replace(/index\.html$/, '');
  const when = new Date(+state.day.slice(0, 4), +state.day.slice(4, 6) - 1, +state.day.slice(6, 8))
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const text = `Word Connect · ${when} · Puzzle ${state.level}\n` +
    `${formatTime(state.elapsed)} · ${state.moves} moves · ${hints}\n${url}`;

  const say = msg => {
    const el = btn.querySelector('.btn-label') || btn;
    const was = el.textContent;
    el.textContent = msg;
    announce(msg);
    setTimeout(() => { el.textContent = was; }, 1600);
  };

  try {
    if (navigator.share) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    say('Copied!');
  } catch (err) {
    if (err && err.name === 'AbortError') return;   // share sheet dismissed
    say('Copy failed');
  }
}

function showHelp() {
  const actions = [{ label: 'Got it', primary: true }];
  if (state.day !== localDay()) {
    actions.push({ label: "Today's first puzzle", onClick: () => startPuzzle(localDay(), 1) });
  }

  openSheet('How to play', `
    <p class="sheet-sub">Puzzle ${state.level} · ${dayLabel(state.day)}</p>
    <ul>
      <li>Every row should end up holding four related words.</li>
      <li>Drag a card onto another to swap the two.</li>
      <li>Prefer tapping? Tap one card, then tap the card to swap it with.</li>
      <li>Complete a row and it locks, revealing the group name.</li>
      <li>Clear all six rows to finish the puzzle.</li>
      <li>A hint fills in a row. You get one back every five minutes, up to
          three — the button counts down to the next.</li>
      <li>Play as many as you like — they unlock in order, so finish one to
          reach the next. Everyone gets the same puzzles in the same order each
          day, so times are worth comparing.</li>
      <li>Finish the day's first puzzle to keep your streak — the flame lights
          up once it's done, and goes out if you miss a day.</li>
    </ul>`, actions, true);
}

/* ---------- wiring ---------- */

document.getElementById('btn-hint').addEventListener('click', useHint);
document.getElementById('btn-shuffle').addEventListener('click', doShuffle);
document.getElementById('btn-menu').addEventListener('click', showHelp);
document.getElementById('btn-next').addEventListener('click', nextPuzzle);

/* Tapping the backdrop — including the gap around the dialog — dismisses it. */
overlayEl.addEventListener('click', e => {
  if (e.target === overlayEl || e.target.classList.contains('sheet-wrap')) closeSheet();
});

let resizeId = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeId);
  resizeId = setTimeout(fitAllText, 120);
});

/* Belt and braces against page-level pinch/scroll interfering with drags. */
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (drag && drag.moved) e.preventDefault(); },
  { passive: false });

/* Yesterday's part-finished board is stale news — a new day starts at its own
   first puzzle. Within the same day the save is honoured, whichever puzzle of
   that day was in play. */
const saved = load();
if (saved && saved.day === localDay()) {
  /* never resume past what's been unlocked, whatever the save claims */
  const level = Math.min(saved.level, nextUnlocked());
  startPuzzle(saved.day, level, level === saved.level ? saved : null);
} else {
  /* the hint stock refills on real time, so it isn't the day's to reset */
  if (saved) {
    state.hints = Math.min(HINT_MAX, Math.max(0, saved.hints | 0));
    state.nextHintAt = saved.nextHintAt || 0;
  }
  startPuzzle(localDay(), 1);
}
if (!saved) showHelp();
timerId = setInterval(tick, 1000);
document.fonts && document.fonts.ready.then(fitAllText);
