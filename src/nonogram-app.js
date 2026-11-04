// ===== Игра Нонограммы (японский кроссворд) =====
const NonogramApp = (() => {
  const E = Nonogram;
  const KEY = 'nonogram-dalya-v1';
  const GID = 'nonogram';
  const LVL_NAME = { easy: '15×15', medium: '20×20', hard: '25×25' };
  const FILL = 1, CROSS = 2;

  let S = null;        // текущая партия: { p, st, elapsed, hints, mistakes, done, hist, redo }
  let level = 'medium', gen = 0;
  let mode = FILL;
  let N = 0, cells = [], rowEls = [], colEls = [], corner = null, cs = 0, L = 0, T = 0;
  let cur = -1;        // клетка под пальцем / курсор клавиатуры
  let zoom = false, zoomPref = null; // «Лупа»: поле крупнее экрана, двигается двумя пальцами; null = само

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(Profiles.key(KEY)) || 'null');
      if (d) { level = d.level || level; mode = d.mode === CROSS ? CROSS : FILL; zoomPref = typeof d.zoom === 'boolean' ? d.zoom : null; if (d.game && d.game.p) S = d.game; }
    } catch (e) {}
  }
  function save() {
    if (Profiles.locked) return;
    try { localStorage.setItem(Profiles.key(KEY), JSON.stringify({ level, mode, zoom: zoomPref, game: S })); } catch (e) {}
  }
  const fresh = p => ({ p, st: new Array(p.N * p.N).fill(0), elapsed: 0, hints: 0, mistakes: 0, done: false, hist: [], redo: [] });

  function newGame(lvl = level) {
    level = lvl;
    $('ngLoading').hidden = false;
    const tok = ++gen;
    setTimeout(() => {
      if (tok !== gen) return;
      S = fresh(E.generate(lvl));
      $('ngLoading').hidden = true;
      setup(); save(); Track.start(GID);
    }, 30);
  }

  // ----- поле -----
  function setup() {
    const p = S.p; N = p.N; cur = -1;
    const board = $('ngBoard');
    board.innerHTML = ''; board.classList.toggle('won', S.done);
    board.style.setProperty('--n', N);
    corner = document.createElement('canvas'); corner.className = 'ng-corner'; board.appendChild(corner);
    colEls = p.cols.map((cl, c) => {
      const d = document.createElement('div'); d.className = 'ng-clue col';
      d.style.gridColumn = c + 2; d.style.gridRow = 1;
      d.innerHTML = (cl.length ? cl : [0]).map(v => `<span>${v}</span>`).join('');
      if ((c + 1) % 5 === 0 && c < N - 1) d.classList.add('b5');
      board.appendChild(d); return d;
    });
    rowEls = p.rows.map((cl, r) => {
      const d = document.createElement('div'); d.className = 'ng-clue row';
      d.style.gridRow = r + 2; d.style.gridColumn = 1;
      d.innerHTML = (cl.length ? cl : [0]).map(v => `<span>${v}</span>`).join('');
      if ((r + 1) % 5 === 0 && r < N - 1) d.classList.add('b5');
      board.appendChild(d); return d;
    });
    cells = [];
    for (let i = 0; i < N * N; i++) {
      const r = Math.floor(i / N), c = i % N, d = document.createElement('div');
      d.className = 'nc';
      d.style.gridRow = r + 2; d.style.gridColumn = c + 2;
      if ((c + 1) % 5 === 0 && c < N - 1) d.classList.add('br');
      if ((r + 1) % 5 === 0 && r < N - 1) d.classList.add('bb');
      if (c === N - 1) d.classList.add('er');
      if (r === N - 1) d.classList.add('eb');
      if (c === 0) d.classList.add('el');
      if (r === 0) d.classList.add('et');
      board.appendChild(d); cells.push(d);
    }
    document.querySelectorAll('#screen-nonogram .seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lvl === p.difficulty)));
    if (!$('screen-nonogram').hidden) $('brandSize').textContent = `${N}×${N}`;
    layout(); render();
  }

  // Размер клетки подбирается под ширину и высоту экрана, с местом под числа слева и сверху
  function layout() {
    if (!S || !N) return;
    const wrap = $('ngWrap'), board = $('ngBoard');
    const p = S.p;
    // размеры чисел в пикселях при клетке k (те же формулы, что в стилях .ng-clue)
    const fs = k => Math.max(8, Math.min(17, k * .55));
    const rowW = (k, cl) => { cl = cl.length ? cl : [0]; return cl.reduce((a, v) => a + String(v).length * fs(k) * .64, 0) + Math.max(3, k * .16) * (cl.length - 1) + Math.max(4, k * .2) + 6; };
    const sizeL = k => Math.ceil(Math.max(k, ...p.rows.map(cl => rowW(k, cl))));
    const sizeT = k => Math.ceil(Math.max(k, Math.max(...p.cols.map(cl => cl.length || 1)) * (fs(k) + Math.max(1, k * .1)) + Math.max(4, k * .18) + 4));
    const W = wrap.clientWidth;
    // сколько места по высоте: всё окно минус то, что выше поля, и то, что ниже
    const top = wrap.getBoundingClientRect().top + scrollY;
    let below = 0;
    for (let el = wrap.nextElementSibling; el; el = el.nextElementSibling) below += el.offsetHeight + 14;
    const cssB = parseFloat(getComputedStyle(document.documentElement).paddingBottom) || 0;
    const H = Math.max(220, innerHeight - top - below - 16 - cssB - 12);
    cs = 40;
    while (cs > 6 && (sizeL(cs) + N * cs > W - 10 || sizeT(cs) + N * cs > H)) cs--;
    // с лупой клетки крупные, а поле прокручивается внутри рамки высотой H.
    // Пока игрок сам не выбрал, лупа включается, когда клетки на весь экран слишком мелкие
    zoom = zoomPref ?? cs < 16;
    if (zoom) cs = Math.max(cs, Math.min(32, Math.floor(cs * 2)));
    wrap.classList.toggle('zoom', zoom);
    wrap.style.height = zoom ? `${Math.floor(H)}px` : '';
    L = sizeL(cs); T = sizeT(cs);
    board.style.gridTemplateColumns = `${L}px repeat(${N}, ${cs}px)`;
    board.style.gridTemplateRows = `${T}px repeat(${N}, ${cs}px)`;
    board.style.setProperty('--cs', cs + 'px'); board.style.setProperty('--fs', fs(cs) + 'px');
    const dpr = devicePixelRatio || 1;
    corner.width = L * dpr; corner.height = T * dpr;
    drawCorner();
  }

  // уменьшенная картинка в левом верхнем углу
  function drawCorner() {
    if (!corner || !corner.width) return;
    const ctx = corner.getContext('2d'), w = corner.width, h = corner.height;
    ctx.clearRect(0, 0, w, h);
    const px = Math.max(1, Math.floor(Math.min(w, h) * .92 / N)), ox = (w - px * N) / 2 | 0, oy = (h - px * N) / 2 | 0;
    const cssv = getComputedStyle(document.documentElement);
    ctx.fillStyle = cssv.getPropertyValue('--area').trim() || '#eee';
    ctx.fillRect(ox, oy, px * N, px * N);
    ctx.fillStyle = (S.done ? cssv.getPropertyValue('--accent') : cssv.getPropertyValue('--ink')).trim() || '#000';
    for (let i = 0; i < N * N; i++) if (S.st[i] === FILL) ctx.fillRect(ox + (i % N) * px, oy + Math.floor(i / N) * px, px, px);
  }

  const lineVals = (kind, k) => (kind === 'row' ? E.rowCells(N, k) : E.colCells(N, k)).map(i => S.st[i] === FILL ? 1 : 0);
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  // линия собрана, если блоки закрашенных клеток совпадают с числами
  const lineDone = (kind, k) => same(E.runs(lineVals(kind, k)), (kind === 'row' ? S.p.rows : S.p.cols)[k]);
  // ошибка видна сразу, если в линии закрашено больше, чем нужно, или блок длиннее самого длинного числа
  function lineOver(kind, k) {
    const cl = (kind === 'row' ? S.p.rows : S.p.cols)[k], r = E.runs(lineVals(kind, k));
    const need = cl.reduce((a, b) => a + b, 0), have = r.reduce((a, b) => a + b, 0);
    return have > need || (r.length && Math.max(...r) > Math.max(0, ...cl)) || !lineGaps(kind, k);
  }
  // есть ли в линии ещё неотмеченные клетки (тогда блоков может стать меньше, когда их соединят)
  const lineGaps = (kind, k) => (kind === 'row' ? E.rowCells(N, k) : E.colCells(N, k)).some(i => !S.st[i]);

  function render() {
    const cr = cur >= 0 ? Math.floor(cur / N) : -1, cc = cur >= 0 ? cur % N : -1;
    const doneR = [], doneC = [];
    for (let k = 0; k < N; k++) {
      doneR[k] = lineDone('row', k); doneC[k] = lineDone('col', k);
      rowEls[k].classList.toggle('done', doneR[k]); colEls[k].classList.toggle('done', doneC[k]);
      rowEls[k].classList.toggle('bad', !doneR[k] && lineOver('row', k));
      colEls[k].classList.toggle('bad', !doneC[k] && lineOver('col', k));
      rowEls[k].classList.toggle('hl', k === cr); colEls[k].classList.toggle('hl', k === cc);
    }
    for (let i = 0; i < N * N; i++) {
      const d = cells[i], v = S.st[i], r = Math.floor(i / N), c = i % N;
      d.classList.toggle('f', v === FILL);
      d.classList.toggle('x', v === CROSS);
      // в собранной линии пустые клетки помечаются точкой
      d.classList.toggle('dot', !v && (doneR[r] || doneC[c]));
      d.classList.toggle('hl', !S.done && (r === cr || c === cc));
      d.classList.toggle('cur', !S.done && i === cur);
    }
    $('ngModeFill').setAttribute('aria-pressed', String(mode === FILL));
    $('ngZoomBtn').setAttribute('aria-pressed', String(zoom));
    $('ngModeCross').setAttribute('aria-pressed', String(mode === CROSS));
    $('ngUndoBtn').disabled = S.done || !S.hist.length;
    $('ngRedoBtn').disabled = S.done || !S.redo.length;
    $('ngHints').textContent = S.hints;
    $('ngSolved').textContent = Track.wins(GID);
    $('ngTimer').textContent = fmt(S.elapsed);
    drawCorner();
  }

  // ----- ходы -----
  // Ход — список [клетка, было, стало]; так история короткая и её можно хранить
  // count = false: служебная правка (очистка поля, исправление ошибок), в статистику не идёт
  function apply(changes, count = true) {
    changes = changes.filter(([, from, to]) => from !== to);
    if (!changes.length) return;
    let good = 0;
    for (const [i, , to] of changes) {
      S.st[i] = to;
      if (!count || !to) continue;
      const right = (to === FILL) === (S.p.solution[i] === 1);
      if (right) { if (to === FILL) good++; } else S.mistakes++;
      Track.move(GID, right);
    }
    S.hist.push(changes); S.redo = [];
    if (S.hist.length > 400) S.hist.shift();
    if (good) Track.bump(GID, 'cells', good);
    afterMove();
  }
  function undo() {
    if (S.done || !S.hist.length) return;
    const ch = S.hist.pop(); S.redo.push(ch);
    for (const [i, from] of ch) S.st[i] = from;
    afterMove();
  }
  function redo() {
    if (S.done || !S.redo.length) return;
    const ch = S.redo.pop(); S.hist.push(ch);
    for (const [i, , to] of ch) S.st[i] = to;
    afterMove();
  }
  function afterMove() {
    render(); save();
    if (S.p.solution.every((v, i) => (v === 1) === (S.st[i] === FILL))) win();
  }

  // ----- управление пальцем -----
  // Касание меняет клетку, протяжка красит всю линию в том же направлении.
  // Что делать, решает первая клетка: закрасить, поставить крестик или стереть.
  let drag = null;
  const pts = new Map(); // пальцы на поле: при втором пальце рисование отменяется и поле двигается
  let pan = null;
  function cellAt(x, y) {
    const r0 = cells[0].getBoundingClientRect();
    const c = Math.floor((x - r0.left) / cs), r = Math.floor((y - r0.top) / cs);
    return { r: Math.max(0, Math.min(N - 1, r)), c: Math.max(0, Math.min(N - 1, c)), inside: r >= 0 && c >= 0 && r < N && c < N };
  }
  function onDown(e) {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) {
      e.preventDefault();
      if (drag) { for (const [i, from] of drag.touched) S.st[i] = from; drag = null; render(); }
      const w = $('ngWrap'); pan = { x: mid().x, y: mid().y, sl: w.scrollLeft, st: w.scrollTop };
      return;
    }
    if (!S || S.done || drag) return;
    const at = cellAt(e.clientX, e.clientY);
    if (!at.inside) return;
    e.preventDefault();
    try { $('ngBoard').setPointerCapture(e.pointerId); } catch (err) {}
    const i = at.r * N + at.c, from = S.st[i];
    const to = from === mode ? 0 : mode;
    drag = { id: e.pointerId, r: at.r, c: at.c, axis: null, from, to, touched: new Map() };
    cur = i;
    paint(at.r, at.c);
  }
  const mid = () => { const a = [...pts.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; };
  function onMove(e) {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pan && pts.size >= 2) {
      e.preventDefault();
      const w = $('ngWrap'), m = mid();
      w.scrollLeft = pan.sl - (m.x - pan.x); w.scrollTop = pan.st - (m.y - pan.y);
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    const at = cellAt(e.clientX, e.clientY);
    if (!drag.axis) {
      if (at.r === drag.r && at.c === drag.c) return;
      drag.axis = Math.abs(at.r - drag.r) >= Math.abs(at.c - drag.c) ? 'col' : 'row';
    }
    const r = drag.axis === 'row' ? drag.r : at.r, c = drag.axis === 'col' ? drag.c : at.c;
    // красим отрезок от начала до пальца, чтобы быстрая протяжка не пропускала клетки
    const [a, b] = drag.axis === 'row' ? [Math.min(drag.c, c), Math.max(drag.c, c)] : [Math.min(drag.r, r), Math.max(drag.r, r)];
    for (let k = a; k <= b; k++) drag.axis === 'row' ? paint(drag.r, k) : paint(k, drag.c);
    cur = r * N + c; render();
  }
  function paint(r, c) {
    const i = r * N + c;
    if (drag.touched.has(i) || S.st[i] !== drag.from) return;
    drag.touched.set(i, S.st[i]);
    S.st[i] = drag.to;
    render();
  }
  function onUp(e) {
    pts.delete(e.pointerId);
    if (pts.size < 2) pan = null;
    if (!drag || e.pointerId !== drag.id) return;
    const ch = [...drag.touched].map(([i, from]) => [i, from, S.st[i]]);
    drag = null;
    for (const [i, from] of ch) S.st[i] = from; // apply сам проставит и запишет в историю
    apply(ch);
  }

  function setMode(m) { mode = m; save(); render(); }

  // ----- подсказки -----
  async function askHint() {
    if (S.done) return;
    const go = await sheet({ title: HintGate.title, body: `<p>${HintGate.text}</p>`, ok: 'Получить подсказку', cancel: Profiles.G('Сама справлюсь', 'Сам справлюсь') });
    if (!go || !(await HintGate.request())) return;
    S.hints++; Track.hint(GID); save(); render();
    showHint();
  }
  const where = (kind, k) => (kind === 'row' ? `строке ${k + 1}` : `столбце ${k + 1}`);
  const whereNom = (kind, k) => (kind === 'row' ? `Строка ${k + 1}` : `Столбец ${k + 1}`);
  function flash(list, cls = 'hint') {
    for (const i of list) { const d = cells[i]; d.classList.remove(cls); void d.offsetWidth; d.classList.add(cls); }
    setTimeout(() => list.forEach(i => cells[i].classList.remove(cls)), 3800);
  }
  function showHint() {
    const sol = S.p.solution;
    const wrong = [];
    S.st.forEach((v, i) => { if ((v === FILL && sol[i] !== 1) || (v === CROSS && sol[i] === 1)) wrong.push(i); });
    if (wrong.length) {
      flash(wrong, 'oops');
      if (zoom) cells[wrong[0]].scrollIntoView({ block: 'center', inline: 'center' });
      sheet({
        title: 'Тут закралась ошибка',
        body: `<p>${wrong.length === 1 ? 'Выделенная клетка отмечена' : `Выделенные клетки (${wrong.length}) отмечены`} неверно. Если ${wrong.length === 1 ? 'её' : 'их'} очистить, дальше пойдёт легче.</p>`,
        ok: 'Очистить', cancel: 'Оставить',
      }).then(ok => { if (ok && !S.done) apply(wrong.map(i => [i, S.st[i], 0]), false); });
      return;
    }
    const step = E.nextStep({ rows: S.p.rows, cols: S.p.cols }, N, S.st);
    if (!step) return;
    const el = step.kind === 'row' ? rowEls[step.idx] : colEls[step.idx];
    el.classList.remove('hint'); void el.offsetWidth; el.classList.add('hint');
    setTimeout(() => el.classList.remove('hint'), 3800);
    flash(step.fill); flash(step.empty, 'hint-x');
    cur = step.fill[0] ?? step.empty[0]; render();
    if (zoom) cells[cur].scrollIntoView({ block: 'center', inline: 'center' });
    const cl = step.clue, sum = cl.reduce((a, b) => a + b, 0) + Math.max(0, cl.length - 1);
    const known = step.cells.some(i => S.st[i]);
    const blocks = cl.length > 1 ? `блоки ${cl.join(', ')}` : `блок ${cl[0]}`;
    let text;
    if (!cl.length) text = `В ${where(step.kind, step.idx)} число 0: закрашенных клеток там нет, все клетки пустые.`;
    else if (!step.fill.length && lineDone(step.kind, step.idx)) text = `В ${where(step.kind, step.idx)} все блоки уже на месте, остальные клетки пустые.`;
    else if (!known && sum === N) text = `${whereNom(step.kind, step.idx)}: ${blocks}${cl.length > 1 ? ' с пробелами между ними' : ''} занимают ровно ${N} клеток, то есть всю линию. Расставить их можно только одним способом.`;
    else if (!known && step.fill.length) text = `${whereNom(step.kind, step.idx)}: ${blocks}${cl.length > 1 ? ' вместе с обязательными пробелами' : ''} занимают ${sum} из ${N} клеток. Как их ни сдвигай, выделенные клетки будут закрашены при любой расстановке.`;
    else text = `Посмотри на ${step.kind === 'row' ? 'строку' : 'столбец'} ${step.idx + 1} (${cl.join(' ')}) и на то, что в ${step.kind === 'row' ? 'ней' : 'нём'} уже отмечено. Как ни расставляй ${cl.length > 1 ? 'блоки' : 'блок'}, ${[step.fill.length ? 'клетки с подсветкой всегда закрашены' : '', step.empty.length ? 'клетки с пунктиром всегда пустые' : ''].filter(Boolean).join(', а ')}.`;
    const act = step.fill.length && step.empty.length ? 'Отметить' : step.fill.length ? 'Закрасить' : 'Поставить крестики';
    sheet({ title: 'Подсказка', body: `<p>${text}</p>`, ok: act, cancel: Profiles.G('Дальше сама', 'Дальше сам') })
      .then(ok => { if (ok && !S.done) apply([...step.fill.map(i => [i, S.st[i], FILL]), ...step.empty.map(i => [i, S.st[i], CROSS])]); });
  }

  function rules() {
    // картинка: строка «3 1» и её решение, пустые клетки с крестиком
    const sq = (k, f) => {
      const x = 15 + k * 8;
      return `<rect x="${x}" y="28" width="8" height="8" fill="${f ? 'var(--ink)' : 'var(--surface)'}" stroke="var(--line)" stroke-width=".7"/>` +
        (f ? '' : `<path d="M${x + 2.3} 30.3l3.4 3.4M${x + 5.7} 30.3l-3.4 3.4" stroke="var(--muted)" stroke-width=".8"/>`);
    };
    const g = [1, 1, 1, 0, 1, 0].map((f, k) => sq(k, f)).join('') +
      '<text x="13" y="34.6" font-size="7" font-weight="700" font-family="Manrope, sans-serif" fill="var(--accent)" text-anchor="end">3 1</text>';
    sheet({
      title: 'Нонограммы',
      body: `
        <div class="rule"><svg viewBox="0 0 64 64">${g}</svg>
          <p>Числа слева и сверху — длины закрашенных блоков в строке или столбце, по порядку. Например, «3 1» значит: три клетки подряд, потом хотя бы одна пустая, потом ещё одна.</p></div>
        <p>Закрась нужные клетки, и проступит картинка.</p>
        <p class="muted">Нажми на клетку или проведи пальцем по линии. Режим «Крестик» отмечает клетки, которые точно пустые. Собранные строки и столбцы становятся серыми, а переполненные — красными.</p>`,
      ok: 'Понятно',
    });
  }

  function pictureSvg() {
    let r = '';
    S.p.solution.forEach((v, i) => { if (v) r += `<rect x="${i % N}" y="${Math.floor(i / N)}" width="1.02" height="1.02"/>`; });
    return `<svg class="ng-pic" viewBox="0 0 ${N} ${N}" aria-hidden="true"><rect width="${N}" height="${N}" fill="var(--area)"/><g fill="var(--accent)">${r}</g></svg>`;
  }

  function win() {
    S.done = true; cur = -1;
    $('ngBoard').classList.add('won');
    const { record } = Track.win(GID, { lvl: S.p.difficulty, elapsed: S.elapsed, hints: S.hints, mistakes: S.mistakes });
    save(); render(); hearts();
    setTimeout(() => sheet({
      cls: 'win',
      title: praise(),
      body: `${pictureSvg()}<div class="stats">
        <div><span>Время</span><b>${fmt(S.elapsed)}</b></div>
        <div><span>Поле</span><b>${N}×${N}</b></div>
        <div><span>Подсказок</span><b>${S.hints}</b></div>
        <div><span>Ошибок</span><b>${S.mistakes}</b></div></div>
        ${record ? '<p class="muted">Новый рекорд без подсказок на этом уровне.</p>' : ''}`,
      ok: 'Ещё одну', cancel: 'Полюбоваться',
    }).then(ok => ok && newGame(S.p.difficulty)), 700);
  }

  // ----- запуск -----
  const started = () => !S.done && S.st.some(v => v);
  function bind() {
    const board = $('ngBoard');
    board.addEventListener('pointerdown', onDown);
    board.addEventListener('pointermove', onMove);
    board.addEventListener('pointerup', onUp);
    board.addEventListener('pointercancel', onUp);
    $('ngModeFill').onclick = () => setMode(FILL);
    $('ngModeCross').onclick = () => setMode(CROSS);
    document.querySelectorAll('#screen-nonogram .seg button').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.lvl === S.p.difficulty && !S.done) return;
      if (!started()) return newGame(b.dataset.lvl);
      sheet({ title: 'Начать новую?', body: `<p>Текущая картинка не разгадана. Начать новую, поле ${LVL_NAME[b.dataset.lvl]}?</p>`, ok: 'Начать', cancel: 'Остаться' })
        .then(ok => ok && newGame(b.dataset.lvl));
    }));
    $('ngNewBtn').onclick = () => {
      if (!started()) return newGame(S.p.difficulty);
      sheet({ title: 'Начать новую?', body: '<p>Текущая картинка не разгадана, прогресс пропадёт.</p>', ok: 'Начать', cancel: 'Остаться' })
        .then(ok => ok && newGame(S.p.difficulty));
    };
    $('ngUndoBtn').onclick = undo;
    $('ngRedoBtn').onclick = redo;
    $('ngClearBtn').onclick = () => {
      if (!started()) return;
      sheet({ title: 'Очистить поле?', body: '<p>Все закрашенные клетки и крестики пропадут. Это можно отменить кнопкой «Отменить».</p>', ok: 'Очистить', cancel: 'Не надо' })
        .then(ok => { if (ok && !S.done) apply(S.st.map((v, i) => [i, v, 0]), false); });
    };
    $('ngHintBtn').onclick = askHint;
    $('ngZoomBtn').onclick = () => { zoomPref = !zoom; save(); layout(); render(); };
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!$('screen-nonogram').hidden) layout(); }, 80); });
  }
  function keydown(e) {
    if (!S || S.done) return;
    const k = e.key.toLowerCase();
    if (k === 'x' || k === 'ч') setMode(mode === FILL ? CROSS : FILL);
    else if ((e.metaKey || e.ctrlKey) && k === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); }
    else if (e.key.startsWith('Arrow')) {
      const i = cur < 0 ? 0 : cur, r = Math.floor(i / N), c = i % N;
      const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      cur = ((r + dr + N) % N) * N + (c + dc + N) % N; render(); e.preventDefault();
    } else if ((k === ' ' || k === 'enter') && cur >= 0) {
      const v = S.st[cur]; apply([[cur, v, v === mode ? 0 : mode]]); e.preventDefault();
    }
  }
  function tick() {
    if (S && !S.done && $('ngLoading').hidden) { S.elapsed++; Track.tick(GID); $('ngTimer').textContent = fmt(S.elapsed); if (S.elapsed % 10 === 0) save(); }
  }
  let shown = false;
  function show() {
    if (shown) { if (S) { $('brandSize').textContent = `${N}×${N}`; layout(); } return; }
    shown = true; bind();
    if (S) setup(); else newGame(level);
    try { if (!localStorage.getItem(Profiles.key(KEY + '-seen'))) { localStorage.setItem(Profiles.key(KEY + '-seen'), '1'); rules(); } } catch (e) {}
  }
  load();
  Track.register(GID, {
    title: 'Нонограммы', speed: [1500, 900, 540],
    extra: (g, n) => [
      { id: 'nonogram-cells', icon: 'brush', title: 'Кисть мастера', tiers: [500, 3000, 15000], val: () => (g().extra || {}).cells || 0,
        desc: t => `Верно закрась ${n(t, 'клетку', 'клетки', 'клеток')} в нонограммах` },
      { id: 'nonogram-pure', icon: 'pixel', title: 'Чистый холст', tiers: [1, 5, 20], val: () => (g().perfect || {}).hard || 0,
        desc: t => `Разгадай самую большую нонограмму 25×25 без подсказок и ошибок${t > 1 ? ` ${n(t, 'раз', 'раза', 'раз')}` : ''}` },
    ],
  });
  addEventListener('pagehide', () => S && save());
  addEventListener('lg-save', () => S && save());
  document.addEventListener('visibilitychange', () => { if (document.hidden && S) save(); });
  return { show, openDaily() {}, leaveDaily() {}, daily: () => null, tick, keydown, rules, solved: () => Track.wins(GID) };
})();
