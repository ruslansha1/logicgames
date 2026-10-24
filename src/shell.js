// ===== Переключение между играми =====
const GAMES = {
  suguru: { app: SuguruApp, title: 'Сугуру', size: '9×9', about: 'Области с числами, одинаковые не касаются' },
  sudoku: { app: SudokuApp, title: 'Судоку', size: '12×12', about: 'Символы 1–9, A, B, C в строках, столбцах и блоках' },
};
const SHELL_KEY = 'logicgames-dalya-v1';
let current = 'suguru';

function switchTo(id) {
  if (!GAMES[id]) id = 'suguru';
  current = id;
  for (const k in GAMES) $('screen-' + k).hidden = k !== id;
  const g = GAMES[id];
  $('brandTitle').innerHTML = `${g.title}<span>.</span>`;
  $('brandSize').textContent = g.size;
  document.title = `${g.title} для Дали`;
  try { localStorage.setItem(SHELL_KEY, JSON.stringify({ current })); } catch (e) {}
  g.app.show();
}

function pickGame() {
  $('gameBtn').classList.remove('fresh');
  try { localStorage.setItem(SHELL_KEY + '-picker', '1'); } catch (e) {}
  const root = $('sheetRoot');
  const items = Object.entries(GAMES).map(([k, g]) => `
    <button class="game-card" data-game="${k}" aria-pressed="${k === current}">
      <span class="game-ico ${k}" aria-hidden="true"></span>
      <span class="game-txt"><b>${g.title} <i>${g.size}</i></b><small>${g.about}</small></span>
      <span class="game-solved">${g.app.solved()}<small>решено</small></span>
    </button>`).join('');
  root.innerHTML = `<div class="sheet-back"><div class="sheet" role="dialog" aria-modal="true">
    <h2>Во что сыграем?</h2><div class="games">${items}</div>
    <p class="muted">Прогресс в каждой игре сохраняется отдельно.</p></div></div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelectorAll('.game-card').forEach(b => b.onclick = () => { close(); if (b.dataset.game !== current) switchTo(b.dataset.game); });
  root.querySelector('.sheet-back').addEventListener('pointerdown', e => { if (e.target.classList.contains('sheet-back')) close(); });
}

function initShell() {
  $('gameBtn').onclick = pickGame;
  $('rulesBtn').onclick = () => GAMES[current].app.rules();
  document.addEventListener('keydown', e => {
    if ($('sheetRoot').innerHTML) return;
    GAMES[current].app.keydown(e);
  });
  setInterval(() => { if (!document.hidden) GAMES[current].app.tick(); }, 1000);
  try { if (!localStorage.getItem(SHELL_KEY + '-picker')) $('gameBtn').classList.add('fresh'); } catch (e) {}
  let saved = 'suguru';
  try { saved = (JSON.parse(localStorage.getItem(SHELL_KEY) || 'null') || {}).current || saved; } catch (e) {}
  switchTo(saved);
}
initShell();
