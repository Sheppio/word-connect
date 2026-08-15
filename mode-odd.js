/* Odd One Out — four words from one category and an intruder from another.

   Ten rounds to a puzzle. The board is rebuilt each round rather than animated
   between them: five cards is little enough that a fresh deal reads better
   than a shuffle.

   Owns `state.oddRounds` (the ten rounds, rebuilt from the seed), `state.round`
   (which one is showing) and `state.oddMisses` (wrong taps per round, which is
   also the move counter). */

'use strict';

const ODD_ROUNDS = 10;
const ODD_CHOICES = 5;          // four of a kind and the intruder
const ODD_REVEAL_MS = 950;      // how long the answer stays up before the next

let oddLocked = false;          // true while a solved round is being admired

/* Twenty categories that don't clash with each other, paired off into rounds.
   Taking them all in one pick is what stops a category turning up twice in a
   puzzle, and stops the intruder being something the family could claim. */
function buildOdd(day, level) {
  const rnd = seedRandom(day, level, 'odd');
  const cats = pickCategories(rnd, ODD_ROUNDS * 2, ODD_CHOICES - 1, null);

  const rounds = [];
  for (let i = 0; i + 1 < cats.length && rounds.length < ODD_ROUNDS; i += 2) {
    const family = cats[i], stranger = cats[i + 1];
    const words = shuffled(exclusiveWords(family, cats, null), rnd).slice(0, ODD_CHOICES - 1);
    const odd = shuffled(exclusiveWords(stranger, cats, null), rnd)[0];
    if (words.length < ODD_CHOICES - 1 || !odd) continue;

    const cards = shuffled(words.concat(odd), rnd);
    rounds.push({
      cards,
      odd: cards.indexOf(odd),
      family: CATEGORIES[family].title,
      stranger: CATEGORIES[stranger].title
    });
  }
  return rounds;
}

function oddStart(restore) {
  state.oddRounds = buildOdd(state.day, state.level);
  state.round = 0;
  state.oddMisses = new Array(state.oddRounds.length).fill(0);

  if (restore && Number.isInteger(restore.round) &&
      restore.round >= 0 && restore.round < state.oddRounds.length &&
      Array.isArray(restore.misses) && restore.misses.length === state.oddRounds.length) {
    state.round = restore.round;
    state.oddMisses = restore.misses.map(n => n | 0);
  }
  state.moves = state.oddMisses.reduce((a, b) => a + b, 0);
  oddLocked = false;
  drawRound(true);
}

function drawRound(fresh) {
  const round = state.oddRounds[state.round];
  boardEl.textContent = '';
  boardEl.setAttribute('role', 'group');
  boardEl.setAttribute('aria-label', `Round ${state.round + 1} of ${state.oddRounds.length}`);

  const head = document.createElement('div');
  head.className = 'quiz-head';
  head.innerHTML = `<span class="quiz-count">Round ${state.round + 1} / ${state.oddRounds.length}</span>` +
    `<span class="quiz-ask">Which one doesn't belong?</span>`;
  boardEl.appendChild(head);

  const list = document.createElement('div');
  list.className = 'quiz-list';
  round.cards.forEach((word, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'card quiz-card';
    el.dataset.pick = String(i);
    const text = document.createElement('span');
    text.className = 'card-text';
    text.textContent = word;
    el.appendChild(text);
    el.addEventListener('click', () => pickOdd(i));
    list.appendChild(el);
  });
  boardEl.appendChild(list);

  if (fresh && !prefersReducedMotion()) {
    [...list.children].forEach((el, i) => el.animate(
      [{ transform: 'translateY(12px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 260, delay: i * 45, easing: 'cubic-bezier(.2,.9,.3,1.05)', fill: 'backwards' }));
  }
  oddFit();
}

function pickOdd(i) {
  if (oddLocked || state.done) return;
  const round = state.oddRounds[state.round];
  const el = boardEl.querySelector(`[data-pick="${i}"]`);

  if (i !== round.odd) {
    state.oddMisses[state.round]++;
    state.moves++;
    el.classList.add('wrong');
    el.disabled = true;
    vibrate(30);
    announce(`${round.cards[i]} is a ${round.family.replace(/s$/, '')}. Try again.`);
    refreshHud();
    save();
    return;
  }

  oddLocked = true;
  el.classList.add('right');
  boardEl.querySelectorAll('.quiz-card').forEach((card, k) => {
    card.disabled = true;
    if (k !== round.odd) card.classList.add('family');
  });
  boardEl.querySelector('.quiz-ask').textContent =
    `${round.cards[round.odd]} — the rest are ${round.family}`;
  vibrate(18);
  announce(`Correct. ${round.cards[round.odd]} is a ${round.stranger.replace(/s$/, '')}.`);

  save();
  setTimeout(() => {
    oddLocked = false;
    if (state.round + 1 >= state.oddRounds.length) { finish(); return; }
    state.round++;
    drawRound(true);
    refreshHud();
    save();
  }, ODD_REVEAL_MS);
}

/* One shared type size, as on the grid: the longest word sets it for the round
   so five cards don't each shout at a different volume. */
function oddFit() {
  const texts = [...boardEl.querySelectorAll('.quiz-card .card-text')];
  if (!texts.length) return;
  const room = texts.map(t => t.parentElement.clientWidth - 24);
  let size = 22;
  const fits = () => texts.every((t, i) => t.scrollWidth <= room[i]);
  texts.forEach(t => { t.style.fontSize = size + 'px'; });
  while (size > 13 && !fits()) {
    size -= 0.5;
    texts.forEach(t => { t.style.fontSize = size + 'px'; });
  }
}

/* A hint takes away one of the wrong answers. */
function oddHint() {
  const round = state.oddRounds[state.round];
  const live = [...boardEl.querySelectorAll('.quiz-card')]
    .filter((el, i) => i !== round.odd && !el.disabled);
  if (live.length <= 1) return false;      // only the answer and one other left

  const drop = live[Math.floor(Math.random() * live.length)];
  drop.classList.add('ruled-out');
  drop.disabled = true;
  announce(`${drop.textContent} ruled out.`);
  return true;
}

const ODD_MODE = {
  id: 'odd',
  name: 'Odd One Out',
  blurb: 'Spot the word that doesn’t fit',
  tint: 'rgb(255 190 120)',
  counter: 'wrong',
  doneMessage: 'All ten rounds done!',
  help: [
    'Four of the five words share a category. One doesn’t.',
    'Tap the odd one out to take the round.',
    'A wrong tap costs you nothing but the count — keep going until you find it.',
    'Ten rounds to a puzzle.',
    'A hint rules out one of the wrong answers. You get one back every five minutes, up to three.'
  ],

  start: oddStart,
  fit: oddFit,
  hint: oddHint,
  shuffle: null,                 // nothing to rearrange — five cards, one answer
  serialize: () => ({ round: state.round, misses: state.oddMisses }),
  validate: g => !!g && Number.isInteger(g.round) && Array.isArray(g.misses),
  winStats: () => [
    { value: formatTime(state.elapsed), label: 'time' },
    { value: `${state.oddMisses.filter(m => m === 0).length}/${state.oddRounds.length}`, label: 'clean' },
    { value: String(state.hintsUsed), label: 'hints' }
  ],
  /* green for a round taken first time, red for one that took a guess */
  winRows: () => state.oddRounds.map((r, i) => ({
    color: ROW_COLORS[state.oddMisses[i] ? 5 : 2][1],
    label: r.cards[r.odd]
  }))
};
