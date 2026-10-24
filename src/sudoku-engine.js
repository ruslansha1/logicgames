// ===== Движок судоку 12×12: генератор, решатель, логические шаги =====
// Блоки 3 строки × 4 столбца, символы 1–9, A, B, C (значения 1..12)
const Sudoku12 = (() => {
  const N = 12, C = N * N, BR = 3, BC = 4, ALL = (1 << N) - 1;
  const SYM = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C'];
  const rowOf = i => (i / N) | 0, colOf = i => i % N;
  const boxOf = i => ((rowOf(i) / BR) | 0) * (N / BC) + ((colOf(i) / BC) | 0);
  const UNITS = [];
  for (let r = 0; r < N; r++) UNITS.push({ kind: 'row', idx: r, cells: [...Array(N).keys()].map(c => r * N + c) });
  for (let c = 0; c < N; c++) UNITS.push({ kind: 'col', idx: c, cells: [...Array(N).keys()].map(r => r * N + c) });
  for (let b = 0; b < N; b++) UNITS.push({ kind: 'box', idx: b, cells: [...Array(C).keys()].filter(i => boxOf(i) === b) });
  const ROWS = UNITS.slice(0, N), COLS = UNITS.slice(N, 2 * N), BOXES = UNITS.slice(2 * N);
  const PEERS = [];
  for (let i = 0; i < C; i++) {
    const s = new Set([...ROWS[rowOf(i)].cells, ...COLS[colOf(i)].cells, ...BOXES[boxOf(i)].cells]);
    s.delete(i); PEERS.push([...s]);
  }
  const bitCount = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const lowBit = m => 31 - Math.clz32(m & -m);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // --- Перебор с распространением одиночек, считает решения до limit ---
  function solve(grid, { limit = 2, random = false, maxNodes = 100000 } = {}) {
    let nodes = 0, count = 0, first = null, aborted = false;
    const val = new Array(C).fill(0), cand = new Array(C).fill(ALL);
    function assign(v, cd, i, d) {
      v[i] = d; cd[i] = 1 << (d - 1);
      const b = ~(1 << (d - 1));
      for (const p of PEERS[i]) {
        if (v[p]) { if (v[p] === d) return false; continue; }
        cd[p] &= b; if (!cd[p]) return false;
      }
      return true;
    }
    function propagate(v, cd) {
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = 0; i < C; i++) if (!v[i]) {
          const m = cd[i];
          if (!m) return false;
          if (!(m & (m - 1))) { if (!assign(v, cd, i, lowBit(m) + 1)) return false; changed = true; }
        }
        for (const U of UNITS) {
          let once = 0, twice = 0, done = 0;
          for (const i of U.cells) {
            if (v[i]) { done |= 1 << (v[i] - 1); continue; }
            twice |= once & cd[i]; once |= cd[i];
          }
          if ((once | done) !== ALL) return false;
          let single = once & ~twice & ~done;
          while (single) {
            const d = lowBit(single) + 1; single &= single - 1;
            const w = U.cells.find(i => !v[i] && (cd[i] & (1 << (d - 1))));
            if (w === undefined || !assign(v, cd, w, d)) return false;
            changed = true;
          }
        }
      }
      return true;
    }
    function rec(v, cd) {
      if (++nodes > maxNodes) { aborted = true; return; }
      if (!propagate(v, cd)) return;
      let best = -1, bc = 99;
      for (let i = 0; i < C; i++) if (!v[i]) { const k = bitCount(cd[i]); if (k < bc) { bc = k; best = i; if (k === 2) break; } }
      if (best < 0) { count++; if (!first) first = v.slice(); return; }
      const ds = []; for (let m = cd[best]; m; m &= m - 1) ds.push(lowBit(m) + 1);
      if (random) shuffle(ds);
      for (const d of ds) {
        const v2 = v.slice(), c2 = cd.slice();
        if (assign(v2, c2, best, d)) rec(v2, c2);
        if (count >= limit || aborted) return;
      }
    }
    let ok = true;
    for (let i = 0; i < C; i++) if (grid[i] && !assign(val, cand, i, grid[i])) { ok = false; break; }
    if (ok) rec(val, cand);
    return { count, solution: first, aborted };
  }

  // --- Логический решатель «как человек» ---
  // level 1: одиночки; level 2: + блок/линия и голые пары
  function candidatesFor(grid) {
    const cd = new Array(C);
    for (let i = 0; i < C; i++) {
      if (grid[i]) { cd[i] = 1 << (grid[i] - 1); continue; }
      let m = ALL;
      for (const p of PEERS[i]) if (grid[p]) m &= ~(1 << (grid[p] - 1));
      cd[i] = m;
    }
    return cd;
  }
  function nextStep(grid, cd, level) {
    // одиночка в клетке
    for (let i = 0; i < C; i++) if (!grid[i] && cd[i] && !(cd[i] & (cd[i] - 1)))
      return { type: 'naked', cell: i, value: lowBit(cd[i]) + 1 };
    // единственное место в блоке, строке или столбце
    for (const U of [...BOXES, ...ROWS, ...COLS]) for (let d = 1; d <= N; d++) {
      const bit = 1 << (d - 1); let n = 0, w = -1, placed = false;
      for (const i of U.cells) { if (grid[i] === d) { placed = true; break; } if (!grid[i] && (cd[i] & bit)) { n++; w = i; } }
      if (!placed && n === 1) return { type: 'hidden', cell: w, value: d, unit: U };
    }
    if (level < 2) return null;
    const spotsOf = (U, bit) => U.cells.filter(i => !grid[i] && (cd[i] & bit));
    // все места для d в блоке лежат на одной линии → на остальной линии d нет (и наоборот)
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
    // голая пара: две клетки с одинаковыми двумя кандидатами
    for (const U of UNITS) {
      const two = U.cells.filter(i => !grid[i] && bitCount(cd[i]) === 2);
      for (let a = 0; a < two.length; a++) for (let b = a + 1; b < two.length; b++) {
        const m = cd[two[a]]; if (cd[two[b]] !== m) continue;
        const elim = U.cells.filter(i => i !== two[a] && i !== two[b] && !grid[i] && (cd[i] & m)).map(cell => ({ cell, mask: cd[cell] & m }));
        if (elim.length) return { type: 'pair', mask: m, unit: U, cells: [two[a], two[b]], elim };
      }
    }
    return null;
  }
  function place(grid, cd, i, d) {
    grid[i] = d; cd[i] = 1 << (d - 1);
    for (const p of PEERS[i]) if (!grid[p]) cd[p] &= ~(1 << (d - 1));
  }
  function logicSolve(givens, level) {
    const grid = givens.slice(), cd = candidatesFor(grid);
    let steps = 0, tricks = 0;
    for (;;) {
      const st = nextStep(grid, cd, level);
      if (!st) break;
      steps++;
      if (st.elim) { tricks++; for (const e of st.elim) cd[e.cell] &= ~e.mask; continue; }
      place(grid, cd, st.cell, st.value);
    }
    return { solved: grid.every(x => x), steps, tricks };
  }

  // --- Генерация ---
  const LEVELS = {
    easy:   { logic: 1, keep: 76 },
    medium: { logic: 1, keep: 0 },
    hard:   { logic: 2, keep: 0, harderThan: 1, tricks: 3 },
  };
  function fullGrid() {
    for (;;) {
      const r = solve(new Array(C).fill(0), { limit: 1, random: true, maxNodes: 3000 });
      if (r.solution) return r.solution;
    }
  }
  function generate(difficulty = 'medium') {
    const cfg = LEVELS[difficulty] || LEVELS.medium;
    let hardTries = 0;
    for (;;) {
      const sol = fullGrid(), givens = sol.slice();
      let kept = C;
      // убираем симметричными парами, чтобы поле выглядело аккуратно
      const order = shuffle([...Array(C / 2).keys()]);
      for (const i of order) {
        if (kept <= cfg.keep) break;
        const j = C - 1 - i, a = givens[i], b = givens[j];
        givens[i] = 0; givens[j] = 0;
        if (logicSolve(givens, cfg.logic).solved) kept -= 2;
        else { givens[i] = a; givens[j] = b; }
      }
      // «сложная» должна несколько раз требовать приём посложнее одиночек
      if (cfg.harderThan && ++hardTries < 30 &&
        (logicSolve(givens, cfg.harderThan).solved || logicSolve(givens, cfg.logic).tricks < cfg.tricks)) continue;
      return { givens, solution: sol, difficulty };
    }
  }

  return { N, C, BR, BC, SYM, rowOf, colOf, boxOf, UNITS, ROWS, COLS, BOXES, PEERS, solve, generate, candidatesFor, nextStep, logicSolve };
})();
if (typeof module !== 'undefined') module.exports = Sudoku12;
