/* Word Connect — drag related words into the same row.
   State lives in `board` (24 slots, row-major). Everything else renders from it. */

'use strict';

const ROWS = 6;
const COLS = 4;
const SLOTS = ROWS * COLS;
const HINTS_PER_PUZZLE = 3;
const STORE_KEY = 'word-connect-save-v1';

/* One colour per row-group, in the order the groups were dealt:
   [band behind the row, face of the locked cards]. */
const ROW_COLORS = [
  ['#f5b463', '#ee9b32'],
  ['#ffe587', '#ffd84f'],
  ['#8adf9c', '#5ccd77'],
  ['#9ad7f8', '#6cc0ef'],
  ['#e0b2f5', '#cd90ec'],
  ['#ffb3b3', '#fb8c8c']
];

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
  return CATEGORIES[catIdx].words.filter(w => !rivals.has(w));
}

/* Six categories that can each still field four unambiguous words, then four
   words from each, then the lot shuffled across the board. */
function buildPuzzle(level) {
  const rnd = mulberry32(level * 2654435761 + 12345);
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
  level: 1,
  groups: [],
  board: [],          // 24 cards: { word, group }
  locked: [],         // per row: group index, or -1
  moves: 0,
  hints: HINTS_PER_PUZZLE,
  elapsed: 0,
  done: false
};

let cardEls = new Map();   // word -> element
let rowEls = [];           // { row, label }
let selected = null;       // index of the tapped card awaiting a partner
let winTimer = null;       // pending win sheet, held back while we celebrate

/* ---------- dom ---------- */

const boardEl = document.getElementById('board');
const liveEl = document.getElementById('live');
const overlayEl = document.getElementById('overlay');
const sheetTitle = document.getElementById('sheet-title');
const sheetBody = document.getElementById('sheet-body');
const sheetActions = document.getElementById('sheet-actions');
const sheetVersion = document.getElementById('sheet-version');

function announce(msg) { liveEl.textContent = msg; }

/* ---------- setup ---------- */

function startLevel(level, restore) {
  const puzzle = buildPuzzle(level);

  /* A save from an older word list can't be trusted — start the level clean. */
  if (restore) {
    const expected = new Set(puzzle.board.map(c => c.word));
    const ok = restore.board.length === SLOTS &&
      restore.board.every(c => c && expected.has(c.word) && c.group >= 0 && c.group < ROWS);
    if (!ok) restore = null;
  }

  state.level = level;
  state.groups = puzzle.groups;
  state.board = restore ? restore.board.map(c => ({ word: c.word, group: c.group })) : puzzle.board;
  state.locked = restore ? restore.locked.slice() : new Array(ROWS).fill(-1);
  state.moves = restore ? restore.moves : 0;
  state.hints = restore ? restore.hints : HINTS_PER_PUZZLE;
  state.elapsed = restore ? restore.elapsed : 0;
  state.done = false;
  selected = null;
  clearTimeout(winTimer);  /* don't let a previous puzzle's sheet land on this one */

  buildDom();
  applyBoard(false);
  for (let r = 0; r < ROWS; r++) if (state.locked[r] >= 0) paintRow(r, false);
  refreshHud();
  save();
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
        { duration: 230, easing: 'cubic-bezier(.2,.85,.3,1)' }
      );
    });
  }

  fitAllText();
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

