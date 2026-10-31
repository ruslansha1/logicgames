// ===== Задача дня =====
// Каждый день в каждой игре одна общая для всех головоломка повышенной сложности.
// Поле зависит только от даты: генератор запускается с зерном «игра + дата», поэтому у всех
// игроков и на всех телефонах в один день одинаковые задачи. День меняется в полночь по Москве.
const Daily = (() => {
  const FIRST = '2026-10-01';          // самый ранний день в календаре
  const ORDER = ['suguru', 'sudoku', 'killer'];
  const KEY = () => Profiles.key('logicgames-daily');
  const CACHE = 'logicgames-daily-cache';  // готовые поля, общие для всех профилей
  const MAX_FREEZE = 2;
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const n = (v, a, b, c) => `${v} ${plural(v, a, b, c)}`;

  // ----- даты по Москве (UTC+3 круглый год) -----
  const MSK = 3 * 3600e3;
  const today = () => new Date(Date.now() + MSK).toISOString().slice(0, 10);
  const addDays = (d, k) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
  const dow = d => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = понедельник
  const human = d => `${+d.slice(8)} ${MONTHS_GEN[+d.slice(5, 7) - 1]}`;
  function untilMidnight() {
    const ms = 864e5 - (Date.now() + MSK) % 864e5, m = Math.ceil(ms / 6e4);
    return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : n(m, 'минуту', 'минуты', 'минут');
  }

  // ----- воспроизводимый генератор -----
  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    let a = h >>> 0;
    return () => {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const count = a => a.reduce((s, v) => s + (v ? 1 : 0), 0);
  // из нескольких «сложных» берём самую трудную: где чаще нужны приёмы сложнее одиночек
  const GEN = {
    suguru: { tries: 4, make: () => Suguru.generate('hard'), score: p => Suguru.logicSolve(Suguru.buildGeo(p.reg), p.givens, 2).tricks * 10 - count(p.givens) },
    sudoku: { tries: 3, make: () => Sudoku12.generate('hard'), score: p => Sudoku12.logicSolve(p.givens, 2).tricks * 10 - count(p.givens) },
    killer: { tries: 2, make: () => Killer.generate('hard'), score: p => Killer.logicSolve(p.givens, Killer.buildGeo(p.cages), 3).tricks * 10 - p.cages.length },
  };
  function build(gid, date) {
    const g = GEN[gid], orig = Math.random;
    Math.random = seeded(`logicgames-daily:${gid}:${date}:v1`);
    try {
      let best = null, bs = -Infinity;
      for (let k = 0; k < g.tries; k++) { const p = g.make(), s = g.score(p); if (s > bs) { bs = s; best = p; } }
      return best;
    } finally { Math.random = orig; }
  }
  function puzzle(gid, date) {
    let c = null;
    try { c = JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch (e) {}
    if (!c || c.v !== 1) c = { v: 1, items: {} };
    const k = gid + ':' + date;
    if (!c.items[k]) {
      c.items[k] = build(gid, date);
      const keys = Object.keys(c.items);
      if (keys.length > 12) keys.sort((a, b) => a.slice(-10).localeCompare(b.slice(-10))).slice(0, keys.length - 12).forEach(x => delete c.items[x]);
      try { localStorage.setItem(CACHE, JSON.stringify(c)); } catch (e) {}
    }
    return JSON.parse(JSON.stringify(c.items[k]));
  }

  // ----- что решено -----
  // st.s[дата][игра] = { at: дата решения по Москве, t: секунды, h: подсказки, m: ошибки }
  let st = null;
  function load() {
    try { st = JSON.parse(localStorage.getItem(KEY()) || 'null'); } catch (e) {}
    if (!st || typeof st.s !== 'object') st = { s: {} };
  }
  function save() { if (Profiles.locked) return; try { localStorage.setItem(KEY(), JSON.stringify(st)); } catch (e) {} }
  const rec = (d, gid) => (st.s[d] || {})[gid];
  const onTime = d => ORDER.some(g => { const r = rec(d, g); return r && r.at === d; });

  // Серия: день засчитан, если в этот же день (по Москве) решена хотя бы одна его задача.
  // Заморозки: одна есть с самого начала, каждый понедельник добавляется ещё одна, копить можно до двух.
  // Пропуск при ненулевой серии сам тратит заморозку, серия не прерывается (но и не растёт).
  let memo = null, ver = 0;
  function streak() {
    const t = today(), key = t + ':' + ver;
    if (memo && memo.key === key) return memo;
    const days = Object.keys(st.s).filter(onTime).sort();
    const r = { streak: 0, best: 0, freezes: 1, frozen: new Set(), savedByFreeze: 0, todayDone: onTime(t), key };
    if (days.length) {
      for (let d = days[0]; d <= t; d = addDays(d, 1)) {
        if (d !== days[0] && dow(d) === 0) r.freezes = Math.min(MAX_FREEZE, r.freezes + 1);
        if (onTime(d)) { r.streak++; r.best = Math.max(r.best, r.streak); if (r.pendingFreeze) { r.savedByFreeze++; r.pendingFreeze = 0; } }
        else if (d === t) { /* сегодня ещё можно успеть */ }
        else if (r.streak > 0 && r.freezes > 0) { r.freezes--; r.frozen.add(d); r.pendingFreeze = 1; }
        else { r.streak = 0; r.pendingFreeze = 0; }
      }
    }
    return (memo = r);
  }
  function stats() {
    let total = 0, solo = 0, late = 0, full = 0;
    for (const [d, gs] of Object.entries(st.s)) {
      let same = 0;
      for (const g of ORDER) {
        const r = gs[g]; if (!r) continue;
        total++; if (!r.h) solo++; if (r.at !== d) late++; else same++;
      }
      if (same === ORDER.length) full++;
    }
    return { total, solo, late, full };
  }

  function solved(gid, date, { elapsed, hints, mistakes }) {
    const before = streak().streak, t = today();
    const first = !rec(date, gid);
    if (first) { ver++; (st.s[date] = st.s[date] || {})[gid] = { at: t, t: elapsed, h: hints, m: mistakes }; save(); }
    const s = streak(), left = ORDER.filter(g => !rec(date, g));
    let html;
    if (date !== t) html = `<p class="dl-note">${date < t ? 'Пропущенный день' : 'День'} отмечен в календаре. Серию прошлые дни не продлевают, но достижения за задачи дня считаются.</p>`;
    else if (s.streak > before) html = `<div class="dl-win"><span class="dl-fire">${FLAME}</span><div><b>${n(s.streak, 'день', 'дня', 'дней')} подряд</b><small>${s.streak === 1 ? 'Серия началась! Завтра будет новая задача.' : 'Серия продлена, так держать!'}</small></div></div>`;
    else html = `<div class="dl-win"><span class="dl-fire">${FLAME}</span><div><b>${n(s.streak, 'день', 'дня', 'дней')} подряд</b><small>${left.length ? `Осталось ${n(left.length, 'задача', 'задачи', 'задач')} этого дня` : 'Все три задачи дня решены!'}</small></div></div>`;
    return { title: date === t ? 'Задача дня решена!' : `${human(date)}: решено!`, html, first };
  }

  // ----- достижения -----
  Track.addGlobal(() => {
    const s = () => stats();
    return [
      { id: 'daily-streak', group: 'daily', icon: 'flame', title: 'Огонёк', tiers: [3, 7, 30, 100], val: () => streak().best, desc: t => `Решай задачу дня ${n(t, 'день', 'дня', 'дней')} подряд` },
      { id: 'daily-count', group: 'daily', icon: 'calendar', title: 'Задачи дня', tiers: [1, 10, 50, 200], val: () => s().total, desc: t => (t === 1 ? 'Реши первую задачу дня' : `Реши ${n(t, 'задачу', 'задачи', 'задач')} дня`) },
      { id: 'daily-full', group: 'daily', icon: 'triple', title: 'Полный день', tiers: [1, 7, 30], val: () => s().full, desc: t => `Реши все три задачи дня в тот же день${t > 1 ? ` ${n(t, 'раз', 'раза', 'раз')}` : ''}` },
      { id: 'daily-solo', group: 'daily', icon: 'bulb', title: 'Ясная голова', tiers: [5, 25, 100], val: () => s().solo, desc: t => `Реши ${n(t, 'задачу', 'задачи', 'задач')} дня без подсказок` },
      { id: 'daily-late', group: 'daily', icon: 'rewind', title: 'Наверстаю', tiers: [1, 5, 20], val: () => s().late, desc: t => `Реши ${n(t, 'пропущенную задачу', 'пропущенные задачи', 'пропущенных задач')} из календаря` },
      { id: 'daily-freeze', group: 'daily', icon: 'snow', title: 'Морозоустойчивость', tiers: [1], val: () => streak().savedByFreeze, desc: () => `Заморозка спасла серию, и ты ${Profiles.G('продолжила', 'продолжил')} её` },
    ];
  });

  // ----- баннер на главной -----
  const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22c4 0 7-2.8 7-6.8 0-3.7-2.6-5.7-4-9.2-1 2-2 3-3.6 3.2.2-2.4-.4-4.6-2.4-6.7-.8 4.4-5 6.8-5 12.4C4 19.2 7.6 22 12 22Z"/><path class="core" d="M12 22c-1.7 0-3-1.2-3-3 0-2 1.6-2.8 2.5-4.6.9 1.5 3.5 2.5 3.5 4.6 0 1.8-1.3 3-3 3Z"/></svg>';
  const SNOW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4l2.5 2.5L14.5 4M9.5 20l2.5-2.5 2.5 2.5"/></svg>';
  const cur = () => (typeof GAMES !== 'undefined' && typeof current !== 'undefined' ? current : 'suguru');
  let lastDay = '';
  function changed() {
    if (typeof GAMES === 'undefined') return;
    for (const k in GAMES) { const el = $('screen-' + k); if (el) el.classList.toggle('is-daily', !!GAMES[k].app.daily()); }
    renderBar();
  }
  function renderBar() {
    const bar = $('dailyBar'); if (!bar) return;
    const t = today(); lastDay = t;
    const s = streak(), playing = GAMES[cur()].app.daily();
    if (playing) {
      const g = GAMES[cur()];
      bar.className = 'daily-bar in-daily';
      bar.innerHTML = `<button class="db-main" id="dbOpen"><span class="db-cal"><b>${+playing.slice(8)}</b><small>${MONTHS_GEN[+playing.slice(5, 7) - 1].slice(0, 3)}</small></span>
        <span class="db-txt"><b>${playing === t ? 'Задача дня' : 'Задача ' + human(playing)}</b><small>${g.title} · повышенная сложность</small></span></button>
        <button class="db-exit" id="dbExit">Выйти<span aria-hidden="true">×</span></button>`;
      $('dbExit').onclick = () => GAMES[cur()].app.leaveDaily();
    } else {
      const done = ORDER.filter(g => rec(t, g)).length;
      const sub = s.todayDone ? (done < 3 ? `Серия продлена · решено ${done} из 3` : 'Все три решены, до завтра!')
        : s.streak ? 'Реши одну из трёх, продли серию' : 'Реши одну из трёх и начни серию';
      bar.className = `daily-bar ${s.todayDone ? 'lit' : s.streak ? 'warn' : ''}`;
      bar.innerHTML = `<button class="db-main" id="dbOpen"><span class="db-flame">${FLAME}<b>${s.streak}</b></span>
        <span class="db-txt"><b>Задача дня</b><small>${sub}</small></span>
        <span class="db-dots">${ORDER.map(g => `<i class="${rec(t, g) ? 'on' : ''}"></i>`).join('')}</span><span class="chev" aria-hidden="true">›</span></button>`;
    }
    $('dbOpen').onclick = () => open();
    $('dbOpen').classList.toggle('pulse', !playing && !s.todayDone);
  }
  function tick() { if (today() !== lastDay) { renderBar(); } }

  // ----- окно «Задача дня» с календарём -----
  let selDay = null, month = null;
  // day: выбранный день (по умолчанию сегодня), keep: не перелистывать календарь
  function open(day, keep) {
    const t = today();
    selDay = day || t;
    if (!keep || !month) month = selDay.slice(0, 7);
    const s = streak(), x = stats();
    const card = gid => {
      const g = GAMES[gid], r = rec(selDay, gid), prog = GAMES[gid].app.daily() === selDay;
      const state = r ? `<em class="ok">✓ ${fmt(r.t)}</em>` : prog ? '<em class="go">Играю</em>' : '<em>Начать</em>';
      return `<button class="dl-card ${r ? 'done' : ''}" data-g="${gid}" ${r ? 'disabled' : ''}>
        <span class="game-ico ${gid}" aria-hidden="true"></span>
        <span class="game-txt"><b>${g.title} <i>${g.size}</i></b><small>${r ? (r.at === selDay ? 'Решено в срок' : `Решено ${human(r.at)}`) + (r.h ? ` · ${n(r.h, 'подсказка', 'подсказки', 'подсказок')}` : ' · без подсказок') : 'Повышенная сложность'}</small></span>${state}</button>`;
    };
    // календарь месяца
    const [y, m] = month.split('-').map(Number);
    const first = `${month}-01`, dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let cells = '';
    for (let k = 0; k < dow(first); k++) cells += '<span></span>';
    for (let dd = 1; dd <= dim; dd++) {
      const d = `${month}-${String(dd).padStart(2, '0')}`, gs = st.s[d] || {}, cnt = ORDER.filter(g => gs[g]).length;
      const cls = [d === t ? 'today' : '', d === selDay ? 'sel' : '', onTime(d) ? 'fire' : cnt ? 'late' : '', s.frozen.has(d) ? 'frozen' : '', cnt === 3 ? 'full' : '', d > t || d < FIRST ? 'off' : ''].filter(Boolean).join(' ');
      cells += `<button class="cal-d ${cls}" data-d="${d}" ${d > t || d < FIRST ? 'disabled' : ''}><b>${dd}</b>${s.frozen.has(d) ? `<span class="cal-snow">${SNOW}</span>` : `<span class="cal-dots">${ORDER.map(g => `<i class="${gs[g] ? 'on' : ''}"></i>`).join('')}</span>`}</button>`;
    }
    const prevM = addDays(first, -1).slice(0, 7), nextM = addDays(`${month}-${dim}`, 1).slice(0, 7);
    const el = Track.panel(`
      <h2 class="dl-title">Задача дня</h2>
      <div class="dl-hero ${s.todayDone ? 'lit' : ''}" id="dlPanel">
        <span class="dl-fire big">${FLAME}</span>
        <div class="dl-hero-txt"><b>${s.streak}</b><span>${plural(s.streak, 'день', 'дня', 'дней')} подряд</span>
          <small>${s.todayDone ? 'Сегодня засчитано' : s.streak ? 'Сегодня ещё не решено' : 'Начни серию сегодня'} · лучшая ${s.best}</small></div>
        <div class="dl-freeze" title="Заморозки">${Array.from({ length: MAX_FREEZE }, (_, k) => `<span class="${k < s.freezes ? 'on' : ''}">${SNOW}</span>`).join('')}<small>${n(s.freezes, 'заморозка', 'заморозки', 'заморозок')}</small></div>
      </div>
      <div class="dl-day"><h2>${selDay === t ? 'Сегодня' : human(selDay)}</h2><small>${selDay === t ? `${human(t)} · новые через ${untilMidnight()}` : 'Прошлый день: серию не продлит, но попадёт в календарь'}</small></div>
      <div class="games">${ORDER.map(card).join('')}</div>
      <div class="cal">
        <div class="cal-head"><button class="cal-nav" id="calPrev" ${prevM < FIRST.slice(0, 7) ? 'disabled' : ''} aria-label="Предыдущий месяц">‹</button>
          <b>${MONTHS[m - 1]} ${y}</b>
          <button class="cal-nav" id="calNext" ${nextM > t.slice(0, 7) ? 'disabled' : ''} aria-label="Следующий месяц">›</button></div>
        <div class="cal-grid cal-wd">${['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(w => `<span>${w}</span>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
        <div class="cal-legend"><span><i class="lg-fire"></i>в срок</span><span><i class="lg-late"></i>позже</span><span><i class="lg-snow">${SNOW}</i>заморозка</span></div>
      </div>
      <div class="dl-sum"><div><b>${x.total}</b><small>${plural(x.total, 'задача решена', 'задачи решено', 'задач решено')}</small></div><div><b>${x.full}</b><small>${plural(x.full, 'полный день', 'полных дня', 'полных дней')}</small></div><div><b>${x.solo}</b><small>без подсказок</small></div></div>
      <details class="dl-rules"><summary>Как считается серия</summary>
        <p>Каждый день в полночь по Москве появляются три новые задачи, по одной в каждой игре. Они одинаковые у всех игроков и сложнее обычных.</p>
        <p>День засчитывается в серию, если в этот же день решена хотя бы одна из трёх задач.</p>
        <p>Заморозка спасает серию, если пропустить день: она срабатывает сама. Одна заморозка есть сразу, ещё одна добавляется каждый понедельник, копить можно до двух.</p>
        <p>Пропущенные дни можно решить из календаря: они отмечаются и идут в достижения, но серию не восстанавливают.</p>
      </details>`, 'daily');
    el.querySelectorAll('.dl-card:not([disabled])').forEach(b => b.onclick = () => play(b.dataset.g, selDay));
    el.querySelectorAll('.cal-d:not([disabled])').forEach(b => b.onclick = () => open(b.dataset.d, true));
    $('calPrev').onclick = () => { month = prevM; open(selDay, true); };
    $('calNext').onclick = () => { month = nextM; open(selDay, true); };
  }
  function play(gid, date) {
    $('sheetRoot').innerHTML = '';
    switchTo(gid, date);
  }

  // для профиля
  function summary() { const s = streak(), x = stats(); return { streak: s.streak, best: s.best, freezes: s.freezes, total: x.total, todayDone: s.todayDone }; }

  load();
  return { today, puzzle, solved, changed, open, tick, summary, FLAME, ORDER };
})();
