/* Canvas confetti — no dependencies, no images, nothing to load.
   fireConfetti() adds particles to a shared canvas that tears itself
   down once the last piece has fallen off-screen. */

'use strict';

const CONFETTI_COLORS = [
  '#ffd84f', '#ee9b32', '#5ccd77', '#6cc0ef', '#cd90ec', '#fb8c8c', '#ffffff'
];

let confCanvas = null;
let confCtx = null;
let confParts = [];
let confRaf = 0;
let confLast = 0;

function confResize() {
  if (!confCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  confCanvas.width = Math.floor(window.innerWidth * dpr);
  confCanvas.height = Math.floor(window.innerHeight * dpr);
  confCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function confEnsure() {
  if (confCanvas) return;
  confCanvas = document.createElement('canvas');
  confCanvas.className = 'confetti-canvas';
  confCanvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(confCanvas);
  confCtx = confCanvas.getContext('2d');
  confResize();
  window.addEventListener('resize', confResize);
}

function confDestroy() {
  window.removeEventListener('resize', confResize);
  if (confCanvas) confCanvas.remove();
  confCanvas = null;
  confCtx = null;
  confParts = [];
  confRaf = 0;
}

/* x/y are viewport fractions; angle is degrees with 90 pointing straight up. */
function fireConfetti(opts) {
  const o = opts || {};
  const x = (o.x === undefined ? 0.5 : o.x) * window.innerWidth;
  const y = (o.y === undefined ? 0.6 : o.y) * window.innerHeight;
  const count = o.count || 60;
  const spread = o.spread || 55;
  const angle = o.angle === undefined ? 90 : o.angle;
  const power = o.power || 13;

  confEnsure();

  for (let i = 0; i < count; i++) {
    const dir = (angle + (Math.random() - 0.5) * spread) * Math.PI / 180;
    const speed = power * (0.55 + Math.random() * 0.75);
    confParts.push({
      x: x + (Math.random() - 0.5) * 24,
      y: y + (Math.random() - 0.5) * 16,
      vx: Math.cos(dir) * speed,
      vy: -Math.sin(dir) * speed,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      spin: Math.random() * Math.PI * 2,
      vspin: (Math.random() - 0.5) * 0.34,
      tilt: Math.random() * Math.PI * 2,
      vtilt: 0.08 + Math.random() * 0.14,
      round: Math.random() < 0.28,
      life: 0
    });
  }

  if (!confRaf) {
    confLast = performance.now();
    confRaf = requestAnimationFrame(confStep);
  }
}

function confStep(now) {
  /* Normalise to 60fps steps so physics matches on any refresh rate. */
  const step = Math.min((now - confLast) / 16.67, 3);
  confLast = now;

  const w = window.innerWidth;
  const h = window.innerHeight;
  confCtx.clearRect(0, 0, w, h);

  for (let i = confParts.length - 1; i >= 0; i--) {
    const p = confParts[i];
    p.vy += 0.3 * step;          // gravity
    p.vx *= Math.pow(0.985, step); // air drag
    p.vy *= Math.pow(0.995, step);
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.spin += p.vspin * step;
    p.tilt += p.vtilt * step;
    p.life += step;

    if (p.y > h + 30 || p.x < -60 || p.x > w + 60) {
      confParts.splice(i, 1);
      continue;
    }

    const fade = p.life > 150 ? Math.max(0, 1 - (p.life - 150) / 60) : 1;
    confCtx.save();
    confCtx.globalAlpha = fade;
    confCtx.translate(p.x, p.y);
    confCtx.rotate(p.spin);
    /* squashing the width as it tilts reads as a piece fluttering edge-on */
    confCtx.scale(Math.cos(p.tilt), 1);
    confCtx.fillStyle = p.color;
    if (p.round) {
      confCtx.beginPath();
      confCtx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
      confCtx.fill();
    } else {
      confCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    confCtx.restore();
  }

  if (confParts.length) {
    confRaf = requestAnimationFrame(confStep);
  } else {
    confDestroy();
  }
}
