/* Chunks — five words from one category, broken into pieces and scattered.

   The pieces are cut by rule rather than looked up: real syllabification needs
   a pronunciation dictionary, which this game can't have, since it makes no
   external requests. chunkCuts() below is the rule, and it is a look test
   rather than linguistics — near enough that a piece always reads like a piece
   of the word.

   A piece may start more than one of the five words, which is the puzzle
   rather than a flaw — what gets checked is the word you finish, not the piece
   you pick.

   Owns `state.chWords` (the five and their pieces, from the seed),
   `state.chPool` (every chunk tile), `state.chBar` (tile ids in the tray) and
   `state.chSolved` (words completed so far). */

'use strict';

const CH_WORDS = 5;
const CH_MIN = 6, CH_MAX = 10;        // two or three pieces of two to five letters
const CH_PIECE_MIN = 2, CH_PIECE_MAX = 5;
const CH_PARTS_MIN = 2, CH_PARTS_MAX = 3;

/* Words over MAX_WORD_LEN never reach the grid, but they're welcome here —
   only a dozen pieces are on screen, so RINGMASTER has room. */

const CH_VOWEL = /[AEIOUY]/;

/* Two letters standing for one consonant sound. A cut never falls inside one:
   CHIC·KEN would be reading the K as its own sound. */
const CH_DIGRAPH = /^(CH|SH|TH|PH|WH|QU|GH|NG|CK)/;

/* The clusters an English syllable can open with. Everything else that isn't a
   single consonant can't start one: TH can, CK can't. */
const CH_ONSETS = /^(CH|SH|TH|PH|WH|QU|BL|BR|CL|CR|DR|FL|FR|GL|GR|PL|PR|SC|SK|SL|SM|SN|SP|ST|SW|TR|TW)$/;

function canOpenSyllable(letters) {
  return letters.length < 2 || (letters.length === 2 && CH_ONSETS.test(letters));
}

/* A run of consonants as sounds rather than letters: RINGMASTER's "NGM" is
   NG then M, so a cut after the NG leaves RING·MAS·TER. */
function soundsIn(run) {
  const out = [];
  for (let i = 0; i < run.length;) {
    const two = run.slice(i).match(CH_DIGRAPH);
    if (two) { out.push(two[0]); i += 2; } else { out.push(run[i]); i += 1; }
  }
  return out;
}

/* How many of the consonants between two vowels belong to the first piece.

   One consonant hands forward whole (LADY·BIRD, not LADYB·IRD) unless it can't
   open a syllable at all (CHICK·EN). Two or more split, the second piece taking
   as many as can legally open it and the first keeping at least one — which is
   DIS·CUS and DRA·GON·FLY rather than DI·SCUS and DRA·GONF·LY. */
function idealCoda(run) {
  const sounds = soundsIn(run);
  if (sounds.length <= 1) return canOpenSyllable(run) ? 0 : run.length;

  for (let take = Math.min(2, sounds.length - 1); take >= 1; take--) {
    const onset = sounds.slice(sounds.length - take).join('');
    if (canOpenSyllable(onset)) return run.length - onset.length;
  }
  return run.length - sounds[sounds.length - 1].length;
}

/* Every way to cut `len` into pieces of the allowed size. */
function chunkShapes(len) {
  const out = [];
  (function walk(rest, parts) {
    if (parts.length > CH_PARTS_MAX) return;
    if (rest === 0) { if (parts.length >= CH_PARTS_MIN) out.push(parts.slice()); return; }
    for (let n = CH_PIECE_MIN; n <= CH_PIECE_MAX; n++) {
      if (rest - n < 0) break;
      parts.push(n);
      walk(rest - n, parts);
      parts.pop();
    }
  })(len, []);
  return out;
}

/* The cuts worth showing, best first.

   This is a look test rather than linguistics: every piece has to carry a
   vowel so no card ever reads "CM", no cut falls inside a digraph or between
   two vowels, and the consonants in between divide the way English divides
   them. 553 of the 566 eligible words come out with nothing against them.

   It still gets compounds wrong — TIGH·TROPE, where a reader would say
   TIGHT·ROPE — because telling a compound apart needs a dictionary this game
   can't have. Fourteen words can't be cut under these rules at all
   (DACHSHUND, SPRINT, KNIGHT…) and simply sit the mode out. */
