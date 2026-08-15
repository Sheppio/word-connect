/* Word Connect — drag related words into the same row.

   The original game, and the one the shell was pulled out of. Its board lives
   in `state.board` (24 slots, row-major), `state.locked` (per row: the group
   filling it, or -1) and `state.groups` (the six categories dealt). Everything
   else renders from those. */

'use strict';

const ROWS = 6;
const COLS = 4;
const SLOTS = ROWS * COLS;

/* Longest word we will deal. Every card on a board shares one type size, so a
   single long word would shrink all twenty-four; over this length a word is
   simply left in the pool undealt. Spaces are free — "POLE VAULT" wraps. */
const MAX_WORD_LEN = 8;

function gridFits(word) { return longestToken(word) <= MAX_WORD_LEN; }

let cardEls = new Map();   // word -> element
let rowEls = [];           // { row, label }
let selected = null;       // index of the tapped card awaiting a partner

/* ---------- puzzle construction ---------- */

/* Six categories that can each still field four unambiguous words, then four
   words from each, then the lot shuffled across the board. */
function buildPuzzle(day, index) {
  const rnd = seedRandom(day, index, 'grid');
  const picked = pickCategories(rnd, ROWS, COLS, gridFits);

  const groups = picked.map((catIdx, g) => ({
    catIdx,
    title: CATEGORIES[catIdx].title,
    color: ROW_COLORS[g % ROW_COLORS.length][0],
    cardColor: ROW_COLORS[g % ROW_COLORS.length][1],
    words: shuffled(exclusiveWords(catIdx, picked, gridFits), rnd).slice(0, COLS)
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

/* ---------- setup ---------- */

function gridStart(restore) {
  const puzzle = buildPuzzle(state.day, state.level);

  /* A save from an older word list can't be trusted — start the level clean. */
  if (restore) {
    const expected = new Set(puzzle.board.map(c => c.word));
    const ok = Array.isArray(restore.board) && restore.board.length === SLOTS &&
      Array.isArray(restore.locked) && restore.locked.length === ROWS &&
      restore.board.every(c => c && expected.has(c.word) && c.group >= 0 && c.group < ROWS);
    if (!ok) restore = null;
  }

  state.groups = puzzle.groups;
  state.board = restore ? restore.board.map(c => ({ word: c.word, group: c.group })) : puzzle.board;
  state.locked = restore ? restore.locked.slice() : new Array(ROWS).fill(-1);
  selected = null;

  buildDom();
  applyBoard(false);
  fitAllText();
  for (let r = 0; r < ROWS; r++) if (state.locked[r] >= 0) paintRow(r, false);

  /* a restored board may already be finished — reloading on one should offer
     the way on, not a hint button with nothing left to hint */
  state.done = state.locked.every(g => g >= 0);
  dealIn();
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
  boardEl.setAttribute('role', 'grid');
  boardEl.setAttribute('aria-label', 'Word grid: six rows of four cards');
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

/* Page-level scrolling mustn't fight a drag in progress. */
document.addEventListener('touchmove', e => { if (drag && drag.moved) e.preventDefault(); },
  { passive: false });

/* ---------- tools ---------- */

/* Pull the group closest to filling a row into that row. */
function gridHint() {
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
  if (!best) return false;

  for (let c = 0; c < COLS; c++) {
    const slot = best.r * COLS + c;
    if (state.board[slot].group === best.g) continue;
    const donor = state.board.findIndex(
      (card, i) => card.group === best.g && !isLockedIndex(i) && rowOf(i) !== best.r
    );
    if (donor < 0) break;
    swap(slot, donor, false);
  }

  setSelected(null);
  commit();
  return true;
}

function gridShuffle() {
  const open = [];
  for (let i = 0; i < SLOTS; i++) if (!isLockedIndex(i)) open.push(i);
  const cards = shuffled(open.map(i => state.board[i]), Math.random);
  open.forEach((slot, k) => { state.board[slot] = cards[k]; });
  setSelected(null);
  commit();
  announce('Cards shuffled.');
}

/* ---------- sharing ----------

   The grid is the mode people compare, so it's the one that shares. */

/* One dot linked to two — kept on a single line so the button's accessible
   name is just its label. */
const SHARE_ICON = '<svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="m8.6 10.9 6.8-3.8M8.6 13.1l6.8 3.8"/>' +
  '<circle cx="6" cy="12" r="2.7"/><circle cx="18" cy="6" r="2.7"/>' +
  '<circle cx="18" cy="18" r="2.7"/></svg>';

/* The win sheet as plain text: date and puzzle number to identify the board,
   the same three stats, then the six groups in the order the sheet lists them,
   each behind the square that stands in for its row colour. */
function resultSummary() {
  const hints = `${state.hintsUsed} hint${state.hintsUsed === 1 ? '' : 's'}`;
  const groups = state.groups
    .map((g, i) => `${ROW_EMOJI[i % ROW_EMOJI.length]} ${g.title}`).join('\n');

  return `Word Connect · Puzzle ${state.level} · ${resultDate()}\n` +
    `${formatTime(state.elapsed)} · ${state.moves} moves · ${hints}\n\n${groups}`;
}

function resultDate() {
  return new Date(+state.day.slice(0, 4), +state.day.slice(4, 6) - 1, +state.day.slice(6, 8))
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/* The win sheet as a picture: the same dialog, minus the buttons, plus the
   date. See share-card.js — this only supplies the words and the colours. */
function resultImage() {
  const canvas = renderResultCard({
    title: `Puzzle #${state.level} solved! 🎉`,
    date: resultDate(),
    stats: [
      { value: formatTime(state.elapsed), label: 'time' },
      { value: String(state.moves), label: 'moves' },
      { value: String(state.hintsUsed), label: 'hints' }
    ],
    groups: state.groups.map(g => ({ title: g.title, color: g.cardColor })),
    footer: (location.host + location.pathname).replace(/\/(index\.html)?$/, '') || 'Word Connect'
  });
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

/* Hand the result to the share sheet where there is one, otherwise the
   clipboard. The picture is the message, so the text alongside it is only the
   link — the picture already says everything else. The written summary is for
   when there is no picture: no canvas, no file sharing or no clipboard images
   each falls back to it rather than failing the share. */
async function shareResult(btn) {
  const url = (location.origin + location.pathname).replace(/index\.html$/, '');

  const say = msg => {
    const el = btn.querySelector('.btn-label') || btn;
    const was = el.textContent;
    el.textContent = msg;
    announce(msg);
    setTimeout(() => { el.textContent = was; }, 1600);
  };

  let file = null;
  try {
    const blob = await resultImage();
    if (blob) {
      file = new File([blob], `word-connect-${state.day}-${state.level}.png`,
        { type: 'image/png' });
    }
  } catch (err) { /* drawing failed — the text still says everything */ }

  /* whichever of the two goes out depends on whether the picture travels */
  const written = `${resultSummary()}\n\n${url}`;

  try {
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: url });
      return;
    }

    /* a share sheet that won't take files still beats copying, so the written
       summary goes out rather than the picture */
    if (navigator.share) { await navigator.share({ text: written }); return; }

    if (file && window.ClipboardItem && navigator.clipboard.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({
          'image/png': file,
          'text/plain': new Blob([url], { type: 'text/plain' })
        })]);
        say('Copied!');
        return;
      } catch (err) { /* some browsers refuse multi-type writes */ }
    }

    await navigator.clipboard.writeText(written);
    say('Copied!');
  } catch (err) {
    if (err && err.name === 'AbortError') return;   // share sheet dismissed
    say('Copy failed');
  }
}

/* ---------- the mode ---------- */

const GRID_MODE = {
  id: 'grid',
  name: 'Word Connect',
  blurb: 'Drag related words into rows',
  tint: 'rgb(126 200 255)',
  counter: 'moves',
  doneMessage: 'All six groups complete!',
  help: [
    'Every row should end up holding four related words.',
    'Drag a card onto another to swap the two.',
    'Prefer tapping? Tap one card, then tap the card to swap it with.',
    'Complete a row and it locks, revealing the group name.',
    'Clear all six rows to finish the puzzle.',
    'A hint fills in a row. You get one back every five minutes, up to three — the button counts down to the next.'
  ],

  start: gridStart,
  fit: fitAllText,
  hint: gridHint,
  shuffle: gridShuffle,
  serialize: () => ({ board: state.board, locked: state.locked }),
  validate: g => !!g && Array.isArray(g.board) && g.board.length === SLOTS &&
    Array.isArray(g.locked) && g.locked.length === ROWS,
  winRows: () => state.groups.map(g => ({ color: g.cardColor, label: g.title })),
  winActions: () => [
    { label: 'Share result', icon: SHARE_ICON, keepOpen: true, onClick: shareResult }
  ]
};
