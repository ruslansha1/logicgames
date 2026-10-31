// ===== Игра Судоку 12×12 =====
const SudokuApp = (() => {
  const E = Sudoku12, N = E.N, C = E.C, SYM = E.SYM;
  const KEY = 'sudoku12-dalya-v1';
  const LVL_NAME = { easy: 'Лёгкая', medium: 'Средняя', hard: 'Сложная' };

  let S = null;      // текущая партия
  let F = null, D = {}, gen = 0; // отложенная обычная партия, начатые задачи дня, номер запроса поля
  let level = 'medium';
  let cells = [], padBtns = [];
  let notesMode = false;

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(Profiles.key(KEY)) || 'null');
      if (d) { level = d.level || level; F = d.free || null; D = d.dailies || {}; if (d.game && d.game.p) S = d.game; if (d.stats) Track.seed('sudoku', d.stats); }
    } catch (e) {}
  }
  function save() {
    if (Profiles.locked) return;
    try { localStorage.setItem(Profiles.key(KEY), JSON.stringify({ level, game: S, free: F, dailies: D })); } catch (e) {}
  }

  function fresh(p, daily = null) {
    return { p, vals: p.givens.slice(), notes: new Array(C).fill(0), elapsed: 0, hints: 0, mistakes: 0, done: false, sel: -1, history: [], daily };
  }

  function newGame(lvl = level) {
    level = lvl;
    $('sdLoading').hidden = false;
    const tok = ++gen;
    setTimeout(() => {
      if (tok !== gen) return;
      const p = E.generate(lvl);
      S = fresh(p);
      $('sdLoading').hidden = true;
      setup(); save(); Track.start('sudoku');
    }, 30);
  }

  function setup() {
    const board = $('sdBoard');
    board.innerHTML = '';
    cells = [];
    for (let i = 0; i < C; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      d.addEventListener('pointerdown', e => { e.preventDefault(); select(i); });
      board.appendChild(d); cells.push(d);
    }
    board.appendChild(drawLines());
    document.querySelectorAll('#screen-sudoku .seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lvl === S.p.difficulty)));
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
      const v = line(k, 0, k, N, k % E.BC ? 'thin' : 'thick'), h = line(0, k, N, k, k % E.BR ? 'thin' : 'thick');
      for (const l of [v, h]) l.getAttribute('class') === 'thick' ? thick.push(l) : svg.appendChild(l);
    }
    thick.forEach(l => svg.appendChild(l));
    const f = document.createElementNS(ns, 'rect');
    f.setAttribute('x', 0); f.setAttribute('y', 0); f.setAttribute('width', N); f.setAttribute('height', N); f.setAttribute('class', 'frame');
    svg.appendChild(f);
    return svg;
  }

  function conflicts() {
    const bad = new Set();
    for (let i = 0; i < C; i++) {
      const v = S.vals[i]; if (!v) continue;
      for (const p of E.PEERS[i]) if (S.vals[p] === v) { bad.add(i); bad.add(p); }
    }
    return bad;
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
      d.classList.toggle('two', v > 9);
      if (v) d.textContent = SYM[v];
      else if (S.notes[i]) {
        let h = '<div class="notes">';
        // показываем только отмеченные числа подряд: двузначным в сетке 4×3 тесно
        for (let k = 1; k <= N; k++) if (S.notes[i] & (1 << (k - 1))) h += `<span>${SYM[k]}</span>`;
        d.innerHTML = h + '</div>';
      } else d.textContent = '';
    }
    const locked = sel < 0 || !!S.p.givens[sel] || S.done;
    // число, которое уже стоит 12 раз, приглушаем
    padBtns.forEach((b, k) => { b.disabled = locked; b.classList.toggle('full', count[k + 1] >= N); });
    $('sdPad').classList.toggle('noting', notesMode);
    $('sdHints').textContent = S.hints;
    $('sdSolved').textContent = Track.wins('sudoku');
    $('sdTimer').textContent = fmt(S.elapsed);
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
      if (S.vals[i]) { const ok = n === S.p.solution[i]; if (!ok) S.mistakes = (S.mistakes || 0) + 1; Track.move('sudoku', ok); }
      if (S.vals[i]) for (const p of E.PEERS[i]) S.notes[p] &= ~(1 << (n - 1));
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
    render(); save();
    if (S.vals.every((v, i) => v === S.p.solution[i])) win();
  }

  // ===== Подсказки =====
  async function askHint() {
    if (S.done) return;
    const go = await sheet({ title: HintGate.title, body: `<p>${HintGate.text}</p>`, ok: 'Получить подсказку', cancel: Profiles.G('Сама справлюсь', 'Сам справлюсь') });
    if (!go || !(await HintGate.request())) return;
    S.hints++; Track.hint('sudoku'); save(); render();
    showHint();
  }

  function showHint() {
    const sol = S.p.solution;
    // сначала ошибки
    const wrong = S.vals.findIndex((v, i) => v && v !== sol[i]);
    if (wrong >= 0) {
      S.sel = wrong; render(); flash(wrong);
      sheet({ title: 'Тут закралась ошибка', body: '<p>В выделенной клетке стоит неверное число. Если его убрать, дальше пойдёт легче.</p>', ok: 'Стереть', cancel: 'Оставить' })
        .then(ok => { if (ok) { snapshot(); S.vals[wrong] = 0; afterMove(); } });
      return;
    }
    const grid = S.vals.slice(), cd = E.candidatesFor(grid);
    let step = null, trick = null;
    for (let guard = 0; guard < 600; guard++) {
      const st = E.nextStep(grid, cd, 2);
      if (!st) break;
      if (st.elim) { for (const e of st.elim) cd[e.cell] &= ~e.mask; trick = trick || st; continue; }
      step = st; break;
    }
    let i, v, text;
    if (step) {
      i = step.cell; v = step.value;
      const s = SYM[v];
      if (trick) {
        const IN = { row: 'одной строке', col: 'одном столбце', box: 'одном блоке' };
        const REST = { row: 'этой строки', col: 'этого столбца', box: 'этого блока' };
        text = trick.type === 'locked'
          ? `Здесь ${s}. Чтобы это увидеть, нужен приём посложнее: в ${IN[trick.from.kind]} число ${SYM[trick.value]} может встать только в клетки, которые лежат в ${IN[trick.line.kind]}. Значит, в остальных клетках ${REST[trick.line.kind]} ${SYM[trick.value]} быть не может.`
          : `Здесь ${s}. Чтобы это увидеть, нужен приём посложнее: в ${IN[trick.unit.kind]} есть две клетки, где возможны только одни и те же два числа. Они займут эти клетки, поэтому в остальных клетках ${REST[trick.unit.kind]} этих чисел нет.`;
      } else if (step.type === 'naked') {
        text = `В этой клетке может стоять только ${s}: все остальные числа уже есть в её строке, столбце или блоке.`;
      } else {
        text = `Посмотри на ${step.unit.kind === 'box' ? 'выделенный блок' : step.unit.kind === 'row' ? 'эту строку' : 'этот столбец'}: число ${s} может встать только в эту клетку, в остальных оно повторило бы число из той же строки, столбца или блока.`;
      }
    } else {
      const empty = []; for (let k = 0; k < C; k++) if (!S.vals[k]) empty.push(k);
      i = empty[Math.random() * empty.length | 0]; v = sol[i];
      text = `Здесь стоит ${SYM[v]}.`;
    }
    S.sel = i; render(); flash(i);
    sheet({ title: 'Подсказка', body: `<p>${text}</p>`, ok: `Поставить ${SYM[v]}`, cancel: Profiles.G('Дальше сама', 'Дальше сам') })
      .then(ok => { if (ok && !S.done) { snapshot(); S.vals[i] = v; afterMove(); } });
  }

  function flash(i) {
    const d = cells[i]; d.classList.remove('hint'); void d.offsetWidth; d.classList.add('hint');
    setTimeout(() => d.classList.remove('hint'), 3800);
  }

  function rules() {
    // мини-блок 3×4 для картинки
    const demo = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    let g = '';
    demo.forEach((v, k) => {
      const x = 2 + (k % 4) * 15, y = 9.5 + ((k / 4) | 0) * 15;
      g += `<rect x="${x}" y="${y}" width="15" height="15" fill="var(--area)" stroke="var(--line)" stroke-width="1"/>
        <text x="${x + 7.5}" y="${y + 11}" text-anchor="middle" font-size="${v > 9 ? 7.5 : 9.5}" font-family="Unbounded, sans-serif" fill="var(--ink)">${SYM[v]}</text>`;
    });
    g += '<rect x="2" y="9.5" width="60" height="45" fill="none" stroke="var(--ink)" stroke-width="2.5"/>';
    sheet({
      title: 'Судоку 12×12',
      body: `
        <div class="rule"><svg viewBox="0 0 64 64">${g}</svg>
          <p>Поле разбито на 12 блоков по 3×4 клетки. В каждом блоке стоят числа от 1 до 12, каждое по одному разу.</p></div>
        <p>То же правило для каждой строки и каждого столбца: в них все числа от 1 до 12, без повторов.</p>
        <p class="muted">Нажми на клетку, потом на число. В режиме «Заметки» можно ставить маленькие пометки. Повторы подсвечиваются красным.</p>`,
      ok: 'Понятно',
    });
  }

  function win() {
    S.done = true;
    const dl = S.daily ? Daily.solved('sudoku', S.daily, { elapsed: S.elapsed, hints: S.hints, mistakes: S.mistakes || 0 }) : null;
    const { record } = Track.win('sudoku', { lvl: S.p.difficulty, elapsed: S.elapsed, hints: S.hints, mistakes: S.mistakes || 0 });
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
    const tok = ++gen, ld = $('sdLoading');
    ld.textContent = 'Готовлю задачу дня…'; ld.hidden = false;
    setTimeout(() => {
      if (tok !== gen) return;
      const p = Daily.puzzle('sudoku', date);
      if (S && S.daily) { if (!S.done) D[S.daily] = S; } else if (S) F = S;
      const isNew = !D[date];
      S = D[date] || fresh(p, date); delete D[date];
      S.sel = -1;
      ld.hidden = true; ld.textContent = 'Рисую новое поле…';
      setup(); save(); if (isNew) Track.start('sudoku');
      Daily.changed();
    }, 30);
  }
  function leaveDaily() {
    if (!S || !S.daily) return;
    ++gen; $('sdLoading').hidden = true;
    if (!S.done) D[S.daily] = S;
    const ks = Object.keys(D).sort(); while (ks.length > 14) delete D[ks.shift()];
    S = F; F = null;
    if (S) { S.sel = -1; setup(); save(); } else newGame(level);
    Daily.changed();
  }

  // ===== Запуск =====
  function bind() {
    const pad = $('sdPad');
    for (let k = 1; k <= N; k++) {
      const b = document.createElement('button'); b.textContent = SYM[k];
      b.addEventListener('click', () => input(k)); pad.appendChild(b); padBtns.push(b);
    }
    document.querySelectorAll('#screen-sudoku .seg button').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.lvl === S.p.difficulty && !S.done) return;
      const started = !S.done && S.vals.some((v, i) => v && !S.p.givens[i]);
      if (!started) return newGame(b.dataset.lvl);
      sheet({ title: 'Начать новую?', body: `<p>Текущая партия не решена. Начать новую, уровень «${LVL_NAME[b.dataset.lvl]}»?</p>`, ok: 'Начать', cancel: 'Остаться' })
        .then(ok => ok && newGame(b.dataset.lvl));
    }));
    $('sdNewBtn').onclick = () => {
      const started = !S.done && S.vals.some((v, i) => v && !S.p.givens[i]);
      if (!started) return newGame(S.p.difficulty);
      sheet({ title: 'Начать новую?', body: '<p>Текущая партия не решена, прогресс пропадёт.</p>', ok: 'Начать', cancel: 'Остаться' })
        .then(ok => ok && newGame(S.p.difficulty));
    };
    $('sdUndoBtn').onclick = undo;
    $('sdEraseBtn').onclick = erase;
    $('sdNotesBtn').onclick = () => { notesMode = !notesMode; $('sdNotesBtn').setAttribute('aria-pressed', String(notesMode)); render(); };
    $('sdHintBtn').onclick = askHint;
  }
  function keydown(e) {
    if (!S) return;
    const k = e.key.toLowerCase(), abc = { a: 10, b: 11, c: 12, 'ф': 10, 'и': 11, 'с': 12 };
    if (k >= '1' && k <= '9') input(+k);
    else if (abc[k] && !e.metaKey && !e.ctrlKey) input(abc[k]);
    else if (k === 'backspace' || k === 'delete' || k === '0') erase();
    else if (k === 'n' || k === 'т') $('sdNotesBtn').click();
    else if ((e.metaKey || e.ctrlKey) && k === 'z') undo();
    else if (e.key.startsWith('Arrow')) {
      const i = S.sel < 0 ? 66 : S.sel, r = E.rowOf(i), c = E.colOf(i);
      const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      select(((r + dr + N) % N) * N + (c + dc + N) % N); e.preventDefault();
    }
  }
  function tick() {
    if (S && !S.done && $('sdLoading').hidden) { S.elapsed++; Track.tick('sudoku'); $('sdTimer').textContent = fmt(S.elapsed); if (S.elapsed % 10 === 0) save(); }
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
  Track.register('sudoku', { title: 'Судоку 12×12', speed: [2100, 1380, 900] });
  addEventListener('pagehide', () => S && save());
  addEventListener('lg-save', () => S && save());
  document.addEventListener('visibilitychange', () => { if (document.hidden && S) save(); });
  return { show, openDaily, leaveDaily, daily: () => (S && S.daily) || null, tick, keydown, rules, solved: () => Track.wins('sudoku') };
})();