function chunkCuts(word) {
  const cuts = [];
  for (const shape of chunkShapes(word.length)) {
    const parts = [];
    const bounds = [];
    let at = 0;
    for (const n of shape) { parts.push(word.slice(at, at + n)); at += n; bounds.push(at); }
    bounds.pop();

    if (!parts.every(p => CH_VOWEL.test(p))) continue;
    if (bounds.some(b => CH_DIGRAPH.test(word.slice(b - 1, b + 1)))) continue;

    let penalty = 0;
    for (let i = 0; i + 1 < parts.length; i++) {
      const coda = (parts[i].match(/[^AEIOUY]+$/) || [''])[0];
      const onset = parts[i + 1].match(/^[^AEIOUY]*/)[0];
      const run = coda + onset;
      if (!run.length) penalty++;                        // a cut between two vowels
      else if (coda.length !== idealCoda(run)) penalty++;
    }
    cuts.push({ parts, penalty });
  }
  /* fewest pieces among the cleanest: a natural break beats an extra card */
  cuts.sort((a, b) => a.penalty - b.penalty || a.parts.length - b.parts.length);
  return cuts;
}

function chunkFits(word) {
  return !word.includes(' ') &&
    word.length >= CH_MIN && word.length <= CH_MAX &&
    chunkCuts(word).length > 0;
}

function splitWord(word, rnd) {
  const cuts = chunkCuts(word);
  /* pick among the joint best rather than the first, so a word that turns up
     again doesn't always break the same way */
  const best = cuts.filter(c =>
    c.penalty === cuts[0].penalty && c.parts.length === cuts[0].parts.length);
  return best[Math.floor(rnd() * best.length)].parts;
}

function buildChunks(day, level) {
  const rnd = seedRandom(day, level, 'chunks');
  const cat = pickCategories(rnd, 1, CH_WORDS, chunkFits)[0];
  const words = shuffled(exclusiveWords(cat, [cat], chunkFits), rnd).slice(0, CH_WORDS);
  return {
    title: CATEGORIES[cat].title,
    words: words.map(w => ({ word: w, chunks: splitWord(w, rnd) })),
    rnd
  };
}

function chStart(restore) {
  const puzzle = buildChunks(state.day, state.level);
  state.chTitle = puzzle.title;
  state.chWords = puzzle.words;

  const tiles = [];
  puzzle.words.forEach((w, wi) => w.chunks.forEach(text => {
    tiles.push({ id: tiles.length, text, word: wi, used: false });
  }));
  state.chPool = shuffled(tiles, puzzle.rnd).map((t, i) => Object.assign({}, t, { slot: i }));
  state.chBar = [];
  state.chSolved = [];

  const known = new Set(state.chWords.map(w => w.word));
  if (restore && Array.isArray(restore.solved)) {
    restore.solved.filter(w => known.has(w)).forEach(word => {
      const entry = state.chWords.find(w => w.word === word);
      /* chunks of the same text are interchangeable, so spend the first free
         tile that matches each piece rather than the one it was cut from */
      entry.chunks.forEach(text => {
        const tile = state.chPool.find(t => !t.used && t.text === text);
        if (tile) tile.used = true;
      });
      state.chSolved.push(word);
    });
  }

  state.done = state.chSolved.length >= state.chWords.length;
  drawChunks(true);
}

function barText() {
  return state.chBar.map(id => tileById(id).text).join('');
}

function tileById(id) { return state.chPool.find(t => t.id === id); }

function unsolvedWords() {
  return state.chWords.filter(w => !state.chSolved.includes(w.word));
}

