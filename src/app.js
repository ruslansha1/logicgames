// ===== Игра Сугуру 9×9 =====
const SuguruApp = (() => {
  const KEY = 'suguru-dalya-v1';
  const LVL_NAME = { easy: 'Лёгкая', medium: 'Средняя', hard: 'Сложная' };

  let S = null;      // текущая партия
  let F = null, D = {}, gen = 0; // отложенная обычная партия, начатые задачи дня, номер запроса поля
  let geo = null;    // геометрия областей
  let level = 'medium';
  let cells = [];

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(Profiles.key(KEY)) || 'null');
      if (d) { level = d.level || level; F = d.free || null; D = d.dailies || {}; if (d.game && d.game.p) S = d.game; if (d.stats) Track.seed('suguru', d.stats); }
    } catch (e) {}
  }
  function save() {
    if (Profiles.locked) return;
    try { localStorage.setItem(Profiles.key(KEY), JSON.stringify({ level, game: S, free: F, dailies: D })); } catch (e) {}
  }

  function fresh(p, daily = null) {
    return { p, vals: p.givens.slice(), notes: new Array(81).fill(0), elapsed: 0, hints: 0, mistakes: 0, done: false, sel: -1, history: [], daily };
  }

  function newGame(lvl = level) {
    level = lvl;
    $('loading').hidden = false;
    const tok = ++gen;
    setTimeout(() => {
      if (tok !== gen) return;
      const p = Suguru.generate(lvl);
      S = fresh(p);
      $('loading').hidden = true;
      setup(); save(); Track.start('suguru');
    }, 30);
  }

  function setup() {
    geo = Suguru.buildGeo(S.p.reg);
    const board = $('board');
    board.innerHTML = '';
    cells = [];
    for (let i = 0; i < 81; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      d.addEventListener('pointerdown', e => { e.preventDefault(); select(i); });
      board.appendChild(d); cells.push(d);
    }
    board.appendChild(drawLines());
    document.querySelectorAll('#screen-suguru .seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lvl === S.p.difficulty)));
    render();
  }

  function drawLines() {
    const ns = 'http://www.w3.org/2000/svg', reg = S.p.reg;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 9 9'); svg.setAttribute('class', 'lines'); svg.setAttribute('preserveAspectRatio', 'none');
    const line = (x1, y1, x2, y2, cls) => {
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('class', cls); return l;
    };
    const thick = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const i = r * 9 + c;
      if (c < 8) { const t = reg[i] !== reg[i + 1];
        const l = line(c + 1, r, c + 1, r + 1, t ? 'thick' : 'thin'); (t ? thick.push(l) : svg.appendChild(l)); }
      if (r < 8) { const t = reg[i] !== reg[i + 9];
        const l = line(c, r + 1, c + 1, r + 1, t ? 'thick' : 'thin'); (t ? thick.push(l) : svg.appendChild(l)); }
    }
    thick.forEach(l => svg.appendChild(l));
    const f = document.createElementNS(ns, 'rect');
    f.setAttribute('x', 0); f.setAttribute('y', 0); f.setAttribute('width', 9); f.setAttribute('height', 9); f.setAttribute('class', 'frame');
    svg.appendChild(f);
    return svg;
  }

  function conflicts() {
    const bad = new Set();
    for (let i = 0; i < 81; i++) {
      const v = S.vals[i]; if (!v) continue;
      for (const p of geo.peers[i]) if (S.vals[p] === v) { bad.add(i); bad.add(p); }
    }
    return bad;
  }

  function render() {
    const bad = conflicts(), sel = S.sel, selVal = sel >= 0 ? S.vals[sel] : 0;
    for (let i = 0; i < 81; i++) {
      const d = cells[i], v = S.vals[i];
      d.classList.toggle('given', !!S.p.givens[i]);
      d.classList.toggle('sel', i === sel);
      d.classList.toggle('same', sel >= 0 && i !== sel && !!selVal && v === selVal);
      d.classList.toggle('bad', bad.has(i) && !S.p.givens[i]);
      if (v) d.textContent = v;
      else if (S.notes[i]) {
        let h = '<div class="notes">';
        for (let k = 1; k <= 5; k++) h += `<span>${S.notes[i] & (1 << (k - 1)) ? k : ''}</span>`;
        d.innerHTML = h + '</div>';
      } else d.textContent = '';
    }
    // цифры, которые подходят по размеру области
    const max = sel >= 0 ? geo.size[sel] : 5;
    const locked = sel < 0 || !!S.p.givens[sel] || S.done;
    document.querySelectorAll('#pad button').forEach((b, k) => { b.disabled = locked || k + 1 > max; });
    $('pad').classList.toggle('noting', notesMode);
    $('hintsUsed').textContent = S.hints;
    $('solved').textContent = Track.wins('suguru');
    $('timer').textContent = fmt(S.elapsed);
  }

  function select(i) { S.sel = i; render(); }

  function snapshot() {
    S.history.push([S.vals.slice(), S.notes.slice()]);
    if (S.history.length > 300) S.history.shift();
  }

  let notesMode = false;
  function input(n) {
    const i = S.sel;
    if (i < 0 || S.done || S.p.givens[i] || n > geo.size[i]) return;
    snapshot();
    if (notesMode && !S.vals[i]) {
      S.notes[i] ^= 1 << (n - 1);
    } else {
      S.vals[i] = S.vals[i] === n ? 0 : n;
      if (S.vals[i]) { const ok = n === S.p.solution[i]; if (!ok) S.mistakes = (S.mistakes || 0) + 1; Track.move('suguru', ok); }
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
    render(); save();
    if (S.vals.every((v, i) => v === S.p.solution[i])) win();
  }

  // ===== Подсказки =====
  async function askHint() {
    if (S.done) return;
    const go = await sheet({ title: HintGate.title, body: `<p>${HintGate.text}</p>`, ok: 'Получить подсказку', cancel: Profiles.G('Сама справлюсь', 'Сам справлюсь') });
    if (!go || !(await HintGate.request())) return;
    S.hints++; Track.hint('suguru'); save(); render();
    showHint();
  }

  function showHint() {
    const sol = S.p.solution;
    // сначала ошибки
    const wrong = S.vals.findIndex((v, i) => v && v !== sol[i]);
    if (wrong >= 0) {
      flash(wrong);
      sheet({ title: 'Тут закралась ошибка', body: '<p>В выделенной клетке стоит неверное число. Если его убрать, дальше пойдёт легче.</p>', ok: 'Стереть', cancel: 'Оставить' })
        .then(ok => { if (ok) { snapshot(); S.vals[wrong] = 0; afterMove(); } });
      return;
    }
    const grid = S.vals.slice(), cd = Suguru.candidatesFor(geo, grid);
    let step = null, usedElim = false;
    for (let guard = 0; guard < 400; guard++) {
      const st = Suguru.nextStep(geo, grid, cd, 2);
      if (!st) break;
      if (st.type === 'elim') { cd[st.cell] &= ~(1 << (st.value - 1)); usedElim = true; continue; }
      step = st; break;
    }
    let i, v, text;
    if (step) {
      i = step.cell; v = step.value;
      const n = geo.size[i];
      if (step.type === 'naked' && !usedElim) {
        const others = []; for (let k = 1; k <= n; k++) if (k !== v) others.push(k);
        text = n === 1
          ? 'Эта клетка сама по себе область, значит тут 1.'
          : `Область из ${n} клеток, значит здесь может быть только 1–${n}. ${others.length > 1 ? 'Числа ' + others.join(', ') + ' уже' : 'Число ' + others[0] + ' уже'} стоят в этой области или касаются клетки. Остаётся ${v}.`;
      } else if (step.type === 'hidden' && !usedElim) {
        text = `Посмотри на выделенную область: число ${v} в ней больше никуда не встаёт. В остальных свободных клетках оно касалось бы такой же ${v}.`;
      } else {
        text = `Здесь ${v}. Чтобы это увидеть, посмотри на соседние области: если все места для какого-то числа в области касаются одной клетки, в этой клетке такого числа быть не может.`;
      }
    } else {
      const empty = []; for (let k = 0; k < 81; k++) if (!S.vals[k]) empty.push(k);
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
    const ex = (cellsSvg) => `<svg viewBox="0 0 64 64">${cellsSvg}</svg>`;
    const box = (x, y, t, c) => `<rect x="${x}" y="${y}" width="20" height="20" fill="var(--area)" stroke="var(--line)" stroke-width="1"/>
      <text x="${x + 10}" y="${y + 15}" text-anchor="middle" font-size="13" font-family="Unbounded, sans-serif" fill="${c || 'var(--ink)'}">${t}</text>`;
    sheet({
      title: 'Как играть',
      body: `
        <div class="rule">${ex(box(12, 12, 1) + box(32, 12, 3) + box(12, 32, 4) + box(32, 32, 2) + '<rect x="12" y="12" width="40" height="40" fill="none" stroke="var(--ink)" stroke-width="2.5"/>')}
          <p>Поле разбито на области. В области из N клеток стоят числа от 1 до N, каждое по одному разу.</p></div>
        <div class="rule">${ex(box(12, 12, 2, 'var(--error)') + box(32, 32, 2, 'var(--error)') + box(32, 12, 1) + box(12, 32, 3))}
          <p>Одинаковые числа не могут касаться друг друга, даже уголком.</p></div>
        <p class="muted">Нажми на клетку, потом на цифру. В режиме «Заметки» можно ставить маленькие пометки. Клетки, которые нарушают правила, подсвечиваются красным.</p>`,
      ok: 'Понятно',
    });
  }

  function win() {
    S.done = true;
    const dl = S.daily ? Daily.solved('suguru', S.daily, { elapsed: S.elapsed, hints: S.hints, mistakes: S.mistakes || 0 }) : null;
    const { record } = Track.win('suguru', { lvl: S.p.difficulty, elapsed: S.elapsed, hints: S.hints, mistakes: S.mistakes || 0 });
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
    const tok = ++gen, ld = $('loading');
    ld.textContent = 'Готовлю задачу дня…'; ld.hidden = false;
    setTimeout(() => {
      if (tok !== gen) return;
      const p = Daily.puzzle('suguru', date);
      if (S && S.daily) { if (!S.done) D[S.daily] = S; } else if (S) F = S;
      const isNew = !D[date];
      S = D[date] || fresh(p, date); delete D[date];
      S.sel = -1;
      ld.hidden = true; ld.textContent = 'Рисую новое поле…';
      setup(); save(); if (isNew) Track.start('suguru');
      Daily.changed();
    }, 30);
  }
  function leaveDaily() {
    if (!S || !S.daily) return;
    ++gen; $('loading').hidden = true;
    if (!S.done) D[S.daily] = S;
    const ks = Object.keys(D).sort(); while (ks.length > 14) delete D[ks.shift()];
    S = F; F = null;
    if (S) { S.sel = -1; setup(); save(); } else newGame(level);
    Daily.changed();
  }

  // ===== Запуск =====
  function bind() {
    const pad = $('pad');
    for (let k = 1; k <= 5; k++) {
      const b = document.createElement('button'); b.textContent = k; b.id = 'pad' + k;
      b.addEventListener('click', () => input(k)); pad.appendChild(b);
    }
    document.querySelectorAll('#screen-suguru .seg button').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.lvl === S.p.difficulty && !S.done) return;
      const started = !S.done && S.vals.some((v, i) => v && !S.p.givens[i]);
      if (!started) return newGame(b.dataset.lvl);
      sheet({ title: 'Начать новую?', body: `<p>Текущая партия не решена. Начать новую, уровень «${LVL_NAME[b.dataset.lvl]}»?</p>`, ok: 'Начать', cancel: 'Остаться' })
        .then(ok => ok && newGame(b.dataset.lvl));
    }));
    $('newBtn').onclick = () => {
      const started = !S.done && S.vals.some((v, i) => v && !S.p.givens[i]);
      if (!started) return newGame(S.p.difficulty);
      sheet({ title: 'Начать новую?', body: '<p>Текущая партия не решена, прогресс пропадёт.</p>', ok: 'Начать', cancel: 'Остаться' })
        .then(ok => ok && newGame(S.p.difficulty));
    };
    $('undoBtn').onclick = undo;
    $('eraseBtn').onclick = erase;
    $('notesBtn').onclick = () => { notesMode = !notesMode; $('notesBtn').setAttribute('aria-pressed', String(notesMode)); render(); };
    $('hintBtn').onclick = askHint;
  }
  function keydown(e) {
    if (!S) return;
    if (e.key >= '1' && e.key <= '5') input(+e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') erase();
    else if (e.key === 'n' || e.key === 'т') $('notesBtn').click();
    else if ((e.metaKey || e.ctrlKey) && e.key === 'z') undo();
    else if (e.key.startsWith('Arrow')) {
      const i = S.sel < 0 ? 40 : S.sel, r = (i / 9) | 0, c = i % 9;
      const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      select(((r + dr + 9) % 9) * 9 + (c + dc + 9) % 9); e.preventDefault();
    }
  }
  function tick() {
    if (S && !S.done && $('loading').hidden) { S.elapsed++; Track.tick('suguru'); $('timer').textContent = fmt(S.elapsed); if (S.elapsed % 10 === 0) save(); }
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
  Track.register('suguru', { title: 'Сугуру', speed: [600, 360, 240] });
  addEventListener('pagehide', () => S && save());
  addEventListener('lg-save', () => S && save());
  document.addEventListener('visibilitychange', () => { if (document.hidden && S) save(); });
  return { show, openDaily, leaveDaily, daily: () => (S && S.daily) || null, tick, keydown, rules, solved: () => Track.wins('suguru') };
})();
