// ===== Движок Сугуру: генератор, решатель, логические шаги =====
const Suguru = (() => {
  const N = 9, C = N * N;
  const NB = [];
  for (let i = 0; i < C; i++) {
    const r = (i / N) | 0, c = i % N, a = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < N && cc >= 0 && cc < N) a.push(rr * N + cc);
    }
    NB.push(a);
  }
  const ORTH = [];
  for (let i = 0; i < C; i++) {
    const r = (i / N) | 0, c = i % N, a = [];
    if (r > 0) a.push(i - N); if (r < N - 1) a.push(i + N);
    if (c > 0) a.push(i - 1); if (c < N - 1) a.push(i + 1);
    ORTH.push(a);
  }
  const bitCount = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
  const lowBit = m => 31 - Math.clz32(m & -m); // индекс младшего бита
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // --- Разбиение поля на области (в основном по 5 клеток, иногда 3–4) ---
  // растим области от «самых зажатых» клеток, чтобы не оставалось обрывков
  function makeRegions() {
    const reg = new Array(C).fill(-1);
    let id = 0;
    const free = i => { let n = 0; for (const j of ORTH[i]) if (reg[j] === -1) n++; return n; };
    for (;;) {
      let starts = [], bd = 9;
      for (let i = 0; i < C; i++) if (reg[i] === -1) {
        const f = free(i);
        if (f < bd) { bd = f; starts = [i]; } else if (f === bd) starts.push(i);
      }
      if (!starts.length) break;
      const s = starts[Math.random() * starts.length | 0];
      const x = Math.random(), target = x < 0.8 ? 5 : x < 0.93 ? 4 : 3;
      const cells = [s]; reg[s] = id;
      while (cells.length < target) {
        let best = -1, b = 99;
        for (const c of cells) for (const j of ORTH[c]) if (reg[j] === -1) {
          const f = free(j) + Math.random() * 1.5;
          if (f < b) { b = f; best = j; }
        }
        if (best < 0) break;
        reg[best] = id; cells.push(best);
      }
      id++;
    }
    // обрывки из 1–2 клеток присоединяем к соседям, если влезает
    const size = new Array(id).fill(0); reg.forEach(r => size[r]++);
    for (let i = 0; i < C; i++) {
      const a = reg[i]; if (size[a] >= 3) continue;
      const opts = ORTH[i].map(j => reg[j]).filter(b => b !== a && size[a] + size[b] <= 5);
      if (!opts.length) continue;
      const b = opts[Math.random() * opts.length | 0];
      for (let k = 0; k < C; k++) if (reg[k] === a) reg[k] = b;
      size[b] += size[a]; size[a] = 0;
    }
    const map = new Map();
    return reg.map(r => { if (!map.has(r)) map.set(r, map.size); return map.get(r); });
  }

  function buildGeo(reg) {
    const regions = [];
    reg.forEach((r, i) => { (regions[r] = regions[r] || []).push(i); });
    const size = reg.map(r => regions[r].length);
    const peers = [];
    for (let i = 0; i < C; i++) {
      const s = new Set(NB[i]);
      for (const j of regions[reg[i]]) if (j !== i) s.add(j);
      peers.push([...s]);
    }
    return { reg, regions, size, peers };
  }

  // --- Решатель с распространением ограничений, считает решения до limit ---
  function solve(geo, grid, { limit = 2, random = false, maxNodes = 200000 } = {}) {
    const { regions, size, peers, reg } = geo;
    let nodes = 0, count = 0, first = null, aborted = false;
    const cand = new Array(C), val = new Array(C).fill(0);
    for (let i = 0; i < C; i++) cand[i] = (1 << size[i]) - 1;
    function assign(v, cd, i, d) {
      v[i] = d; cd[i] = 1 << (d - 1);
      const b = ~(1 << (d - 1));
      for (const p of peers[i]) {
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
        for (const R of regions) {
          for (let d = 1; d <= R.length; d++) {
            const bit = 1 << (d - 1); let where = -1, n = 0, placed = false;
            for (const i of R) { if (v[i] === d) { placed = true; break; } if (!v[i] && (cd[i] & bit)) { n++; where = i; } }
            if (placed) continue;
            if (!n) return false;
            if (n === 1) { if (!assign(v, cd, where, d)) return false; changed = true; }
          }
        }
      }
      return true;
    }
    function rec(v, cd) {
      if (++nodes > maxNodes) { aborted = true; return; }
      if (!propagate(v, cd)) return;
      let best = -1, bc = 9;
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
    for (let i = 0; i < C; i++) if (grid[i]) {
      if (grid[i] > size[i] || !assign(val, cand, i, grid[i])) { ok = false; break; }
    }
    if (ok) rec(val, cand);
    return { count, solution: first, aborted };
  }

  // --- Логический решатель «как человек»: возвращает следующий шаг ---
  // level 1: одиночки; level 2: + исключение по общим соседям
  function candidatesFor(geo, grid) {
    const { size, peers } = geo, cd = new Array(C);
    for (let i = 0; i < C; i++) {
      if (grid[i]) { cd[i] = 1 << (grid[i] - 1); continue; }
      let m = (1 << size[i]) - 1;
      for (const p of peers[i]) if (grid[p]) m &= ~(1 << (grid[p] - 1));
      cd[i] = m;
    }
    return cd;
  }
  function nextStep(geo, grid, cd, level) {
    const { regions, size } = geo;
    // одиночка в клетке
    for (let i = 0; i < C; i++) if (!grid[i] && cd[i] && !(cd[i] & (cd[i] - 1)))
      return { type: 'naked', cell: i, value: lowBit(cd[i]) + 1 };
    // единственное место в области
    for (const R of regions) for (let d = 1; d <= R.length; d++) {
      const bit = 1 << (d - 1); let n = 0, w = -1, placed = false;
      for (const i of R) { if (grid[i] === d) { placed = true; break; } if (!grid[i] && (cd[i] & bit)) { n++; w = i; } }
      if (!placed && n === 1) return { type: 'hidden', cell: w, value: d };
    }
    if (level < 2) return null;
    // все кандидаты d в области касаются клетки X → в X не может быть d
    for (const R of regions) for (let d = 1; d <= R.length; d++) {
      const bit = 1 << (d - 1);
      if (R.some(i => grid[i] === d)) continue;
      const spots = R.filter(i => !grid[i] && (cd[i] & bit));
      if (spots.length < 2) continue;
      let common = null;
      for (const s of spots) {
        const ns = new Set(NB[s]);
        common = common ? common.filter(x => ns.has(x)) : [...ns];
      }
      for (const x of common) if (!grid[x] && geo.reg[x] !== geo.reg[R[0]] && (cd[x] & bit))
        return { type: 'elim', cell: x, value: d, cells: spots };
    }
    return null;
  }
  function logicSolve(geo, givens, level) {
    const grid = givens.slice(), cd = candidatesFor(geo, grid);
    let steps = 0;
    for (;;) {
      const st = nextStep(geo, grid, cd, level);
      if (!st) break;
      steps++;
      if (st.type === 'elim') { cd[st.cell] &= ~(1 << (st.value - 1)); continue; }
      grid[st.cell] = st.value; cd[st.cell] = 1 << (st.value - 1);
      for (const p of geo.peers[st.cell]) if (!grid[p]) cd[p] &= ~(1 << (st.value - 1));
    }
    return { solved: grid.every(x => x), steps };
  }

  // --- Генерация ---
  const LEVELS = {
    easy:   { logic: 1, keepRatio: 0.38 },
    medium: { logic: 1, keepRatio: 0 },
    hard:   { logic: 2, keepRatio: 0, harderThan: 1 },
  };
  function generate(difficulty = 'medium') {
    const cfg = LEVELS[difficulty] || LEVELS.medium;
    let hardTries = 0;
    for (let attempt = 0; attempt < 2000; attempt++) {
      const reg = makeRegions();
      const geo = buildGeo(reg);
      const res = solve(geo, new Array(C).fill(0), { limit: 1, random: true, maxNodes: 4000 });
      if (!res.solution) continue;
      const sol = res.solution, givens = sol.slice();
      const minKeep = Math.round(C * cfg.keepRatio);
      let kept = C;
      for (const i of shuffle([...Array(C).keys()])) {
        if (kept <= minKeep) break;
        const v = givens[i]; givens[i] = 0;
        const ok = logicSolve(geo, givens, cfg.logic).solved;
        if (ok) kept--; else givens[i] = v;
      }
      // «сложная» должна требовать приём посложнее одиночек
      if (cfg.harderThan && logicSolve(geo, givens, cfg.harderThan).solved && ++hardTries < 25) continue;
      return { reg, givens, solution: sol, difficulty };
    }
    throw new Error('Не удалось сгенерировать головоломку');
  }

  return { N, C, NB, buildGeo, solve, generate, candidatesFor, nextStep, logicSolve };
})();
if (typeof module !== 'undefined') module.exports = Suguru;
