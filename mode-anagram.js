/* Anagram — five scrambled words from one category.

   The category is the clue, which is why a puzzle draws all five words from a
   single one. Words are 4–7 letters and single-word, so a rack of tiles fits
   one line on a phone.

   Owns `state.anaWords` (the five, rebuilt from the seed), `state.anaIndex`
   (which is showing), `state.anaSlots` (tile id per slot, or null),
   `state.anaFixed` (slots a hint has settled) and `state.anaTiles` (the rack). */

'use strict';

const ANA_WORDS = 5;
const ANA_MIN = 4, ANA_MAX = 7;
const ANA_NEXT_MS = 800;

let anaBusy = false;   // true while a solved word is being admired

function anaFits(word) {
  return !word.includes(' ') && word.length >= ANA_MIN && word.length <= ANA_MAX;
}

/* Every word in the pool, for the one guard a scramble needs: it must not spell
   something else the game knows. LEMON/MELON, TACO/COAT, IRON/NOIR and
   SLEET/STEEL are all in there, and an unscramble with two right answers where
   only one is accepted is the worst puzzle we could ship. */
let ANA_ALL_WORDS = null;
function anaPoolWords() {
  if (!ANA_ALL_WORDS) {
    ANA_ALL_WORDS = new Set();
    CATEGORIES.forEach(c => c.words.forEach(w => ANA_ALL_WORDS.add(w.replace(/ /g, ''))));
  }
  return ANA_ALL_WORDS;
}

function scramble(word, rnd) {
  const pool = anaPoolWords();
  const letters = word.split('');
  for (let attempt = 0; attempt < 40; attempt++) {
    const mixed = shuffled(letters, rnd).join('');
    if (mixed !== word && !pool.has(mixed)) return mixed;
  }
  /* A word whose every arrangement is either itself or another entry can't be
     scrambled safely — reversing it at least never spells a second answer. */
  return letters.reverse().join('');
}

function buildAnagram(day, level) {
  const rnd = seedRandom(day, level, 'anagram');
  const cat = pickCategories(rnd, 1, ANA_WORDS, anaFits)[0];
  const words = shuffled(exclusiveWords(cat, [cat], anaFits), rnd).slice(0, ANA_WORDS);
  return {
    title: CATEGORIES[cat].title,
    words: words.map(w => ({ word: w, mixed: scramble(w, rnd) }))
  };
}

function anaStart(restore) {
  const puzzle = buildAnagram(state.day, state.level);
  state.anaTitle = puzzle.title;
  state.anaWords = puzzle.words;
  state.anaIndex = 0;

  if (restore && Number.isInteger(restore.index) &&
      restore.index >= 0 && restore.index < state.anaWords.length) {
    state.anaIndex = restore.index;
  }
  anaBusy = false;
  loadWord(true);
}

/* Fresh rack and empty slots for the word now in play. A part-typed word isn't
   worth saving — it's four taps to put back. */
function loadWord(fresh) {
  const entry = state.anaWords[state.anaIndex];
  state.anaTiles = entry.mixed.split('').map((letter, id) => ({ id, letter, used: false }));
  state.anaSlots = new Array(entry.word.length).fill(null);
  state.anaFixed = new Array(entry.word.length).fill(false);
  drawAnagram(fresh);
}

