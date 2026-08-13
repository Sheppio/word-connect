/* The win sheet, redrawn on a canvas so it can be shared as a picture.

   A shared result travels as an image far better than as text: colours and
   layout survive, where a pasted list arrives in whatever font the messaging
   app fancies. The measurements here mirror .sheet, .result-grid and
   .solved-list in style.css — change one and change the other, or the picture
   stops looking like the dialog it came from. */

const CARD_FONT = 'ui-rounded, "SF Pro Rounded", "Segoe UI", Roboto, system-ui, sans-serif';

const CARD = {
  scale: 3,          // 1140px wide, so it stays sharp when a chat app resizes it
  width: 380,        // .sheet-wrap max-width
  margin: 18,        // backdrop showing around the dialog
  padX: 20, padT: 22, padB: 18,
  radius: 20
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function font(weight, size) { return `${weight} ${size}px ${CARD_FONT}`; }

/* One type size for all six group names, exactly as the board sizes its cards:
   the longest name sets the size, so the column reads evenly. */
function groupTextSize(ctx, groups, room) {
  for (let size = 14; size > 10; size--) {
    ctx.font = font(600, size);
    if (groups.every(g => ctx.measureText(g.title).width <= room)) return size;
  }
  return 10;
}

/* { title, date, stats: [{ value, label }], groups: [{ title, color }], footer } */
function renderResultCard(data) {
  const canvas = document.createElement('canvas');
  const measure = canvas.getContext('2d');

  const cardW = CARD.width;
  const colGap = 10, chip = 12, chipGap = 8, rowGap = 5;
  const room = (cardW - CARD.padX * 2 - colGap) / 2 - chip - chipGap;
  const nameSize = groupTextSize(measure, data.groups, room);

  const rows = Math.ceil(data.groups.length / 2);
  const lineH = Math.max(chip, nameSize * 1.25);
  const cardH = CARD.padT
    + 27 + 8                                    // title
    + 16 + 16                                   // date
    + 28 + 2 + 15 + 18                          // stats value, gap, label
    + rows * lineH + (rows - 1) * rowGap + 14   // the six groups
    + 14                                        // footer
    + CARD.padB;

  const w = cardW + CARD.margin * 2, h = cardH + CARD.margin * 2;
  canvas.width = w * CARD.scale;
  canvas.height = h * CARD.scale;

  const ctx = canvas.getContext('2d');
  ctx.scale(CARD.scale, CARD.scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  /* the page behind the dialog */
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#14247e');
  bg.addColorStop(0.45, '#1a2b96');
  bg.addColorStop(1, '#0b1246');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  /* the dialog itself */
  const x = CARD.margin, y = CARD.margin;
  const sheet = ctx.createLinearGradient(0, y, 0, y + cardH);
  sheet.addColorStop(0, '#2a3aa8');
  sheet.addColorStop(1, '#182562');
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .5)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = sheet;
  roundRect(ctx, x, y, cardW, cardH, CARD.radius);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 255, 255, .2)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + .5, y + .5, cardW - 1, cardH - 1, CARD.radius);
  ctx.stroke();

  const mid = x + cardW / 2;
  let cy = y + CARD.padT;

  ctx.fillStyle = '#fff';
  ctx.font = font(700, 21);
  ctx.fillText(data.title, mid, cy);
  cy += 27 + 8;

  ctx.fillStyle = 'rgba(255, 255, 255, .68)';
  ctx.font = font(600, 12.5);
  ctx.fillText(data.date, mid, cy);
  cy += 16 + 16;

  /* .result-grid: value over label, the three centred as one block */
  const gap = 22;
  const widths = data.stats.map(s => {
    ctx.font = font(700, 22);
    const v = ctx.measureText(s.value).width;
    ctx.font = font(400, 12);
    return Math.max(v, ctx.measureText(s.label).width);
  });
  const total = widths.reduce((a, b) => a + b, 0) + gap * (data.stats.length - 1);
  let sx = mid - total / 2;
  /* .result-grid sets opacity on the whole cell, so the big number is dimmed
     with its label — nested opacity doesn't let the strong climb back to 1. */
  ctx.fillStyle = 'rgba(255, 255, 255, .7)';
  data.stats.forEach((s, i) => {
    const c = sx + widths[i] / 2;
    ctx.font = font(700, 22);
    ctx.fillText(s.value, c, cy);
    ctx.font = font(400, 12);
    ctx.fillText(s.label, c, cy + 28 + 2);
    sx += widths[i] + gap;
  });
  cy += 28 + 2 + 15 + 18;

  /* .solved-list: two columns, a coloured chip against each name */
  ctx.textAlign = 'left';
  ctx.font = font(600, nameSize);
  data.groups.forEach((g, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const gx = x + CARD.padX + col * ((cardW - CARD.padX * 2 + colGap) / 2);
    const gy = cy + row * (lineH + rowGap);
    ctx.fillStyle = g.color;
    roundRect(ctx, gx, gy + (lineH - chip) / 2, chip, chip, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, .92)';
    ctx.fillText(g.title, gx + chip + chipGap, gy + (lineH - nameSize * 1.2) / 2);
  });
  cy += rows * lineH + (rows - 1) * rowGap + 14;

  /* where to go and play it — an image can't carry the link the message does */
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 255, 255, .42)';
  ctx.font = font(500, 11);
  ctx.fillText(data.footer, mid, cy);

  return canvas;
}
