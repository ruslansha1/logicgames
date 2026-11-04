// ===== Нонограммы: генератор и решатель =====
// Поле: массив N*N, 1 = закрашено, 0 = пусто. Подсказки строк и столбцов: длины блоков подряд.
// Задача годится, только если она решается построчной логикой без перебора: тогда решение
// единственное, и для каждой клетки есть объяснение «в этой строке иначе нельзя».
const Nonogram = (() => {
  const SIZE = { easy: 15, medium: 20, hard: 25 };

  const runs = line => {
    const r = []; let k = 0;
    for (const v of line) { if (v === 1) k++; else if (k) { r.push(k); k = 0; } }
    if (k) r.push(k);
    return r;
  };
  const rowCells = (N, r) => Array.from({ length: N }, (_, c) => r * N + c);
  const colCells = (N, c) => Array.from({ length: N }, (_, r) => r * N + c);
  function clues(grid, N) {
    const rows = [], cols = [];
    for (let k = 0; k < N; k++) {
      rows.push(runs(rowCells(N, k).map(i => grid[i])));
      cols.push(runs(colCells(N, k).map(i => grid[i])));
    }
    return { rows, cols };
  }

  // Решение одной линии. known[i]: 1 закрашено, 2 пусто (крестик), 0 неизвестно.
  // Возвращает массив с тем, что можно утверждать наверняка, или null, если линия противоречива.
  function solveLine(clue, known) {
    const n = known.length, k = clue.length;
    // can[j][i]: первые j блоков можно уложить в клетки [0, i), причём клетка i-1 не закрашена «внутрь» следующего блока
    // Считаем «можно ли уложить блоки j..k-1 начиная с позиции i» с обеих сторон.
    const filledBefore = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) filledBefore[i + 1] = filledBefore[i] + (known[i] === 2 ? 1 : 0);
    const blocked = (a, b) => filledBefore[b] - filledBefore[a] > 0; // есть крестик в [a, b)
    const isFill = i => known[i] === 1;
    // fwd[j][i]: блоки 0..j-1 уложены в [0, i) и клетка i свободна для продолжения (i == n или known[i] != 1 в смысле границы — проверяется при переходе)
    const fwd = Array.from({ length: k + 1 }, () => new Uint8Array(n + 2));
    fwd[0][0] = 1;
    for (let i = 0; i < n; i++) { if (isFill(i)) break; fwd[0][i + 1] = 1; }
    for (let j = 1; j <= k; j++) {
      const L = clue[j - 1];
      for (let i = 0; i <= n; i++) {
        // fwd[j][i] = блок j-1 заканчивается в e <= i, после него пусто до i
        if (i > 0 && fwd[j][i - 1] && !isFill(i - 1)) { fwd[j][i] = 1; continue; }
        // блок занимает [i-L, i), перед ним граница
        const s = i - L;
        if (s < 0 || blocked(s, i)) continue;
        if (j === 1) { if (fwd[0][s]) fwd[j][i] = 1; }
        else if (s - 1 >= 0 && !isFill(s - 1) && fwd[j - 1][s - 1]) fwd[j][i] = 1;
      }
    }
    // bwd[j][i]: блоки j..k-1 укладываются в [i, n)
    const bwd = Array.from({ length: k + 2 }, () => new Uint8Array(n + 2));
    bwd[k][n] = 1;
    for (let i = n - 1; i >= 0; i--) { if (isFill(i)) break; bwd[k][i] = 1; }
    for (let j = k - 1; j >= 0; j--) {
      const L = clue[j];
      for (let i = n; i >= 0; i--) {
        if (i < n && bwd[j][i + 1] && !isFill(i)) { bwd[j][i] = 1; continue; }
        const e = i + L;
        if (e > n || blocked(i, e)) continue;
        if (j === k - 1) { if (bwd[k][e]) bwd[j][i] = 1; }
        else if (e < n && !isFill(e) && bwd[j + 1][e + 1]) bwd[j][i] = 1;
      }
    }
    if (!fwd[k][n]) return null;
    // какие клетки могут быть закрашены: блок j на [s, s+L) возможен, если fwd до s и bwd после
    const canFill = new Uint8Array(n), canEmpty = new Uint8Array(n);
    const diff = new Int32Array(n + 1);
    for (let j = 0; j < k; j++) {
      const L = clue[j];
      for (let s = 0; s + L <= n; s++) {
        const e = s + L;
        if (blocked(s, e)) continue;
        const left = j === 0 ? fwd[0][s] : (s >= 1 && !isFill(s - 1) && fwd[j][s - 1]);
        if (!left) continue;
        const right = j === k - 1 ? bwd[k][e] : (e < n && !isFill(e) && bwd[j + 1][e + 1]);
        if (!right) continue;
        diff[s]++; diff[e]--;
      }
    }
    let acc = 0;
    for (let i = 0; i < n; i++) { acc += diff[i]; if (acc > 0) canFill[i] = 1; }
    // клетка может быть пустой, если она в зазоре: существует разбиение с j блоками слева от i и k-j справа
    for (let i = 0; i < n; i++) {
      if (isFill(i)) continue;
      for (let j = 0; j <= k; j++) if (fwd[j][i] && bwd[j][i + 1]) { canEmpty[i] = 1; break; }
    }
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      if (!canFill[i] && !canEmpty[i]) return null;
      out[i] = canFill[i] && canEmpty[i] ? 0 : canFill[i] ? 1 : 2;
      if (known[i] && out[i] && known[i] !== out[i]) return null;
      if (known[i] && !out[i]) out[i] = known[i];
    }
    return out;
  }

  // Строчное решение всей задачи. state: 0/1/2 как в solveLine. Возвращает { state, sweeps, ok }.
  function logicSolve(cl, N, start) {
    const state = start ? start.slice() : new Array(N * N).fill(0);
    const lines = [];
    for (let k = 0; k < N; k++) lines.push({ kind: 'row', idx: k, cells: rowCells(N, k), clue: cl.rows[k] });
    for (let k = 0; k < N; k++) lines.push({ kind: 'col', idx: k, cells: colCells(N, k), clue: cl.cols[k] });
    const dirty = new Uint8Array(lines.length).fill(1);
    let sweeps = 0, changed = true;
    while (changed) {
      changed = false; sweeps++;
      for (let li = 0; li < lines.length; li++) {
        if (!dirty[li]) continue;
        dirty[li] = 0;
        const L = lines[li], known = L.cells.map(i => state[i]);
        const res = solveLine(L.clue, known);
        if (!res) return { state, sweeps, ok: false, contradiction: true };
        res.forEach((v, p) => {
          const i = L.cells[p];
          if (v && !state[i]) {
            state[i] = v; changed = true;
            const r = Math.floor(i / N), c = i % N;
            dirty[L.kind === 'row' ? N + c : r] = 1;
          }
        });
      }
    }
    return { state, sweeps, ok: state.every(v => v) };
  }

  // Следующий шаг для подсказки: линия, в которой из текущего состояния выводятся новые клетки.
  // Предпочитаем линию, где выводится больше всего клеток.
  function nextStep(cl, N, state) {
    let best = null;
    const tryLine = (kind, idx, cells, clue) => {
      const res = solveLine(clue, cells.map(i => state[i]));
      if (!res) return;
      const fill = [], empty = [];
      res.forEach((v, p) => { const i = cells[p]; if (v && !state[i]) (v === 1 ? fill : empty).push(i); });
      const score = fill.length * 2 + empty.length;
      if (score && (!best || score > best.score)) best = { kind, idx, cells, clue, fill, empty, score };
    };
    for (let k = 0; k < N; k++) tryLine('row', k, rowCells(N, k), cl.rows[k]);
    for (let k = 0; k < N; k++) tryLine('col', k, colCells(N, k), cl.cols[k]);
    return best;
  }

  // ----- генерация картинки -----
  // Случайный шум, сглаженный несколькими шагами «большинства соседей», с зеркальной симметрией:
  // получаются цельные фигуры и узоры, а не россыпь точек.
  function picture(N, density) {
    let g = Array.from({ length: N * N }, () => (Math.random() < density ? 1 : 0));
    const steps = N <= 5 ? 0 : N <= 10 ? 1 : N <= 20 ? 2 : 3;
    for (let s = 0; s < steps; s++) {
      const h = g.slice();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        let cnt = 0, tot = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
          tot++; cnt += g[rr * N + cc];
        }
        const v = cnt * 2 > tot ? 1 : cnt * 2 < tot ? 0 : g[r * N + c];
        h[r * N + c] = Math.random() < .06 ? 1 - v : v; // немного шума, чтобы края не были гладкими
      }
      g = h;
    }
    const sym = Math.random();
    if (sym < .6) { // зеркало слева направо
      for (let r = 0; r < N; r++) for (let c = 0; c < N >> 1; c++) g[r * N + (N - 1 - c)] = g[r * N + c];
    } else if (sym < .85) { // зеркало сверху вниз
      for (let r = 0; r < N >> 1; r++) for (let c = 0; c < N; c++) g[(N - 1 - r) * N + c] = g[r * N + c];
    }
    return g;
  }

  function generate(difficulty = 'medium') {
    const N = SIZE[difficulty] || 10;
    const density = { easy: .58, medium: .56, hard: .55 }[difficulty] || .56;
    let best = null;
    for (let tries = 0; tries < 400; tries++) {
      const g = picture(N, density);
      const filled = g.reduce((a, b) => a + b, 0);
      if (filled < N * N * .35 || filled > N * N * .72) continue;
      const cl = clues(g, N);
      // не больше одной совсем пустой строки или столбца
      if (cl.rows.filter(r => !r.length).length + cl.cols.filter(r => !r.length).length > 1) continue;
      const res = logicSolve(cl, N);
      if (!res.ok) continue;
      const p = { N, difficulty, solution: g, rows: cl.rows, cols: cl.cols, sweeps: res.sweeps };
      // на средней и сложной берём задачу, где логика идёт дольше (больше проходов по линиям)
      if (difficulty === 'easy') return p;
      if (!best || p.sweeps > best.sweeps) best = p;
      if (best.sweeps >= (difficulty === 'hard' ? 9 : 6) || tries > 120) return best;
    }
    return best || generate(difficulty);
  }

  return { SIZE, generate, clues, runs, solveLine, logicSolve, nextStep, rowCells, colCells };
})();
if (typeof module !== 'undefined') module.exports = Nonogram;
