// ===== Статистика и достижения =====
// Игры сообщают о событиях через Track: start, move, hint, tick, win.
// Новая игра подключается одной строкой Track.register(id, { title, speed }) и сразу
// попадает в общую статистику, получает свои достижения и раздел в витрине.
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
const LEVELS = { easy: 'Лёгкая', medium: 'Средняя', hard: 'Сложная' };

const Track = (() => {
  const META = {};   // зарегистрированные игры, в порядке подключения
  const KEY = () => Profiles.key('logicgames-stats');
  let st = null, ticks = 0;
  const blank = () => ({ games: {}, days: { last: '', streak: 0, best: 0, count: 0 }, run: 0, bestRun: 0, flags: {}, ach: {}, seen: {}, init: false });
  const gblank = () => ({ wins: {}, best: {}, started: 0, correct: 0, wrong: 0, hints: 0, time: 0, clean: 0, solo: 0 });

  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY()) || 'null'); } catch (e) {}
    st = Object.assign(blank(), d || {});
  }
  function save() { if (Profiles.locked) return; try { localStorage.setItem(KEY(), JSON.stringify(st)); } catch (e) {} }
  const G = gid => st.games[gid] || (st.games[gid] = gblank());

  // ----- сводные величины -----
  const sumG = f => Object.values(st.games).reduce((a, g) => a + f(g), 0);
  const winsOf = g => Object.values(g.wins).reduce((a, b) => a + b, 0);
  const total = {
    wins: () => sumG(winsOf),
    hard: () => sumG(g => g.wins.hard || 0),
    correct: () => sumG(g => g.correct),
    wrong: () => sumG(g => g.wrong),
    hints: () => sumG(g => g.hints),
    time: () => sumG(g => g.time),
    clean: () => sumG(g => g.clean),
    solo: () => sumG(g => g.solo),
    played: () => Object.values(st.games).filter(g => winsOf(g) > 0).length,
  };
  const accuracy = (c, w) => (c + w ? Math.round(c / (c + w) * 100) : null);

  function today(off = 0) { const d = new Date(); d.setDate(d.getDate() + off); return d.toLocaleDateString('sv'); }
  function day() {
    const t = today(), D = st.days;
    if (D.last === t) return;
    D.streak = D.last === today(-1) ? D.streak + 1 : 1;
    D.best = Math.max(D.best, D.streak); D.count++; D.last = t;
  }

  // ----- события от игр -----
  function register(id, meta) { META[id] = meta; }
  function seed(gid, old) {
    // перенос побед и рекордов, которые игры хранили сами до появления профилей
    const g = G(gid);
    for (const [l, n] of Object.entries(old.solved || {})) g.wins[l] = Math.max(g.wins[l] || 0, n);
    for (const [l, t] of Object.entries(old.best || {})) if (t && (!g.best[l] || t < g.best[l])) g.best[l] = t;
    save();
  }
  function start(gid) { G(gid).started++; save(); }
  function move(gid, ok) {
    const g = G(gid);
    if (ok) { g.correct++; st.run++; st.bestRun = Math.max(st.bestRun, st.run); } else { g.wrong++; st.run = 0; }
    day(); check(); save();
  }
  function hint(gid) { G(gid).hints++; check(); save(); }
  function tick(gid) { G(gid).time++; if (++ticks % 15 === 0) { check(); save(); } }
  function win(gid, { lvl, elapsed, hints, mistakes }) {
    const g = G(gid);
    g.wins[lvl] = (g.wins[lvl] || 0) + 1;
    const record = !hints && (!g.best[lvl] || elapsed < g.best[lvl]);
    if (record) g.best[lvl] = elapsed;
    if (!mistakes) g.clean++;
    if (!hints) g.solo++;
    const h = new Date().getHours();
    if (h < 5) st.flags.owl = 1;
    if (h >= 5 && h < 8) st.flags.lark = 1;
    day(); check(); save();
    return { record };
  }

  // ----- достижения -----
  const TIERS = { bronze: 'Бронза', silver: 'Серебро', gold: 'Золото', diamond: 'Бриллиант' };
  const tierNames = n => [['gold'], ['silver', 'gold'], ['bronze', 'silver', 'gold'], ['bronze', 'silver', 'gold', 'diamond']][n - 1];
  const hm = s => (s >= 3600 ? `${Math.floor(s / 3600)} ч ${Math.floor(s % 3600 / 60)} мин` : `${Math.floor(s / 60)} мин`);
  const n = (v, a, b, c) => `${v} ${plural(v, a, b, c)}`;

  function defs() {
    const games = Object.keys(META);
    const list = [
      { id: 'first', icon: 'flag', title: 'Первая победа', tiers: [1], val: total.wins, desc: () => 'Реши первую головоломку' },
      { id: 'wins', icon: 'trophy', title: 'Победитель', tiers: [10, 50, 150, 500], val: total.wins, desc: t => `Реши ${n(t, 'головоломку', 'головоломки', 'головоломок')}` },
      { id: 'hard', icon: 'mountain', title: 'Покоритель вершин', tiers: [10, 50, 150], val: total.hard, desc: t => `Победи ${n(t, 'раз', 'раза', 'раз')} на сложной сложности` },
      { id: 'correct', icon: 'target', title: 'Меткий глаз', tiers: [100, 500, 2000, 10000], val: total.correct, desc: t => `Правильно поставь ${n(t, 'число', 'числа', 'чисел')}` },
      { id: 'run', icon: 'spark', title: 'Безупречная серия', tiers: [25, 60, 120], val: () => st.bestRun, desc: t => `${n(t, 'верный ход', 'верных хода', 'верных ходов')} подряд, без единой ошибки` },
      { id: 'accuracy', icon: 'scope', title: 'Снайпер', tiers: [85, 92, 97], unit: '%', min: 200,
        val: () => (total.correct() + total.wrong() >= 200 ? accuracy(total.correct(), total.wrong()) : 0),
        desc: t => `Точность ${t}% и выше (считается после 200 ходов)` },
      { id: 'clean', icon: 'shield', title: 'Без единой ошибки', tiers: [1, 10, 50], val: total.clean, desc: t => `Реши ${n(t, 'головоломку', 'головоломки', 'головоломок')} без неверных ходов` },
      { id: 'solo', icon: 'bulb', title: 'Своими силами', tiers: [5, 25, 100], val: total.solo, desc: t => `Реши ${n(t, 'головоломку', 'головоломки', 'головоломок')} без подсказок` },
      { id: 'streak', icon: 'flame', title: 'Постоянство', tiers: [3, 7, 30], val: () => st.days.best, desc: t => `Играй ${n(t, 'день', 'дня', 'дней')} подряд` },
      { id: 'time', icon: 'hourglass', title: 'Марафонец', tiers: [3600, 36000, 180000], fmt: hm, val: total.time, desc: t => `Проведи в головоломках ${hm(t)}` },
      { id: 'universal', icon: 'grid', title: 'Универсал', tiers: games.length > 2 ? games.slice(1).map((_, i) => i + 2) : [2], val: total.played, desc: t => `Победи в ${t} разных играх` },
      { id: 'owl', icon: 'moon', title: 'Ночная сова', tiers: [1], val: () => st.flags.owl || 0, desc: () => 'Реши головоломку после полуночи' },
      { id: 'lark', icon: 'sun', title: 'Ранняя пташка', tiers: [1], val: () => st.flags.lark || 0, desc: () => 'Реши головоломку с 5 до 8 утра' },
      { id: 'curious', icon: 'question', title: 'Любопытство', tiers: [10], val: total.hints, desc: t => `Возьми ${n(t, 'подсказку', 'подсказки', 'подсказок')}` },
    ];
    for (const gid of games) {
      const m = META[gid], g = () => G(gid);
      list.push(
        { id: gid + '-fan', game: gid, icon: 'heart', title: 'Знаток', tiers: [5, 25, 100], val: () => winsOf(g()), desc: t => `Реши ${n(t, 'головоломку', 'головоломки', 'головоломок')} в игре «${m.title}»` },
        { id: gid + '-master', game: gid, icon: 'crown', title: 'Гроссмейстер', tiers: [1, 10, 50], val: () => g().wins.hard || 0, desc: t => `Победи на сложной в игре «${m.title}»${t > 1 ? ` ${n(t, 'раз', 'раза', 'раз')}` : ''}` },
        { id: gid + '-speed', game: gid, icon: 'bolt', title: 'Молния', tiers: m.speed, low: true, fmt: fmt,
          val: () => Math.min(g().best.medium || Infinity, g().best.hard || Infinity),
          desc: t => `Реши среднюю или сложную быстрее ${fmt(t)} без подсказок` },
      );
    }
    list.push({ id: 'collector', icon: 'star', title: 'Коллекционер', tiers: [5, 15, 30], val: () => Object.entries(st.ach).reduce((a, [k, v]) => a + (k === 'collector' ? 0 : v.tier), 0), desc: t => `Открой ${n(t, 'уровень', 'уровня', 'уровней')} других достижений` });
    return list;
  }
  const reachedOf = (d, v) => d.tiers.filter(t => (d.low ? v <= t : v >= t)).length;

  function check(silent = false) {
    for (const d of defs()) {
      const r = reachedOf(d, d.val()), prev = (st.ach[d.id] || {}).tier || 0;
      if (r <= prev) continue;
      const at = ((st.ach[d.id] || {}).at || []).slice();
      while (at.length < r) at.push(Date.now());
      st.ach[d.id] = { tier: r, at };
      delete st.seen[d.id];
      if (!silent) toast(d, r);
    }
  }
  function unseen() { return Object.keys(st.ach).filter(id => !st.seen[id]).length; }

  // ----- медаль -----
  const ICONS = {
    flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
    mountain: '<path d="m2.5 20 7-12 4 6.5 2.5-3.5 5.5 9Z"/><path d="m7.6 11.3 1.9 1.5 1.6-1.6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>',
    scope: '<circle cx="12" cy="12" r="7"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
    spark: '<path d="M12 3c.5 4.5 1.5 6 6 6.5-4.5.5-5.5 2-6 6.5-.5-4.5-1.5-6-6-6.5 4.5-.5 5.5-2 6-6.5Z"/><path d="M19 15v4M17 17h4M5 4v3M3.5 5.5h3"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    bulb: '<path d="M9 18h6M10 21.5h4M12 2.5a6.5 6.5 0 0 0-3.7 11.8c.5.4.7 1 .7 1.7h6c0-.7.2-1.3.7-1.7A6.5 6.5 0 0 0 12 2.5Z"/>',
    flame: '<path d="M12 22c4 0 7-2.8 7-6.8 0-3.7-2.6-5.7-4-9.2-1 2-2 3-3.6 3.2.2-2.4-.4-4.6-2.4-6.7-.8 4.4-5 6.8-5 12.4C4 19.2 7.6 22 12 22Z"/><path d="M12 22c-1.7 0-3-1.2-3-3 0-2 1.6-2.8 2.5-4.6.9 1.5 3.5 2.5 3.5 4.6 0 1.8-1.3 3-3 3Z"/>',
    hourglass: '<path d="M6 2.5h12M6 21.5h12M7.5 2.5c0 5 9 5.5 9 9.5s-9 4.5-9 9.5M16.5 2.5c0 5-9 5.5-9 9.5s9 4.5 9 9.5"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 6.8 6.8 0 0 0 20 14.5Z"/><path d="M17 3.5v3M15.5 5h3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4.9c0 1.9-2.7 2.3-2.7 4.1M12 17.3v.2"/>',
    heart: '<path d="M12 20.5s-8-4.8-8-10.8a4.4 4.4 0 0 1 8-2.6 4.4 4.4 0 0 1 8 2.6c0 6-8 10.8-8 10.8Z"/>',
    crown: '<path d="m3 7.5 4.5 4.5L12 5l4.5 7L21 7.5 19 19H5Z"/><path d="M5 19h14"/>',
    bolt: '<path d="M13.5 2 4.5 13.5h6.5L10 22l9.5-12H13Z"/>',
    star: '<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9Z"/>',
  };
  // зубчатый край медали
  const ROSETTE = (() => {
    const pts = [];
    for (let k = 0; k < 32; k++) { const r = k % 2 ? 28 : 30.5, a = k / 32 * Math.PI * 2; pts.push(`${(32 + r * Math.sin(a)).toFixed(2)} ${(32 - r * Math.cos(a)).toFixed(2)}`); }
    return 'M' + pts.join('L') + 'Z';
  })();
  function medal(d, tier) {
    const t = tier ? tierNames(d.tiers.length)[tier - 1] : 'locked';
    return `<svg class="medal m-${t}" viewBox="0 0 64 64" aria-hidden="true">
      <path class="m-rim" d="${ROSETTE}"/>
      <circle class="m-face" cx="32" cy="32" r="23"/>
      <circle class="m-ring" cx="32" cy="32" r="19.5"/>
      <path class="m-gloss" d="M13 27a20 20 0 0 1 32-12c-9-2-22 1-32 12Z"/>
      <g class="m-icon" transform="translate(20 20)">${ICONS[d.icon] || ICONS.star}</g>
    </svg>`;
  }
  function defsSvg() {
    if ($('medalDefs')) return;
    const grad = (id, stops) => `<linearGradient id="${id}" x1="0" y1="0" x2="0.4" y2="1">${stops.map((c, k) => `<stop offset="${k / (stops.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
    const div = document.createElement('div');
    div.innerHTML = `<svg id="medalDefs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
      ${grad('gBronzeR', ['#e3a066', '#8e4a1c'])}${grad('gBronzeF', ['#f6c08c', '#c06f33', '#a55a24'])}
      ${grad('gSilverR', ['#e9edf5', '#6f7890'])}${grad('gSilverF', ['#ffffff', '#c3cad8', '#9aa3b8'])}
      ${grad('gGoldR', ['#ffe07a', '#a86f00'])}${grad('gGoldF', ['#fff3b0', '#f5c542', '#d99a10'])}
      ${grad('gDiamondR', ['#9ff0ff', '#5a4bd1'])}${grad('gDiamondF', ['#e6fbff', '#7fd8ff', '#8a7dff', '#c47dff'])}
    </defs></svg>`;
    document.body.appendChild(div.firstElementChild);
  }

  // ----- всплывающее уведомление -----
  const queue = [];
  let showing = false;
  function toast(d, tier) {
    queue.push([d, tier]);
    if (!showing) setTimeout(nextToast, 350);
  }
  function nextToast() {
    const it = queue.shift();
    if (!it) { showing = false; return; }
    showing = true;
    const [d, tier] = it, names = tierNames(d.tiers.length), t = names[tier - 1];
    const el = document.createElement('button');
    el.className = `ach-toast t-${t}`;
    el.innerHTML = `<span class="ach-toast-medal">${medal(d, tier)}<i></i><i></i><i></i><i></i><i></i><i></i></span>
      <span class="ach-toast-txt"><small>Достижение${names.length > 1 ? ' · ' + TIERS[t] : ''}</small><b>${d.title}</b><em>${d.desc(d.tiers[tier - 1])}</em></span>`;
    el.onclick = () => { finish(); showcase(d.id); };
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    let done = false;
    const timer = setTimeout(finish, queue.length > 1 ? 2600 : 4200);
    function finish() {
      if (done) return; done = true; clearTimeout(timer);
      el.classList.remove('in'); el.classList.add('out');
      setTimeout(() => { el.remove(); nextToast(); }, 450);
    }
    refreshDot();
  }
  function refreshDot() { const b = $('profileBtn'); if (b) b.classList.toggle('dot', unseen() > 0); }

  // ----- витрина -----
  function progressOf(d) {
    const v = d.val(), r = reachedOf(d, v), next = d.tiers[r];
    const show = x => (d.fmt ? d.fmt(x) : x + (d.unit || ''));
    if (next === undefined) return { r, pct: 100, text: 'Все уровни открыты' };
    if (d.low) {
      const has = v !== Infinity;
      return { r, pct: has ? Math.min(99, Math.round(next / v * 100)) : 0, text: has ? `Лучшее ${show(v)} · нужно ${show(next)}` : `Нужно быстрее ${show(next)}` };
    }
    if (d.min && total.correct() + total.wrong() < d.min) {
      const m = total.correct() + total.wrong();
      return { r, pct: Math.round(m / d.min * 100), text: `Ещё ${n(d.min - m, 'ход', 'хода', 'ходов')} до подсчёта` };
    }
    const base = r ? d.tiers[r - 1] : 0;
    const pct = d.unit === '%' ? Math.round(v / next * 100) : Math.max(0, Math.min(99, Math.round((v - base) / (next - base) * 100)));
    return { r, pct, text: `${show(Math.min(v, next))} из ${show(next)}` };
  }

  function panel(html, cls = '') {
    const root = $('sheetRoot');
    root.innerHTML = `<div class="sheet-back"><div class="sheet panel ${cls}" role="dialog" aria-modal="true">
      <button class="panel-close" id="panelClose" aria-label="Закрыть">×</button>${html}</div></div>`;
    const close = () => { root.innerHTML = ''; };
    $('panelClose').onclick = close;
    root.querySelector('.sheet-back').addEventListener('pointerdown', e => { if (e.target.classList.contains('sheet-back')) close(); });
    return root.querySelector('.panel');
  }

  function showcase(focus) {
    defsSvg();
    const all = defs();
    const levels = all.reduce((a, d) => a + d.tiers.length, 0);
    const got = all.reduce((a, d) => a + ((st.ach[d.id] || {}).tier || 0), 0);
    const groups = [['Общие', all.filter(d => !d.game)], ...Object.keys(META).map(g => [META[g].title, all.filter(d => d.game === g)])];
    const card = d => {
      const p = progressOf(d), names = tierNames(d.tiers.length), isNew = st.ach[d.id] && !st.seen[d.id];
      return `<button class="badge ${p.r ? 't-' + names[p.r - 1] : 'locked'} ${isNew ? 'new' : ''}" data-id="${d.id}">
        <span class="badge-medal">${medal(d, p.r)}</span>
        <b>${d.title}</b>
        <span class="pips">${names.map((t, k) => `<i class="${k < p.r ? 'on p-' + t : ''}"></i>`).join('')}</span>
        <span class="prog"><i style="width:${p.r === d.tiers.length ? 100 : p.pct}%"></i></span>
      </button>`;
    };
    const el = panel(`
      <div class="sc-head">
        <div class="sc-ring" style="--p:${Math.round(got / levels * 100)}"><b>${got}</b><small>из ${levels}</small></div>
        <div><h2>Витрина достижений</h2><p class="muted">${Profiles.esc(Profiles.active().name)}, открыто ${n(got, 'уровень', 'уровня', 'уровней')} в ${n(Object.keys(st.ach).length, 'достижении', 'достижениях', 'достижениях')} из ${all.length}.</p></div>
      </div>
      ${groups.map(([t, ds]) => `<h3 class="sc-group">${t}</h3><div class="badges">${ds.map(card).join('')}</div>`).join('')}
      <button class="sc-back" id="scBack">← К профилю</button>`, 'showcase');
    el.querySelectorAll('.badge').forEach(b => b.onclick = () => detail(all.find(d => d.id === b.dataset.id)));
    $('scBack').onclick = profile;
    // всё, что увидели в витрине, больше не «новое»
    for (const id of Object.keys(st.ach)) st.seen[id] = 1;
    save(); refreshDot();
    if (focus) { const b = el.querySelector(`[data-id="${focus}"]`); if (b) { b.scrollIntoView({ block: 'center' }); b.classList.add('focus'); } }
  }

  function detail(d) {
    const p = progressOf(d), names = tierNames(d.tiers.length), at = (st.ach[d.id] || {}).at || [];
    const show = x => (d.fmt ? d.fmt(x) : x + (d.unit || ''));
    const el = panel(`
      <div class="ach-detail ${p.r ? 't-' + names[p.r - 1] : 'locked'}">
        <span class="ach-big">${medal(d, p.r)}</span>
        ${d.game ? `<span class="chip">${META[d.game].title}</span>` : ''}
        <h2>${d.title}</h2>
        <p class="muted">${p.text}</p>
        <ol class="tiers">${d.tiers.map((t, k) => `<li class="${k < p.r ? 'done' : ''}">
          <span class="tier-dot p-${names[k]}"></span>
          <span><b>${names.length > 1 ? TIERS[names[k]] : 'Открыть'}</b><small>${d.desc(t)}</small></span>
          <em>${k < p.r ? (at[k] ? new Date(at[k]).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) : '✓') : (k === p.r ? p.pct + '%' : show(t))}</em></li>`).join('')}</ol>
      </div>
      <button class="sc-back" id="dtBack">← Ко всем достижениям</button>`, 'detail');
    $('dtBack').onclick = () => showcase(d.id);
  }

  // ----- профиль и статистика -----
  function profile() {
    defsSvg();
    const me = Profiles.active(), all = defs();
    const c = total.correct(), w = total.wrong(), acc = accuracy(c, w);
    const recent = all.filter(d => st.ach[d.id]).sort((a, b) => Math.max(...st.ach[b.id].at) - Math.max(...st.ach[a.id].at)).slice(0, 3);
    const got = all.reduce((a, d) => a + ((st.ach[d.id] || {}).tier || 0), 0), levels = all.reduce((a, d) => a + d.tiers.length, 0);
    const gameRows = Object.keys(META).map(gid => {
      const g = G(gid), a = accuracy(g.correct, g.wrong);
      return `<div class="pf-game"><div class="pf-game-h"><b>${META[gid].title}</b><span>${n(winsOf(g), 'победа', 'победы', 'побед')} · точность ${a === null ? '—' : a + '%'}</span></div>
        <div class="pf-lv">${Object.entries(LEVELS).map(([l, name]) => `<div><small>${name}</small><b>${g.wins[l] || 0}</b><span>${g.best[l] ? '⏱ ' + fmt(g.best[l]) : '—'}</span></div>`).join('')}</div></div>`;
    }).join('');
    const el = panel(`
      <div class="pf-top">${Profiles.avatar(me, 'big')}<div><h2>${Profiles.esc(me.name)}</h2><button class="link" id="pfEdit">Изменить профиль</button></div></div>
      <div class="pf-stats">
        <div><b>${total.wins()}</b><small>${plural(total.wins(), 'победа', 'победы', 'побед')}</small></div>
        <div><b>${acc === null ? '—' : acc + '%'}</b><small>точность</small></div>
        <div><b>${c}</b><small>верных ходов</small></div>
        <div><b>${total.hints()}</b><small>${plural(total.hints(), 'подсказка', 'подсказки', 'подсказок')}</small></div>
        <div><b>${hm(total.time())}</b><small>в игре</small></div>
        <div><b>${st.days.streak}${st.days.best > st.days.streak ? `<i>/${st.days.best}</i>` : ''}</b><small>${plural(st.days.streak, 'день', 'дня', 'дней')} подряд</small></div>
      </div>
      <button class="pf-showcase" id="pfShow">
        <span class="pf-show-medals">${recent.length ? recent.map(d => medal(d, st.ach[d.id].tier)).join('') : medal({ icon: 'trophy', tiers: [1] }, 0)}</span>
        <span class="pf-show-txt"><b>Витрина достижений</b><small>${got} из ${levels} уровней${unseen() ? ` · <em>новых: ${unseen()}</em>` : ''}</small></span>
        <span class="chev">›</span>
      </button>
      <h3 class="sc-group">По играм</h3>
      ${gameRows}
      <h3 class="sc-group">Игроки на этом устройстве</h3>
      <div class="pf-list">
        ${Profiles.list().map(p => `<button class="pf-row" data-id="${p.id}" aria-pressed="${p.id === me.id}">${Profiles.avatar(p)}<span>${Profiles.esc(p.name)}</span>${p.id === me.id ? '<em>играет сейчас</em>' : '<em>переключиться</em>'}</button>`).join('')}
        <button class="pf-row add" id="pfAdd"><span class="avatar add">+</span><span>Новый игрок</span></button>
      </div>
      <p class="muted small">Профили и прогресс хранятся только на этом устройстве.</p>`, 'profile');
    $('pfShow').onclick = () => showcase();
    $('pfEdit').onclick = async () => { await Profiles.edit(); renderAvatar(); profile(); };
    $('pfAdd').onclick = async () => { if (!(await Profiles.add())) profile(); };
    el.querySelectorAll('.pf-row[data-id]').forEach(b => b.onclick = () => Profiles.switchTo(b.dataset.id));
  }
  function renderAvatar() {
    const b = $('profileBtn'), me = Profiles.active();
    b.innerHTML = Profiles.avatar(me);
    b.setAttribute('aria-label', `Профиль: ${me.name}`);
    refreshDot();
  }
  function initUI() {
    defsSvg();
    // достижения за то, что было сыграно до их появления, открываются тихо и ждут в витрине
    check(!st.init);
    st.init = true; save();
    renderAvatar();
    $('profileBtn').onclick = profile;
  }

  load();
  addEventListener('pagehide', save);
  addEventListener('lg-save', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  return { register, seed, start, move, hint, tick, win, wins: gid => winsOf(G(gid)), initUI, refresh: renderAvatar, profile, showcase };
})();