function drawAnagram(fresh) {
  const entry = state.anaWords[state.anaIndex];
  boardEl.textContent = '';
  boardEl.setAttribute('role', 'group');
  boardEl.setAttribute('aria-label', `Anagram ${state.anaIndex + 1} of ${state.anaWords.length}`);

  const head = document.createElement('div');
  head.className = 'quiz-head';
  head.innerHTML = `<span class="quiz-count">Word ${state.anaIndex + 1} / ${state.anaWords.length}</span>` +
    `<span class="quiz-ask">${state.anaTitle}</span>`;
  boardEl.appendChild(head);

  const done = document.createElement('ul');
  done.className = 'ana-done';
  state.anaWords.slice(0, state.anaIndex).forEach(w => {
    const li = document.createElement('li');
    li.textContent = w.word;
    done.appendChild(li);
  });
  boardEl.appendChild(done);

  /* slots and rack travel together, centred in whatever room is left */
  const play = document.createElement('div');
  play.className = 'play';
  boardEl.appendChild(play);

  const slots = document.createElement('div');
  slots.className = 'tile-row slots';
  state.anaSlots.forEach((tileId, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tile slot' + (tileId === null ? ' empty' : '') +
      (state.anaFixed[i] ? ' fixed' : '');
    el.textContent = tileId === null ? '' : state.anaTiles[tileId].letter;
    el.setAttribute('aria-label', tileId === null
      ? `Letter ${i + 1}, empty`
      : `Letter ${i + 1}, ${state.anaTiles[tileId].letter}`);
    el.addEventListener('click', () => takeBack(i));
    slots.appendChild(el);
  });
  play.appendChild(slots);

  const rack = document.createElement('div');
  rack.className = 'tile-row rack';
  state.anaTiles.forEach(tile => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tile' + (tile.used ? ' spent' : '');
    el.textContent = tile.letter;
    el.disabled = tile.used;
    el.setAttribute('aria-label', tile.letter);
    el.addEventListener('click', () => placeTile(tile.id));
    rack.appendChild(el);
  });
  play.appendChild(rack);

  if (fresh && !prefersReducedMotion()) {
    [...rack.children].forEach((el, i) => el.animate(
      [{ transform: 'translateY(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 240, delay: i * 40, easing: 'cubic-bezier(.2,.9,.3,1.05)', fill: 'backwards' }));
  }
  anaFit(entry.word.length);
}

/* Tiles and slots share a size, worked out from how many have to fit the width
   rather than fixed in CSS — a four-letter word gets bigger tiles than a seven. */
function anaFit(count) {
  const row = boardEl.querySelector('.tile-row');
  if (!row) return;
  const gap = 6;
  const size = Math.min(64, Math.floor((row.clientWidth - gap * (count - 1)) / count));
  boardEl.style.setProperty('--tile-size', size + 'px');
  boardEl.style.setProperty('--tile-font', Math.round(size * 0.52) + 'px');
}

function placeTile(id) {
  if (anaBusy || state.done) return;
  const tile = state.anaTiles[id];
  if (!tile || tile.used) return;
  const slot = state.anaSlots.findIndex((s, i) => s === null && !state.anaFixed[i]);
  if (slot < 0) return;

  tile.used = true;
  state.anaSlots[slot] = id;
  drawAnagram(false);
  checkWord();
}

function takeBack(slot) {
  if (anaBusy || state.done) return;
  if (state.anaFixed[slot]) return;          // a hint's letter stays put
  const id = state.anaSlots[slot];
  if (id === null) return;
  state.anaTiles[id].used = false;
  state.anaSlots[slot] = null;
  drawAnagram(false);
}

function checkWord() {
  if (state.anaSlots.some(s => s === null)) return;
  const entry = state.anaWords[state.anaIndex];
  const tried = state.anaSlots.map(id => state.anaTiles[id].letter).join('');

  if (tried !== entry.word) {
    state.moves++;
    const slots = boardEl.querySelector('.slots');
    slots.classList.add('shake');
    setTimeout(() => slots.classList.remove('shake'), 400);
    vibrate(30);
    announce(`${tried} isn't it.`);
    refreshHud();
    save();
    return;
  }

  anaBusy = true;
  boardEl.querySelector('.slots').classList.add('right');
  vibrate(18);
  announce(`${entry.word}. Correct.`);
  save();

  setTimeout(() => {
    anaBusy = false;
    if (state.anaIndex + 1 >= state.anaWords.length) { finish(); return; }
    state.anaIndex++;
    loadWord(true);
    refreshHud();
    save();
  }, ANA_NEXT_MS);
}

/* A hint settles one letter in its place, and it stays there. */
function anaHint() {
  const entry = state.anaWords[state.anaIndex];
  const slot = state.anaSlots.findIndex((id, i) =>
    !state.anaFixed[i] && (id === null || state.anaTiles[id].letter !== entry.word[i]));
  if (slot < 0) return false;               // every letter already right

  /* whatever is sitting there goes back to the rack */
  const sitting = state.anaSlots[slot];
  if (sitting !== null) state.anaTiles[sitting].used = false;

  const want = entry.word[slot];
  const tile = state.anaTiles.find(t => !t.used && t.letter === want) ||
    state.anaTiles.find(t => t.letter === want);
  if (!tile) return false;

  /* if the letter we need is parked in another slot, empty that one first */
  const parked = state.anaSlots.indexOf(tile.id);
  if (parked >= 0) state.anaSlots[parked] = null;

  tile.used = true;
  state.anaSlots[slot] = tile.id;
  state.anaFixed[slot] = true;
  announce(`Letter ${slot + 1} is ${want}.`);
  drawAnagram(false);
  checkWord();
  return true;
}

/* Shuffle re-scatters the tiles still on the rack. */
function anaShuffle() {
  const loose = state.anaTiles.filter(t => !t.used);
  const order = shuffled(loose.map(t => t.letter), Math.random);
  loose.forEach((t, i) => { t.letter = order[i]; });
  drawAnagram(false);
  announce('Tiles shuffled.');
}

const ANAGRAM_MODE = {
  id: 'anagram',
  name: 'Anagram',
  blurb: 'Unscramble five from one category',
  tint: 'rgb(180 220 140)',
  counter: 'wrong',
  doneMessage: 'All five unscrambled!',
  help: [
    'Five scrambled words, all from the category named at the top.',
    'Tap a letter to place it, tap a placed letter to take it back.',
    'Fill every slot and the word is checked for you.',
    'A hint settles one letter in its right place for good.',
    'Shuffle re-scatters the letters you haven’t used yet.'
  ],

  start: anaStart,
  fit: () => anaFit(state.anaSlots ? state.anaSlots.length : ANA_MAX),
  hint: anaHint,
  shuffle: anaShuffle,
  serialize: () => ({ index: state.anaIndex }),
  validate: g => !!g && Number.isInteger(g.index),
  winRows: () => state.anaWords.map((w, i) => ({
    color: ROW_COLORS[i % ROW_COLORS.length][1],
    label: w.word
  }))
};
