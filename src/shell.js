// ===== Переключение между играми =====
const GAMES = {
  suguru: { app: SuguruApp, title: 'Сугуру', size: '9×9', about: 'Области с числами, одинаковые не касаются' },
  sudoku: { app: SudokuApp, title: 'Судоку', size: '12×12', about: 'Числа 1–12 в строках, столбцах и блоках' },
  killer: { app: KillerApp, title: 'Киллер-судоку', brand: 'Киллер', size: '9×9', about: 'Судоку, где вместо цифр подсказками служат суммы' },
};
const SHELL_KEY = 'logicgames-dalya-v1';
let current = 'suguru';

// daily: дата задачи дня, которую надо открыть в этой игре
function switchTo(id, daily) {
  if (!GAMES[id]) id = 'suguru';
  current = id;
  for (const k in GAMES) $('screen-' + k).hidden = k !== id;
  const g = GAMES[id];
  $('brandTitle').innerHTML = `${g.brand || g.title}<span>.</span>`;
  $('brandSize').textContent = g.size;
  document.title = `${g.title} для Дали`;
  if (!Profiles.locked) try { localStorage.setItem(Profiles.key(SHELL_KEY), JSON.stringify({ current })); } catch (e) {}
  g.app.show(daily);
  Daily.changed();
}

function pickGame() {
  $('gameBtn').classList.remove('fresh');
  try { localStorage.setItem(Profiles.key(SHELL_KEY + '-picker'), '1'); } catch (e) {}
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

async function initShell() {
  $('gameBtn').onclick = pickGame;
  $('rulesBtn').onclick = () => GAMES[current].app.rules();
  document.addEventListener('keydown', e => {
    if ($('sheetRoot').innerHTML) return;
    GAMES[current].app.keydown(e);
  });
  setInterval(() => { if (!document.hidden) { GAMES[current].app.tick(); Daily.tick(); } }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) Daily.tick(); });
  Track.initUI();
  await Profiles.welcome();
  Track.refresh();
  try { if (!localStorage.getItem(Profiles.key(SHELL_KEY + '-picker'))) $('gameBtn').classList.add('fresh'); } catch (e) {}
  let saved = 'suguru';
  try { saved = (JSON.parse(localStorage.getItem(Profiles.key(SHELL_KEY)) || 'null') || {}).current || saved; } catch (e) {}
  switchTo(saved);
}
initShell();