function drawChunks(fresh) {
  boardEl.textContent = '';
  boardEl.setAttribute('role', 'group');
  boardEl.setAttribute('aria-label',
    `Rebuild ${state.chWords.length} words from their pieces`);

  const head = document.createElement('div');
  head.className = 'quiz-head';
  head.innerHTML = `<span class="quiz-count">${state.chSolved.length} / ${state.chWords.length}</span>` +
    `<span class="quiz-ask">${state.chTitle}</span>`;
  boardEl.appendChild(head);

  const done = document.createElement('ul');
  done.className = 'ana-done';
  state.chSolved.forEach(w => {
    const li = document.createElement('li');
    li.textContent = w;
    done.appendChild(li);
  });
  boardEl.appendChild(done);

  /* tray and pieces travel together, centred in whatever room is left */
  const play = document.createElement('div');
  play.className = 'play';
  boardEl.appendChild(play);

  /* the tray you build in */
  const built = barText();
  const live = unsolvedWords().map(w => w.word);
  const dead = built.length > 0 && !live.some(w => w.startsWith(built));

  const bar = document.createElement('div');
  bar.className = 'chunk-bar' + (dead ? ' dead' : '') + (built ? '' : ' empty');
  if (!built) {
    bar.textContent = 'Tap pieces to build a word';
  } else {
    state.chBar.forEach((id, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'chunk in-bar';
      el.textContent = tileById(id).text;
      el.setAttribute('aria-label', `${tileById(id).text}, tap to remove`);
      el.addEventListener('click', () => popTo(i));
      bar.appendChild(el);
    });
  }
  play.appendChild(bar);

  const pool = document.createElement('div');
  pool.className = 'chunk-pool';
  state.chPool.forEach(tile => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'chunk' + (tile.used ? ' spent' : '');
    el.textContent = tile.text;
    el.disabled = tile.used || state.chBar.includes(tile.id);
    if (state.chBar.includes(tile.id)) el.classList.add('taken');
    el.addEventListener('click', () => pushChunk(tile.id));
    pool.appendChild(el);
  });
  play.appendChild(pool);

  chFit();

  if (fresh && !prefersReducedMotion()) {
    [...pool.children].forEach((el, i) => el.animate(
      [{ transform: 'translateY(12px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 260, delay: i * 30, easing: 'cubic-bezier(.2,.9,.3,1.05)', fill: 'backwards' }));
  }
}

/* One size for every piece, the longest deciding it — the same rule the grid
   uses for its cards. Four columns of a five-letter piece don't fit a 320px
   phone at the full size, and pieces that each shrank to their own text would
   read as an accident rather than a set. */
function chFit() {
  const tiles = [...boardEl.querySelectorAll('.chunk-pool .chunk')];
  if (!tiles.length) return;
  const set = size => boardEl.style.setProperty('--chunk-font', size + 'px');
  const fits = () => tiles.every(t => t.scrollWidth <= t.clientWidth);

  let size = 19;
  set(size);
  while (size > 12 && !fits()) {
    size -= 0.5;
    set(size);
  }
}

function pushChunk(id) {
  if (state.done) return;
  const tile = tileById(id);
  if (!tile || tile.used || state.chBar.includes(id)) return;
  state.chBar.push(id);
  state.moves++;
  drawChunks(false);
  checkBuilt();
  refreshHud();
  save();
}

/* Tapping a piece in the tray takes it and everything after it back. */
function popTo(i) {
  if (state.done) return;
  state.chBar = state.chBar.slice(0, i);
  drawChunks(false);
  save();
}

function checkBuilt() {
  const built = barText();
  const entry = unsolvedWords().find(w => w.word === built);
  if (!entry) return;

  state.chBar.forEach(id => { tileById(id).used = true; });
  state.chBar = [];
  state.chSolved.push(entry.word);
  vibrate(18);
  announce(`${entry.word}. That's ${state.chSolved.length} of ${state.chWords.length}.`);
  drawChunks(false);

  if (state.chSolved.length >= state.chWords.length) finish();
}

/* A hint lays the next piece of whichever word the tray is already building —
   or starts one, if the tray is empty or has gone nowhere. */
function chHint() {
  const built = barText();
  const target = unsolvedWords().find(w => w.word.startsWith(built) && built.length);

  if (target) {
    const next = target.chunks[state.chBar.length];
    if (next) {
      const tile = state.chPool.find(t => !t.used && !state.chBar.includes(t.id) && t.text === next);
      if (tile) {
        state.chBar.push(tile.id);
        announce(`${next} comes next.`);
        drawChunks(false);
        checkBuilt();
        return true;
      }
    }
  }

  const start = unsolvedWords()[0];
  if (!start) return false;
  const tile = state.chPool.find(t => !t.used && t.text === start.chunks[0]);
  if (!tile) return false;
  state.chBar = [tile.id];
  announce(`Start with ${start.chunks[0]}.`);
  drawChunks(false);
  checkBuilt();
  return true;
}

function chShuffle() {
  state.chPool = shuffled(state.chPool, Math.random);
  drawChunks(false);
  announce('Pieces shuffled.');
}

const CHUNKS_MODE = {
  id: 'chunks',
  name: 'Chunks',
  blurb: 'Rebuild words from pieces',
  tint: 'rgb(220 170 240)',
  counter: 'moves',
  doneMessage: 'All four words rebuilt!',
  help: [
    'Four words from one category, each cut into pieces and jumbled.',
    'Tap pieces to build a word in the tray; tap a piece in the tray to take it back.',
    'Finish a word and it locks itself — you don’t have to say which you’re building.',
    'Pieces can start more than one word, so the tray turns red when what you have can’t finish.',
    'A hint lays the next piece of the word you’re building.'
  ],

  start: chStart,
  fit: chFit,
  hint: chHint,
  shuffle: chShuffle,
  serialize: () => ({ solved: state.chSolved }),
  validate: g => !!g && Array.isArray(g.solved),
  winRows: () => state.chWords.map((w, i) => ({
    color: ROW_COLORS[i % ROW_COLORS.length][1],
    label: w.word
  }))
};
