// ===== Движок киллер-судоку 9×9: генератор, логические шаги =====
// Поле 9×9, блоки 3×3. Клетки объединены в «клетки-суммы»: цифры в них не повторяются
// и в сумме дают число в углу. Задача считается годной, только если её можно решить
// логикой без перебора: тогда решение заведомо единственное.
const Killer = (() => {
  const N = 9, C = 81, ALL = 511;
  const rowOf = i => (i / N) | 0, colOf = i => i % N;
  const boxOf = i => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);
  const UNITS = [];
  for (let r = 0; r < N; r++) UNITS.push({ kind: 'row', idx: r, cells: [...Array(N).keys()].map(c => r * N + c) });
  for (let c = 0; c < N; c++) UNITS.push({ kind: 'col', idx: c, cells: [...Array(N).keys()].map(r => r * N + c) });
  for (let b = 0; b < N; b++) UNITS.push({ kind: 'box', idx: b, cells: [...Array(C).keys()].filter(i => boxOf(i) === b) });
  const ROWS = UNITS.slice(0, N), COLS = UNITS.slice(N, 2 * N), BOXES = UNITS.slice(2 * N);
  // области для правила 45: дома и полосы из 2–3 соседних строк или столбцов
  const REGIONS = UNITS.map(U => Object.assign({ total: 45 }, U));
  for (let k = 2; k <= 3; k++) for (let a = 0; a + k <= N; a++) {
    REGIONS.push({ kind: 'rows', idx: a, n: k, total: 45 * k, cells: ROWS.slice(a, a + k).flatMap(U => U.cells) });
    REGIONS.push({ kind: 'cols', idx: a, n: k, total: 45 * k, cells: COLS.slice(a, a + k).flatMap(U => U.cells) });
  }
  const PEERS = [];
  for (let i = 0; i < C; i++) {
    const s = new Set([...ROWS[rowOf(i)].cells, ...COLS[colOf(i)].cells, ...BOXES[boxOf(i)].cells]);
    s.delete(i); PEERS.push([...s]);
  }
  const NB = i => {
    const r = rowOf(i), c = colOf(i), out = [];
    if (r > 0) out.push(i - N); if (r < N - 1) out.push(i + N);
    if (c > 0) out.push(i - 1); if (c < N - 1) out.push(i + 1);
    return out;
  };
  const bitCount = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const lowBit = m => 31 - Math.clz32(m & -m);
  const digitsOf = m => { const a = []; for (let d = 1; d <= N; d++) if (m & (1 << (d - 1))) a.push(d); return a; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // Геометрия задачи: к какой клетке-сумме относится каждая клетка, соседи с учётом клеток-сумм
  function buildGeo(cages) {
    const cageOf = new Array(C);
    cages.forEach((k, ci) => k.cells.forEach(i => { cageOf[i] = ci; }));
    const peers = PEERS.map((p, i) => [...new Set([...p, ...cages[cageOf[i]].cells.filter(j => j !== i)])]);
    // клетка, в углу которой пишется сумма: самая верхняя, затем самая левая
    const anchor = cages.map(k => Math.min(...k.cells));
    return { cages, cageOf, peers, anchor };
  }

  // --- полное решённое поле ---
  function fullGrid() {
    const g = new Array(C).fill(0);
    function rec(i) {
      if (i === C) return true;
      let m = ALL;
      for (const p of PEERS[i]) if (g[p]) m &= ~(1 << (g[p] - 1));
      for (const d of shuffle(digitsOf(m))) { g[i] = d; if (rec(i + 1)) return true; }
      g[i] = 0; return false;
    }
    rec(0);
    return g;
  }

  // --- нарезка на клетки-суммы ---
  function partition(sol, sizes) {
    const cageOf = new Array(C).fill(-1), cages = [];
    const free = i => NB(i).filter(j => cageOf[j] < 0).length;
    for (;;) {
      const open = [];
      for (let i = 0; i < C; i++) if (cageOf[i] < 0) open.push(i);
      if (!open.length) break;
      // начинаем с самой «зажатой» клетки, чтобы не оставались одиночки
      let best = Infinity, pick = [];
      for (const i of open) { const f = free(i); if (f < best) { best = f; pick = [i]; } else if (f === best) pick.push(i); }
      const start = pick[Math.random() * pick.length | 0];
      const target = sizes[Math.random() * sizes.length | 0];
      const cells = [start]; let used = 1 << (sol[start] - 1);
      cageOf[start] = cages.length;
      while (cells.length < target) {
        const front = [];
        for (const i of cells) for (const j of NB(i)) if (cageOf[j] < 0 && !(used & (1 << (sol[j] - 1))) && !front.includes(j)) front.push(j);
        if (!front.length) break;
        front.sort((a, b) => free(a) - free(b) || Math.random() - .5);
        const j = Math.random() < .7 ? front[0] : front[Math.random() * front.length | 0];
        cells.push(j); used |= 1 << (sol[j] - 1); cageOf[j] = cages.length;
      }
      cages.push({ cells });
    }
    // одиночку присоединяем к соседней клетке-сумме, если там нет такой же цифры
    for (let ci = 0; ci < cages.length; ci++) {
      const k = cages[ci]; if (k.cells.length !== 1) continue;
      const i = k.cells[0], d = sol[i];
      const opts = shuffle(NB(i).map(j => cageOf[j]).filter(cj => cj !== ci && cages[cj].cells.length && cages[cj].cells.length < 6 && !cages[cj].cells.some(j => sol[j] === d)));
      if (!opts.length) continue;
      const to = opts.sort((a, b) => cages[a].cells.length - cages[b].cells.length)[0];
      cages[to].cells.push(i); cageOf[i] = to; k.cells = [];
    }
    return cages.filter(k => k.cells.length).map(k => {
      const cells = k.cells.sort((a, b) => a - b);
      return { cells, sum: cells.reduce((a, i) => a + sol[i], 0) };
    });
  }

  // --- что может стоять в клетке-сумме ---
  // Перебирает все расстановки в пустых клетках; возвращает возможные цифры для каждой клетки
  // и подходящие наборы цифр для всей клетки-суммы.
  function cageOptions(k, grid, cd) {
    let used = 0, rem = k.sum;
    const empty = [];
    for (const i of k.cells) { if (grid[i]) { used |= 1 << (grid[i] - 1); rem -= grid[i]; } else empty.push(i); }
    const per = new Array(empty.length).fill(0), sets = new Set();
    empty.sort((a, b) => bitCount(cd[a]) - bitCount(cd[b]));
    const pick = new Array(empty.length);
    function rec(n, mask, left) {
      const k2 = empty.length - n;
      if (!k2) { if (!left) { for (let t = 0; t < n; t++) per[t] |= 1 << (pick[t] - 1); sets.add(mask); } return; }
      // границы: k2 самых маленьких и самых больших свободных цифр
      let lo = 0, hi = 0, a = 0, b = 0;
      for (let d = 1; d <= N && a < k2; d++) if (!(mask & (1 << (d - 1)))) { lo += d; a++; }
      for (let d = N; d >= 1 && b < k2; d--) if (!(mask & (1 << (d - 1)))) { hi += d; b++; }
      if (left < lo || left > hi) return;
      for (let m = cd[empty[n]] & ~mask; m; m &= m - 1) {
        const d = lowBit(m) + 1; if (d > left) break;
        pick[n] = d; rec(n + 1, mask | (1 << (d - 1)), left - d);
      }
    }
    rec(0, used, rem);
    const cellMask = new Map();
    empty.forEach((i, t) => cellMask.set(i, per[t]));
    return { empty, cellMask, sets: [...sets] };
  }

  function candidatesFor(grid, geo) {
    const cd = new Array(C);
    for (let i = 0; i < C; i++) {
      if (grid[i]) { cd[i] = 1 << (grid[i] - 1); continue; }
      let m = ALL;
      for (const p of geo.peers[i]) if (grid[p]) m &= ~(1 << (grid[p] - 1));
      cd[i] = m;
    }
    return cd;
  }

  // Правило 45: для строки, столбца или блока считаем клетки-суммы внутри и задевающие его
  function rule45(U, grid, geo) {
    const inU = new Set(U.cells), seen = new Set();
    let inSum = 0, touchSum = 0;
    const inner = [], touching = [];
    for (const i of U.cells) {
      const ci = geo.cageOf[i]; if (seen.has(ci)) continue; seen.add(ci);
      const k = geo.cages[ci];
      touching.push(ci); touchSum += k.sum;
      if (k.cells.every(j => inU.has(j))) { inner.push(ci); inSum += k.sum; }
    }
    const innerCells = new Set(inner.flatMap(ci => geo.cages[ci].cells));
    const rest = U.cells.filter(i => !innerCells.has(i));
    const out = touching.flatMap(ci => geo.cages[ci].cells).filter(i => !inU.has(i));
    const sumOf = cs => cs.reduce((a, i) => a + grid[i], 0);
    return {
      inner, touching, rest, out,
      restEmpty: rest.filter(i => !grid[i]), restLeft: U.total - inSum - sumOf(rest),
      outEmpty: out.filter(i => !grid[i]), outLeft: touchSum - U.total - sumOf(out),
      inSum, touchSum,
    };
  }

  // Следующий логический шаг. level 1: одиночки и наборы в клетках-суммах;
  // level 2: + блок/линия, обязательная цифра клетки-суммы, голые пары; level 3: + правило 45.
  function nextStep(grid, cd, geo, level) {
    for (let i = 0; i < C; i++) if (!grid[i] && cd[i] && !(cd[i] & (cd[i] - 1)))
      return { type: 'naked', cell: i, value: lowBit(cd[i]) + 1 };
    for (const U of [...BOXES, ...ROWS, ...COLS]) for (let d = 1; d <= N; d++) {
      const bit = 1 << (d - 1); let n = 0, w = -1, placed = false;
      for (const i of U.cells) { if (grid[i] === d) { placed = true; break; } if (!grid[i] && (cd[i] & bit)) { n++; w = i; } }
      if (!placed && n === 1) return { type: 'hidden', cell: w, value: d, unit: U };
    }
    for (const k of geo.cages) {
      const empty = k.cells.filter(i => !grid[i]);
      if (empty.length === 1) {
        const v = k.sum - k.cells.reduce((a, i) => a + grid[i], 0);
        if (v >= 1 && v <= N && (cd[empty[0]] & (1 << (v - 1)))) return { type: 'cageLast', cell: empty[0], value: v, cage: k };
      }
    }
    // наборы цифр в клетках-суммах
    const opts = [];
    for (const k of geo.cages) {
      const o = cageOptions(k, grid, cd); opts.push(o);
      if (!o.empty.length || !o.sets.length) continue;
      // цифра есть во всех подходящих наборах и встать может только в одну клетку
      const must = o.sets.reduce((a, x) => a & x, ALL);
      for (let m = must; m; m &= m - 1) {
        const d = lowBit(m) + 1, bit = 1 << (d - 1);
        if (k.cells.some(i => grid[i] === d)) continue;
        const sp = o.empty.filter(i => o.cellMask.get(i) & bit);
        if (sp.length === 1 && (cd[sp[0]] & bit)) return { type: 'cageHidden', cell: sp[0], value: d, cage: k, sets: o.sets };
      }
      const elim = [];
      for (const i of o.empty) { const x = cd[i] & ~o.cellMask.get(i); if (x) elim.push({ cell: i, mask: x }); }
      if (elim.length) return { type: 'cage', cage: k, sets: o.sets, elim };
    }
    if (level < 2) return null;
    const spotsOf = (U, bit) => U.cells.filter(i => !grid[i] && (cd[i] & bit));
    const lockTry = (A, B, d, spots) => {
      const bit = 1 << (d - 1), inA = new Set(A.cells);
      if (!spots.every(i => B.cells.includes(i))) return null;
      const elim = B.cells.filter(i => !inA.has(i) && !grid[i] && (cd[i] & bit));
      return elim.length ? { type: 'locked', value: d, from: A, line: B, cells: spots, elim: elim.map(cell => ({ cell, mask: bit })) } : null;
    };
    for (let d = 1; d <= N; d++) {
      const bit = 1 << (d - 1);
      for (const B of BOXES) {
        const sp = spotsOf(B, bit); if (sp.length < 2) continue;
        const st = lockTry(B, ROWS[rowOf(sp[0])], d, sp) || lockTry(B, COLS[colOf(sp[0])], d, sp);
        if (st) return st;
      }
      for (const L of [...ROWS, ...COLS]) {
        const sp = spotsOf(L, bit); if (sp.length < 2) continue;
        const st = lockTry(L, BOXES[boxOf(sp[0])], d, sp);
        if (st) return st;
      }
    }
    // цифра, которая обязана быть в клетке-сумме, и все её места на одной линии или в одном блоке
    for (let ci = 0; ci < geo.cages.length; ci++) {
      const k = geo.cages[ci], o = opts[ci];
      if (!o.empty.length || !o.sets.length) continue;
      const must = o.sets.reduce((a, s) => a & s, ALL);
      for (let m = must; m; m &= m - 1) {
        const d = lowBit(m) + 1, bit = 1 << (d - 1);
        if (k.cells.some(i => grid[i] === d)) continue;
        const sp = o.empty.filter(i => cd[i] & bit);
        if (!sp.length) continue;
        for (const U of [ROWS[rowOf(sp[0])], COLS[colOf(sp[0])], BOXES[boxOf(sp[0])]]) {
          if (!sp.every(i => U.cells.includes(i))) continue;
          const elim = U.cells.filter(i => !k.cells.includes(i) && !grid[i] && (cd[i] & bit));
          if (elim.length) return { type: 'cageLock', value: d, cage: k, unit: U, cells: sp, elim: elim.map(cell => ({ cell, mask: bit })) };
        }
      }
    }
    for (const U of UNITS) {
      const two = U.cells.filter(i => !grid[i] && bitCount(cd[i]) === 2);
      for (let a = 0; a < two.length; a++) for (let b = a + 1; b < two.length; b++) {
        const m = cd[two[a]]; if (cd[two[b]] !== m) continue;
        const elim = U.cells.filter(i => i !== two[a] && i !== two[b] && !grid[i] && (cd[i] & m)).map(cell => ({ cell, mask: cd[cell] & m }));
        if (elim.length) return { type: 'pair', mask: m, unit: U, cells: [two[a], two[b]], elim };
      }
    }
    if (level < 3) return null;
    if (level >= 3) for (const U of REGIONS) {
      const R = rule45(U, grid, geo);
      if (R.restEmpty.length === 1 && R.restLeft >= 1 && R.restLeft <= N && (cd[R.restEmpty[0]] & (1 << (R.restLeft - 1))) && R.inner.length)
        return { type: 'innie', cell: R.restEmpty[0], value: R.restLeft, unit: U, r: R };
      if (R.outEmpty.length === 1 && R.outLeft >= 1 && R.outLeft <= N && (cd[R.outEmpty[0]] & (1 << (R.outLeft - 1))))
        return { type: 'outie', cell: R.outEmpty[0], value: R.outLeft, unit: U, r: R };
    }
    // правило 45, когда остаются две клетки: их сумма известна, и они в одном доме, значит разные
    for (const U of REGIONS) {
      const R = rule45(U, grid, geo);
      if (R.restEmpty.length !== 2 || !R.inner.length) continue;
      const [a, b] = R.restEmpty, T = R.restLeft, elim = [], same = PEERS[a].includes(b);
      const keep = (x, y) => { let m = 0; for (const d of digitsOf(cd[x])) { const e = T - d; if ((!same || e !== d) && e >= 1 && e <= N && (cd[y] & (1 << (e - 1)))) m |= 1 << (d - 1); } return m; };
      const ka = keep(a, b), kb = keep(b, a);
      if (cd[a] & ~ka) elim.push({ cell: a, mask: cd[a] & ~ka });
      if (cd[b] & ~kb) elim.push({ cell: b, mask: cd[b] & ~kb });
      if (elim.length) return { type: 'innie2', unit: U, cells: [a, b], total: T, same, r: R, elim };
    }
    return null;
  }
  function place(grid, cd, geo, i, d) {
    grid[i] = d; cd[i] = 1 << (d - 1);
    for (const p of geo.peers[i]) if (!grid[p]) cd[p] &= ~(1 << (d - 1));
  }
  function logicSolve(givens, geo, level) {
    const grid = givens.slice(), cd = candidatesFor(grid, geo);
    let steps = 0, used = 0;
    const max = { naked: 1, hidden: 1, cageLast: 1, cageHidden: 1, cage: 1, locked: 2, cageLock: 2, pair: 2, innie: 3, outie: 3, innie2: 3 };
    for (;;) {
      const st = nextStep(grid, cd, geo, level);
      if (!st) break;
      steps++; used = Math.max(used, max[st.type]);
      if (st.elim) { for (const e of st.elim) cd[e.cell] &= ~e.mask; if (st.elim.some(e => !cd[e.cell])) break; continue; }
      place(grid, cd, geo, st.cell, st.value);
    }
    return { solved: grid.every(x => x), steps, used, grid };
  }

  // Делит клетку-сумму на две связные части: так у игрока появляется больше подсказок-сумм
  function split(cages, ci, sol) {
    const k = cages[ci], cells = k.cells;
    if (cells.length < 2) return false;
    const inK = new Set(cells);
    const connected = part => {
      const set = new Set(part), seen = new Set([part[0]]), q = [part[0]];
      while (q.length) for (const j of NB(q.pop())) if (set.has(j) && !seen.has(j)) { seen.add(j); q.push(j); }
      return seen.size === part.length;
    };
    for (let t = 0; t < 30; t++) {
      // большую делим без одиночек: одиночка — это почти готовая цифра
      const min = cells.length >= 4 ? 2 : 1;
      const start = cells[Math.random() * cells.length | 0], want = min + (Math.random() * (cells.length - 2 * min + 1) | 0);
      const a = [start];
      while (a.length < want) {
        const front = a.flatMap(NB).filter(j => inK.has(j) && !a.includes(j));
        if (!front.length) break;
        a.push(front[Math.random() * front.length | 0]);
      }
      const b = cells.filter(i => !a.includes(i));
      if (a.length < min || b.length < min || !connected(b)) continue;
      const mk = cs => ({ cells: cs.sort((x, y) => x - y), sum: cs.reduce((s, i) => s + sol[i], 0) });
      cages.splice(ci, 1, mk(a), mk(b));
      return true;
    }
    return false;
  }

  // --- генерация ---
  const LEVELS = {
    easy:   { sizes: [2, 2, 2, 3, 3, 3], logic: 1, givens: 14 },
    medium: { sizes: [2, 2, 3, 3, 3, 4, 4], logic: 2, givens: 0, need: 2 },
    hard:   { sizes: [2, 3, 3, 4, 4, 5, 5], logic: 3, givens: 0, need: 3 },
  };
  function generate(difficulty = 'medium') {
    const cfg = LEVELS[difficulty] || LEVELS.medium;
    for (let tries = 0; ; tries++) {
      const sol = fullGrid(), cages = partition(sol, cfg.sizes);
      // одиночные клетки-суммы — по сути готовые цифры; на средней и сложной их не держим
      const singles = cages.filter(k => k.cells.length === 1).length;
      if (singles > (cfg.givens ? 3 : 1) && tries < 200) continue;
      const givens = new Array(C).fill(0);
      let geo = buildGeo(cages), r = logicSolve(givens, geo, cfg.logic), opened = 0;
      // если логика застряла, помогаем там, где застряла: на лёгкой открываем цифру,
      // на остальных делим одну из нерешённых клеток-сумм на две
      for (let guard = 0; !r.solved && guard < 40; guard++) {
        const stuck = [];
        for (let i = 0; i < C; i++) if (!r.grid[i]) stuck.push(i);
        const i = stuck[Math.random() * stuck.length | 0];
        if (opened < cfg.givens) { givens[i] = sol[i]; opened++; }
        else {
          const ids = [...new Set(stuck.map(j => geo.cageOf[j]))].filter(ci => cages[ci].cells.length > 1);
          const big = ids.filter(ci => cages[ci].cells.length >= 4), from = big.length ? big : ids;
          if (!from.length || !split(cages, from[Math.random() * from.length | 0], sol)) continue;
        }
        geo = buildGeo(cages);
        r = logicSolve(givens, geo, cfg.logic);
      }
      if (!r.solved) continue;
      // средняя и сложная должны требовать свои приёмы, а не только самые простые
      if (cfg.need && r.used < cfg.need && tries < 200) continue;
      return { cages, givens, solution: sol, difficulty };
    }
  }

  return { N, C, REGIONS, rowOf, colOf, boxOf, UNITS, ROWS, COLS, BOXES, PEERS, buildGeo, cageOptions, candidatesFor, nextStep, logicSolve, rule45, generate, digitsOf };
})();
if (typeof module !== 'undefined') module.exports = Killer;