/* Shrink the label until it fits its card. */
function fitAllText() {
  cardEls.forEach(el => {
    const text = el.firstChild;
    const maxW = el.clientWidth - 6;
    const maxH = el.clientHeight - 4;
    if (maxW <= 0 || maxH <= 0) return;
    let size = Math.min(20, Math.round(maxH * 0.42));
    text.style.fontSize = size + 'px';
    while (size > 7 && (text.scrollWidth > maxW || text.scrollHeight > maxH)) {
      size -= 0.5;
      text.style.fontSize = size + 'px';
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
    moved: false,
    ghost: null,
    target: null
  };

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
  drag.ghost.style.transform =
    `translate(${x - drag.offsetX - drag.baseX}px, ${y - drag.offsetY - drag.baseY}px) scale(1.1)`;
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

function useHint() {
  if (state.hints <= 0 || state.done) return;

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
  setSelected(null);
  commit();
}

function doShuffle() {
  if (state.done) return;
  const open = [];
  for (let i = 0; i < SLOTS; i++) if (!isLockedIndex(i)) open.push(i);
  const cards = shuffled(open.map(i => state.board[i]), Math.random);
  open.forEach((slot, k) => { state.board[slot] = cards[k]; });
  setSelected(null);
  commit();
  announce('Cards shuffled.');
}

/* ---------- hud, timer, persistence ---------- */

let timerId = null;

function refreshHud() {
  document.getElementById('level-num').textContent = String(state.level);
  document.getElementById('solved-count').textContent =
    String(state.locked.filter(g => g >= 0).length);
  document.getElementById('moves').textContent = String(state.moves);
  document.getElementById('hint-count').textContent = String(state.hints);
  document.getElementById('btn-hint').disabled = state.hints <= 0 || state.done;
  document.getElementById('timer').textContent = formatTime(state.elapsed);
}

function formatTime(s) {
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function tick() {
  if (state.done || document.hidden) return;
  state.elapsed++;
  document.getElementById('timer').textContent = formatTime(state.elapsed);
  if (state.elapsed % 10 === 0) save();
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      level: state.level,
      board: state.board,
      locked: state.locked,
      moves: state.moves,
      hints: state.hints,
      elapsed: state.elapsed
    }));
  } catch (e) { /* private mode — play on without saving */ }
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
    b.textContent = a.label;
    b.addEventListener('click', () => { closeSheet(); a.onClick && a.onClick(); });
    sheetActions.appendChild(b);
  });
  overlayEl.hidden = false;
}

function closeSheet() { overlayEl.hidden = true; }

function finish() {
  state.done = true;
  refreshHud();
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
  openSheet('Puzzle solved! 🎉', `
    <div class="result-grid">
      <div><strong>${formatTime(state.elapsed)}</strong>time</div>
      <div><strong>${state.moves}</strong>moves</div>
      <div><strong>${HINTS_PER_PUZZLE - state.hints}</strong>hints</div>
    </div>`, [
    { label: 'Next puzzle', primary: true, onClick: () => startLevel(state.level + 1) },
    { label: 'Play this one again', onClick: () => startLevel(state.level) }
  ]);
}

function showHelp() {
  openSheet('How to play', `
    <ul>
      <li>Every row should end up holding four related words.</li>
      <li>Drag a card onto another to swap the two.</li>
      <li>Prefer tapping? Tap one card, then tap the card to swap it with.</li>
      <li>Complete a row and it locks, revealing the group name.</li>
      <li>Clear all six rows to finish the puzzle.</li>
    </ul>`, [
    { label: 'Got it', primary: true },
    { label: 'Previous puzzle', onClick: () => startLevel(Math.max(1, state.level - 1)) },
    { label: 'Skip to next puzzle', onClick: () => startLevel(state.level + 1) }
  ], true);
}

/* ---------- wiring ---------- */

document.getElementById('btn-hint').addEventListener('click', useHint);
document.getElementById('btn-shuffle').addEventListener('click', doShuffle);
document.getElementById('btn-menu').addEventListener('click', showHelp);
document.getElementById('btn-new').addEventListener('click', () => {
  openSheet('Restart puzzle?', '<p>The board goes back to its opening layout.</p>', [
    { label: 'Restart', primary: true, onClick: () => startLevel(state.level) },
    { label: 'Keep playing' }
  ]);
});

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

const saved = load();
startLevel(saved ? saved.level : 1, saved);
if (!saved) showHelp();
timerId = setInterval(tick, 1000);
document.fonts && document.fonts.ready.then(fitAllText);
