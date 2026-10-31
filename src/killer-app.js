// ===== Игра Киллер-судоку 9×9 =====
const KillerApp = (() => {
  const E = Killer, N = E.N, C = E.C;
  const KEY = 'killer-dalya-v1';
  const LVL_NAME = { easy: 'Лёгкая', medium: 'Средняя', hard: 'Сложная' };

  let S = null;      // текущая партия
  let F = null, D = {}, gen = 0; // отложенная обычная партия, начатые задачи дня, номер запроса поля
  let geo = null;    // клетки-суммы и соседи
  let level = 'medium';
  let cells = [], sums = [], cageEls = [], padBtns = [];
  let notesMode = false;

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(Profiles.key(KEY)) || 'null');
      if (d) { level = d.level || level; F = d.free || null; D = d.dailies || {}; if (d.game && d.game.p) S = d.game; }
    } catch (e) {}
  }
  function save() {
    if (Profiles.locked) return;
    try { localStorage.setItem(Profiles.key(KEY), JSON.stringify({ level, game: S, free: F, dailies: D })); } catch (e) {}
  }

  function fresh(p, daily = null) {
    return { p, vals: p.givens.slice(), notes: new Array(C).fill(0), elapsed: 0, hints: 0, mistakes: 0, done: false, sel: -1, history: [], counted: [], daily };
  }

  function newGame(lvl = level) {
    level = lvl;
    $('ksLoading').hidden = false;
    const tok = ++gen;
    setTimeout(() => {
      if (tok !== gen) return;
      const p = E.generate(lvl);
      S = fresh(p);
      $('ksLoading').hidden = true;
      setup(); save(); Track.start('killer');
    }, 30);
  }

  function setup() {
    geo = E.buildGeo(S.p.cages);
    S.counted = S.counted || [];
    const board = $('ksBoard');
    board.innerHTML = '';
    cells = []; sums = [];
    for (let i = 0; i < C; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      d.addEventListener('pointerdown', e => { e.preventDefault(); select(i); });
      board.appendChild(d); cells.push(d);
    }
    // сумма в левом верхнем углу клетки-суммы
    geo.cages.forEach((k, ci) => {
      const s = document.createElement('span');
      s.className = 'cage-sum'; s.textContent = k.sum;
      cells[geo.anchor[ci]].appendChild(s); cells[geo.anchor[ci]].classList.add('anchor'); sums.push(s);
    });
    board.appendChild(drawLines());
    document.querySelectorAll('#screen-killer .seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lvl === S.p.difficulty)));
    render();
  }

  function drawLines() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${N} ${N}`); svg.setAttribute('class', 'lines'); svg.setAttribute('preserveAspectRatio', 'none');
    const line = (x1, y1, x2, y2, cls) => {
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('class', cls); return l;
    };
    const thick = [];
    for (let k = 1; k < N; k++) {
      const v = line(k, 0, k, N, k % 3 ? 'thin' : 'thick'), h = line(0, k, N, k, k % 3 ? 'thin' : 'thick');
      for (const l of [v, h]) l.getAttribute('class') === 'thick' ? thick.push(l) : svg.appendChild(l);
    }
    thick.forEach(l => svg.appendChild(l));
    // пунктирные рамки клеток-сумм, чуть внутри клеток
    const m = .1, cageOf = geo.cageOf;
    const same = (r, c, ci) => r >= 0 && r < N && c >= 0 && c < N && cageOf[r * N + c] === ci;
    cageEls = geo.cages.map((k, ci) => {
      const g = document.createElementNS(ns, 'g'); g.setAttribute('class', 'cage');
      for (const i of k.cells) {
        const r = E.rowOf(i), c = E.colOf(i), in_ = (dr, dc) => same(r + dr, c + dc, ci);
        // верх и низ
        for (const [dr, y] of [[-1, r + m], [1, r + 1 - m]]) if (!in_(dr, 0)) {
          const x1 = !in_(0, -1) ? c + m : in_(dr, -1) ? c - m : c;
          const x2 = !in_(0, 1) ? c + 1 - m : in_(dr, 1) ? c + 1 + m : c + 1;
          g.appendChild(line(x1, y, x2, y, 'dash'));
        }
        // лево и право
        for (const [dc, x] of [[-1, c + m], [1, c + 1 - m]]) if (!in_(0, dc)) {
          const y1 = !in_(-1, 0) ? r + m : in_(-1, dc) ? r - m : r;
          const y2 = !in_(1, 0) ? r + 1 - m : in_(1, dc) ? r + 1 + m : r + 1;
          g.appendChild(line(x, y1, x, y2, 'dash'));
        }
      }
      svg.appendChild(g); return g;
    });
    const f = document.createElementNS(ns, 'rect');
    f.setAttribute('x', 0); f.setAttribute('y', 0); f.setAttribute('width', N); f.setAttribute('height', N); f.setAttribute('class', 'frame');
    svg.appendChild(f);
    return svg;
  }

  function conflicts() {
    const bad = new Set();
    for (let i = 0; i < C; i++) {
      const v = S.vals[i]; if (!v) continue;
      for (const p of geo.peers[i]) if (S.vals[p] === v) { bad.add(i); bad.add(p); }
    }
    return bad;
  }
  // клетка-сумма, где сумма уже не сходится
  function cageBad(k) {
    let s = 0, full = true;
    for (const i of k.cells) { if (S.vals[i]) s += S.vals[i]; else full = false; }
    return full ? s !== k.sum : s >= k.sum;
  }

  function render() {
    const bad = conflicts(), sel = S.sel, selVal = sel >= 0 ? S.vals[sel] : 0;
    const count = new Array(N + 1).fill(0);
    for (let i = 0; i < C; i++) {
      const d = cells[i], v = S.vals[i];
      if (v) count[v]++;
      d.classList.toggle('given', !!S.p.givens[i]);
      d.classList.toggle('sel', i === sel);
      d.classList.toggle('same', sel >= 0 && i !== sel && !!selVal && v === selVal);
      d.classList.toggle('bad', bad.has(i) && !S.p.givens[i]);
      let el = d.querySelector('.val');
      if (!el) { el = document.createElement('div'); el.className = 'val'; d.insertBefore(el, d.firstChild); }
      if (v) el.textContent = v;
      else if (S.notes[i]) {
        let h = '<div class="notes">';
        for (let k = 1; k <= N; k++) h += `<span>${S.notes[i] & (1 << (k - 1)) ? k : ''}</span>`;
        el.innerHTML = h + '</div>';
      } else el.textContent = '';
    }
    geo.cages.forEach((k, ci) => {
      sums[ci].classList.toggle('bad', cageBad(k));
      cageEls[ci].classList.toggle('on', sel >= 0 && geo.cageOf[sel] === ci);
    });
    const locked = sel < 0 || !!S.p.givens[sel] || S.done;
    padBtns.forEach((b, k) => { b.disabled = locked; b.classList.toggle('full', count[k + 1] >= N); });
    $('ksPad').classList.toggle('noting', notesMode);
    $('ksHints').textContent = S.hints;
    $('ksSolved').textContent = Track.wins('killer');
    $('ksTimer').textContent = fmt(S.elapsed);
  }

  function select(i) { S.sel = i; render(); }

  function snapshot() {
    S.history.push([S.vals.slice(), S.notes.slice()]);
    if (S.history.length > 300) S.history.shift();
  }

  function input(n) {
    const i = S.sel;
    if (i < 0 || S.done || S.p.givens[i]) return;
    snapshot();
    if (notesMode && !S.vals[i]) {
      S.notes[i] ^= 1 << (n - 1);
    } else {
      S.vals[i] = S.vals[i] === n ? 0 : n;
      if (S.vals[i]) { const ok = n === S.p.solution[i]; if (!ok) S.mistakes = (S.mistakes || 0) + 1; Track.move('killer', ok); }
      if (S.vals[i]) for (const p of geo.peers[i]) S.notes[p] &= ~(1 << (n - 1));
    }
    afterMove();
  }
  function erase() {
    const i = S.sel;
    if (i < 0 || S.done || S.p.givens[i] || (!S.vals[i] && !S.notes[i])) return;
    snapshot(); S.vals[i] = 0; S.notes[i] = 0; afterMove();
  }
  function undo() {
    if (S.done || !S.history.length) return;
    [S.vals, S.notes] = S.history.pop(); afterMove();
  }
  function afterMove() {
    // верно собранные клетки-суммы идут в достижение, каждая один раз за партию
    geo.cages.forEach((k, ci) => {
      if (S.counted.includes(ci) || k.cells.every(i => S.p.givens[i])) return;
      if (k.cells.every(i => S.vals[i] === S.p.solution[i])) { S.counted.push(ci); Track.bump('killer', 'cages'); }
    });
    render(); save();
    if (S.vals.every((v, i) => v === S.p.solution[i])) win();
  }

  // ===== Подсказки =====
  async function askHint() {
    if (S.done) return;
    const go = await sheet({ title: HintGate.title, body: `<p>${HintGate.text}</p>`, ok: 'Получить подсказку', cancel: Profiles.G('Сама справлюсь', 'Сам справлюсь') });
    if (!go || !(await HintGate.request())) return;
    S.hints++; Track.hint('killer'); save(); render();
    showHint();
  }

  const sets = list => {
    const t = list.slice(0, 4).map(m => E.digitsOf(m).join('+'));
    return (t.length > 1 ? t.slice(0, -1).join(', ') + ' или ' + t[t.length - 1] : t[0]) + (list.length > 4 ? ' и др.' : '');
  };
  const fits = list => (list.length > 1 ? `подходят только наборы ${sets(list)}` : `подходит только набор ${sets(list)}`);
  const place = U => ({
    row: `строке ${U.idx + 1}`, col: `столбце ${U.idx + 1}`, box: 'этом блоке 3×3',
    rows: `строках ${U.idx + 1}–${U.idx + U.n}`, cols: `столбцах ${U.idx + 1}–${U.idx + U.n}`,
  }[U.kind]);
  const IN = { row: 'одной строке', col: 'одном столбце', box: 'одном блоке' };
  const REST = { row: 'этой строки', col: 'этого столбца', box: 'этого блока' };
  const cageName = k => `клетки-суммы ${k.sum}`;

  function trickText(t) {
    switch (t.type) {
      case 'cage': return `В клетке-сумме ${t.cage.sum} из ${['', 'одной', 'двух', 'трёх', 'четырёх', 'пяти', 'шести'][t.cage.cells.length]} клеток ${fits(t.sets)}.`;
      case 'locked': return `В ${IN[t.from.kind]} цифра ${t.value} может встать только в клетки, которые лежат в ${IN[t.line.kind]}. Значит, в остальных клетках ${REST[t.line.kind]} ${t.value} нет.`;
      case 'cageLock': return `Цифра ${t.value} обязательно есть в клетке-сумме ${t.cage.sum}, и все её места там лежат в ${IN[t.unit.kind]}. Значит, в остальных клетках ${REST[t.unit.kind]} ${t.value} нет.`;
      case 'pair': return `В ${IN[t.unit.kind]} есть две клетки, где возможны только ${E.digitsOf(t.mask).join(' и ')}. Они займут эти клетки, поэтому в остальных клетках ${REST[t.unit.kind]} этих цифр нет.`;
      case 'innie2': return `Правило 45: сумма цифр в ${place(t.unit)} равна ${t.unit.total}. Если вычесть клетки-суммы, которые лежат там целиком, на две оставшиеся пустые клетки приходится ${t.total}${t.same ? ', и цифры в них разные' : ''}.`;
    }
    return '';
  }

  function showHint() {
    const sol = S.p.solution;
    const wrong = S.vals.findIndex((v, i) => v && v !== sol[i]);
    if (wrong >= 0) {
      S.sel = wrong; render(); flash(wrong);
      sheet({ title: 'Тут закралась ошибка', body: '<p>В выделенной клетке стоит неверная цифра. Если её убрать, дальше пойдёт легче.</p>', ok: 'Стереть', cancel: 'Оставить' })
        .then(ok => { if (ok) { snapshot(); S.vals[wrong] = 0; afterMove(); } });
      return;
    }
    const grid = S.vals.slice(), cd = E.candidatesFor(grid, geo), tricks = [];
    let step = null;
    for (let guard = 0; guard < 800; guard++) {
      const st = E.nextStep(grid, cd, geo, 3);
      if (!st) break;
      if (st.elim) { for (const e of st.elim) cd[e.cell] &= ~e.mask; tricks.push(st); continue; }
      step = st; break;
    }
    let i, v, text;
    if (step) {
      i = step.cell; v = step.value;
      // приём, который последним убрал кандидата там, где теперь видна цифра
      const near = step.type === 'naked' ? (e => e.cell === i) : step.type === 'hidden' ? (e => step.unit.cells.includes(e.cell) && (e.mask & (1 << (v - 1)))) : null;
      const trick = near && [...tricks].reverse().find(t => t.elim.some(near));
      const pre = trick ? trickText(trick) + ' ' : '';
      const R = step.r, p = R && (step.type === 'innie' ? R.rest : R.out).reduce((a, j) => a + S.vals[j], 0);
      switch (step.type) {
        case 'naked': text = `${pre}${trick ? 'Поэтому в' : 'В'} этой клетке может стоять только ${v}: остальные цифры уже есть в её строке, столбце, блоке или клетке-сумме.`; break;
        case 'hidden': text = `Посмотри на ${step.unit.kind === 'box' ? 'этот блок' : step.unit.kind === 'row' ? 'эту строку' : 'этот столбец'}: цифра ${v} может встать только в эту клетку.${trick ? ` А в другие нельзя вот почему. ${pre.trim()}` : ''}`; break;
        case 'cageLast': text = step.cage.cells.length === 1 ? `Эта клетка-сумма из одной клетки, так что здесь просто ${v}.` : `В клетке-сумме ${step.cage.sum} осталась одна пустая клетка: ${step.cage.sum} − ${step.cage.sum - v} = ${v}.`; break;
        case 'cageHidden': text = `Для клетки-суммы ${step.cage.sum} ${fits(step.sets)}. Цифра ${v} есть ${step.sets.length > 1 ? 'в каждом из них' : 'в нём'}, а встать может только сюда.`; break;
        case 'innie': text = `Правило 45: сумма цифр в ${place(step.unit)} равна ${step.unit.total}. Клетки-суммы, которые лежат там целиком, дают ${R.inSum}${p ? `, уже стоящие цифры ещё ${p}` : ''}. На эту клетку остаётся ${step.unit.total} − ${R.inSum}${p ? ` − ${p}` : ''} = ${v}.`; break;
        case 'outie': text = `Правило 45: клетки-суммы, которые задевают ${place(step.unit).replace(/^(строке|столбце|строках|столбцах|этом блоке)/, w => ({ строке: 'строку', столбце: 'столбец', строках: 'строки', столбцах: 'столбцы', 'этом блоке': 'этот блок' }[w]))}, вместе дают ${R.touchSum}. Это ${step.unit.total} плюс клетки снаружи${p ? `, где уже стоит ${p}` : ''}, так что здесь ${R.touchSum} − ${step.unit.total}${p ? ` − ${p}` : ''} = ${v}.`; break;
      }
    } else {
      const empty = []; for (let k = 0; k < C; k++) if (!S.vals[k]) empty.push(k);
      i = empty[Math.random() * empty.length | 0]; v = sol[i];
      text = `Здесь стоит ${v}.`;
    }
    S.sel = i; render(); flash(i);
    sheet({ title: 'Подсказка', body: `<p>${text}</p>`, ok: `Поставить ${v}`, cancel: Profiles.G('Дальше сама', 'Дальше сам') })
      .then(ok => { if (ok && !S.done) { snapshot(); S.vals[i] = v; afterMove(); } });
  }

  function flash(i) {
    const d = cells[i]; d.classList.remove('hint'); void d.offsetWidth; d.classList.add('hint');
    setTimeout(() => d.classList.remove('hint'), 3800);
  }

  function rules() {
    // картинка: клетка-сумма 10 из трёх клеток уголком
    const cell = (x, y, v) => `<rect x="${x}" y="${y}" width="20" height="20" fill="var(--area)" stroke="var(--line)" stroke-width="1"/>
      <text x="${x + 11}" y="${y + 16.5}" text-anchor="middle" font-size="10" font-family="Unbounded, sans-serif" fill="var(--user)">${v}</text>`;
    const g = cell(2, 2, 1) + cell(22, 2, 4) + cell(22, 22, 5) + cell(42, 2, '') + cell(2, 22, '') + cell(42, 22, '') + cell(2, 42, '') + cell(22, 42, '') + cell(42, 42, '') +
      '<path d="M4 4H40V40H24V20H4Z" fill="none" stroke="var(--ink)" stroke-width="1.2" stroke-dasharray="3 2"/>' +
      '<rect x="3" y="3" width="8" height="6" fill="var(--area)"/><text x="3.5" y="8.3" font-size="6" font-weight="700" font-family="Manrope, sans-serif" fill="var(--ink)">10</text>';
    sheet({
      title: 'Киллер-судоку',
      body: `
        <div class="rule"><svg viewBox="0 0 64 64">${g}</svg>
          <p>Как обычное судоку: в каждой строке, столбце и блоке 3×3 цифры от 1 до 9 без повторов.</p></div>
        <p>Пунктиром обведены клетки-суммы. Цифры в них складываются в число в уголке и не повторяются.</p>
        <p class="muted">Полезно помнить: сумма любой строки, столбца или блока равна 45. Нажми на клетку, потом на цифру. В режиме «Заметки» ставятся пометки. Повторы и несошедшиеся суммы подсвечиваются красным.</p>`,
      ok: 'Понятно',
    });
  }

  function win() {
    S.done = true;
    const dl = S.daily ? Daily.solved('killer', S.daily, { elapsed: S.elapsed, hints: S.hints, mistakes: S.mistakes || 0 }) : null;
    const { record } = Track.win('killer', { lvl: S.p.difficulty, elapsed: S.elapsed, hints: S.hints, mistakes: S.mistakes || 0 });
    save(); render(); hearts();
    sheet({
      cls: 'win',
      title: dl ? dl.title : praise(),
      body: `<div class="stats">
        <div><span>Время</span><b>${fmt(S.elapsed)}</b></div>
        <div><span>Уровень</span><b>${LVL_NAME[S.p.difficulty]}</b></div>
        <div><span>Подсказок</span><b>${S.hints}</b></div>
        <div><span>Ошибок</span><b>${S.mistakes || 0}</b></div></div>
        ${dl ? dl.html : ''}${record && !dl ? '<p class="muted">Новый рекорд без подсказок на этом уровне.</p>' : ''}`,
      ok: dl ? 'К задачам дня' : 'Ещё одну', cancel: 'Полюбоваться',
    }).then(ok => { if (!ok) return; if (dl) Daily.open(); else newGame(S.p.difficulty); });
    if (dl) Daily.changed();
  }

  // ===== Задача дня =====
  // Обычная партия откладывается в F, недорешённые задачи дня ждут в D
  function openDaily(date) {
    if (S && S.daily === date) { S.sel = -1; setup(); Daily.changed(); return; }
    const tok = ++gen, ld = $('ksLoading');
    ld.textContent = 'Готовлю задачу дня…'; ld.hidden = false;
    setTimeout(() => {
      if (tok !== gen) return;
      const p = Daily.puzzle('killer', date);
      if (S && S.daily) { if (!S.done) D[S.daily] = S; } else if (S) F = S;
      const isNew = !D[date];
      S = D[date] || fresh(p, date); delete D[date];
      S.sel = -1;
      ld.hidden = true; ld.textContent = 'Рисую новое поле…';
      setup(); save(); if (isNew) Track.start('killer');
      Daily.changed();
    }, 30);
  }
  function leaveDaily() {
    if (!S || !S.daily) return;
    ++gen; $('ksLoading').hidden = true;
    if (!S.done) D[S.daily] = S;
    const ks = Object.keys(D).sort(); while (ks.length > 14) delete D[ks.shift()];
    S = F; F = null;
    if (S) { S.sel = -1; setup(); save(); } else newGame(level);
    Daily.changed();
  }

  // ===== Запуск =====
  function bind() {
    const pad = $('ksPad');
    for (let k = 1; k <= N; k++) {
      const b = document.createElement('button'); b.textContent = k;
      b.addEventListener('click', () => input(k)); pad.appendChild(b); padBtns.push(b);
    }
    document.querySelectorAll('#screen-killer .seg button').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.lvl === S.p.difficulty && !S.done) return;
      const started = !S.done && S.vals.some((v, i) => v && !S.p.givens[i]);
      if (!started) return newGame(b.dataset.lvl);
      sheet({ title: 'Начать новую?', body: `<p>Текущая партия не решена. Начать новую, уровень «${LVL_NAME[b.dataset.lvl]}»?</p>`, ok: 'Начать', cancel: 'Остаться' })
        .then(ok => ok && newGame(b.dataset.lvl));
    }));
    $('ksNewBtn').onclick = () => {
      const started = !S.done && S.vals.some((v, i) => v && !S.p.givens[i]);
      if (!started) return newGame(S.p.difficulty);
      sheet({ title: 'Начать новую?', body: '<p>Текущая партия не решена, прогресс пропадёт.</p>', ok: 'Начать', cancel: 'Остаться' })
        .then(ok => ok && newGame(S.p.difficulty));
    };
    $('ksUndoBtn').onclick = undo;
    $('ksEraseBtn').onclick = erase;
    $('ksNotesBtn').onclick = () => { notesMode = !notesMode; $('ksNotesBtn').setAttribute('aria-pressed', String(notesMode)); render(); };
    $('ksHintBtn').onclick = askHint;
  }
  function keydown(e) {
    if (!S) return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '9') input(+k);
    else if (k === 'backspace' || k === 'delete' || k === '0') erase();
    else if (k === 'n' || k === 'т') $('ksNotesBtn').click();
    else if ((e.metaKey || e.ctrlKey) && k === 'z') undo();
    else if (e.key.startsWith('Arrow')) {
      const i = S.sel < 0 ? 40 : S.sel, r = E.rowOf(i), c = E.colOf(i);
      const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      select(((r + dr + N) % N) * N + (c + dc + N) % N); e.preventDefault();
    }
  }
  function tick() {
    if (S && !S.done && $('ksLoading').hidden) { S.elapsed++; Track.tick('killer'); $('ksTimer').textContent = fmt(S.elapsed); if (S.elapsed % 10 === 0) save(); }
  }
  let shown = false;
  function show(daily) {
    if (shown) { if (daily) openDaily(daily); return; }
    shown = true; bind();
    if (S) { S.sel = -1; setup(); }
    if (daily) openDaily(daily); else if (!S) newGame(level);
    try { if (!localStorage.getItem(Profiles.key(KEY + '-seen'))) { localStorage.setItem(Profiles.key(KEY + '-seen'), '1'); rules(); } } catch (e) {}
  }
  load();
  Track.register('killer', {
    title: 'Киллер-судоку', speed: [1800, 1200, 780],
    extra: (g, n) => [
      { id: 'killer-cages', icon: 'calc', title: 'Калькулятор', tiers: [50, 250, 1000], val: () => (g().extra || {}).cages || 0,
        desc: t => `Верно заполни ${n(t, 'клетку-сумму', 'клетки-суммы', 'клеток-сумм')}` },
      { id: 'killer-cold', icon: 'snow', title: 'Хладнокровие', tiers: [1, 5, 20], val: () => (g().perfect || {}).hard || 0,
        desc: t => `Реши сложное киллер-судоку без подсказок и ошибок${t > 1 ? ` ${n(t, 'раз', 'раза', 'раз')}` : ''}` },
    ],
  });
  addEventListener('pagehide', () => S && save());
  addEventListener('lg-save', () => S && save());
  document.addEventListener('visibilitychange', () => { if (document.hidden && S) save(); });
  return { show, openDaily, leaveDaily, daily: () => (S && S.daily) || null, tick, keydown, rules, solved: () => Track.wins('killer') };
})();
