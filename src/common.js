// ===== Условие получения подсказки =====
// ЗАГЛУШКА. Сюда встанет условие, которое выберет Руслан.
// request() должен вернуть true, если подсказку можно выдать.
const HintGate = {
  title: 'Подсказка',
  text: 'Скоро здесь появится особое условие, чтобы получить подсказку. Пока что подсказки бесплатные.',
  async request() { return true; },
};

// ===== Общее для всех игр =====
const $ = id => document.getElementById(id);
const PRAISE = ['Даля, ты умница!', 'Блестяще, Даля!', 'Ещё одна покорена!', 'Вот это голова!', 'Красиво решено!'];
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ===== Шторка =====
function sheet({ title, body, ok, cancel, cls = '' }) {
  return new Promise(resolve => {
    const root = $('sheetRoot');
    root.innerHTML = `<div class="sheet-back"><div class="sheet ${cls}" role="dialog" aria-modal="true">
      <h2>${title}</h2>${body}
      <div class="actions">${cancel ? `<button id="sheetCancel">${cancel}</button>` : ''}<button class="primary" id="sheetOk">${ok}</button></div>
    </div></div>`;
    const close = v => { root.innerHTML = ''; resolve(v); };
    $('sheetOk').onclick = () => close(true);
    if (cancel) $('sheetCancel').onclick = () => close(false);
    root.querySelector('.sheet-back').addEventListener('pointerdown', e => { if (e.target.classList.contains('sheet-back')) close(false); });
    $('sheetOk').focus({ preventScroll: true });
  });
}

function hearts() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas'); cv.className = 'hearts'; document.body.appendChild(cv);
  const dpr = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d6457a';
  const ps = Array.from({ length: 36 }, () => ({ x: Math.random() * W, y: H + Math.random() * H * .4, s: 8 + Math.random() * 14, v: 2 + Math.random() * 3, w: Math.random() * 6, a: 1 }));
  let t = 0;
  (function frame() {
    ctx.clearRect(0, 0, W, H); t++;
    for (const p of ps) {
      p.y -= p.v; p.x += Math.sin((t + p.w * 20) / 18) * .8; if (p.y < H * .25) p.a -= .02;
      ctx.globalAlpha = Math.max(0, p.a); ctx.fillStyle = color;
      ctx.beginPath(); const s = p.s;
      ctx.moveTo(p.x, p.y + s * .3);
      ctx.bezierCurveTo(p.x, p.y, p.x - s / 2, p.y, p.x - s / 2, p.y + s * .3);
      ctx.bezierCurveTo(p.x - s / 2, p.y + s * .6, p.x, p.y + s * .75, p.x, p.y + s);
      ctx.bezierCurveTo(p.x, p.y + s * .75, p.x + s / 2, p.y + s * .6, p.x + s / 2, p.y + s * .3);
      ctx.bezierCurveTo(p.x + s / 2, p.y, p.x, p.y, p.x, p.y + s * .3);
      ctx.fill();
    }
    if (t < 220) requestAnimationFrame(frame); else cv.remove();
  })();
}
