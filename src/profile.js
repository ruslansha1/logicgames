// ===== Профили игроков =====
// Всё хранится локально на устройстве. Каждый ключ игры получает суффикс @<id профиля>.
const Profiles = (() => {
  const KEY = 'logicgames-profiles-v1';
  // ключи до появления профилей: при первом запуске они переезжают в первый профиль
  const LEGACY = ['suguru-dalya-v1', 'suguru-dalya-v1-seen', 'sudoku12-dalya-v1', 'sudoku12-dalya-v1-seen', 'logicgames-dalya-v1', 'logicgames-dalya-v1-picker'];
  const AVATARS = ['🦊', '🐱', '🐼', '🦉', '🐰', '🐻', '🐧', '🦄', '🐢', '🌸', '🍓', '⭐'];
  const COLORS = ['#d6457a', '#5b45d1', '#1f9d8a', '#e08a1e', '#2f7fd8', '#9b4fd6'];
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  let data = null;
  // пока true, никто не пишет в хранилище: идёт переключение профиля
  let locked = false;

  function persist() { ls.set(KEY, JSON.stringify(data)); }
  function load() {
    try { data = JSON.parse(ls.get(KEY) || 'null'); } catch (e) {}
    if (!data || !Array.isArray(data.list) || !data.list.length) {
      const id = newId();
      data = { active: id, list: [{ id, name: 'Даля', avatar: '🦊', color: COLORS[0], g: 'f' }], welcomed: false };
      for (const k of LEGACY) { const v = ls.get(k); if (v !== null && ls.get(k + '@' + id) === null) ls.set(k + '@' + id, v); }
      persist();
    }
    if (!data.list.some(p => p.id === data.active)) data.active = data.list[0].id;
  }
  function newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  const active = () => data.list.find(p => p.id === data.active);

  function reloadAs(id) {
    window.dispatchEvent(new Event('lg-save'));
    locked = true;
    data.active = id; persist();
    location.reload();
  }
  function remove(id) {
    if (data.list.length < 2) return;
    const keys = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.endsWith('@' + id)) keys.push(k); } } catch (e) {}
    const wasActive = id === data.active;
    if (wasActive) { window.dispatchEvent(new Event('lg-save')); locked = true; }
    data.list = data.list.filter(p => p.id !== id);
    if (wasActive) data.active = data.list[0].id;
    persist();
    keys.forEach(k => ls.del(k));
    if (wasActive) location.reload();
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Окно создания и правки профиля. Возвращает данные профиля или null.
  function editor({ title, intro = '', p = {}, ok = 'Сохранить', canDelete = false }) {
    return new Promise(resolve => {
      const cur = { name: p.name || '', avatar: p.avatar || AVATARS[(data.list.length) % AVATARS.length], color: p.color || COLORS[data.list.length % COLORS.length], g: p.g || 'f' };
      const root = $('sheetRoot');
      root.innerHTML = `<div class="sheet-back"><div class="sheet pf-edit" role="dialog" aria-modal="true">
        <h2>${title}</h2>${intro}
        <div class="pf-preview"><span class="avatar big" id="pfPrev"></span></div>
        <label class="field"><span>Имя</span><input id="pfName" maxlength="16" autocomplete="off" placeholder="Как тебя зовут?" value="${esc(cur.name)}"></label>
        <div class="field"><span>Обращаться</span><div class="seg" id="pfG">
          <button data-g="f">Она</button><button data-g="m">Он</button></div></div>
        <div class="field"><span>Аватар</span><div class="pf-avatars" id="pfAv">${AVATARS.map(a => `<button data-a="${a}">${a}</button>`).join('')}</div></div>
        <div class="field"><span>Цвет</span><div class="pf-colors" id="pfCol">${COLORS.map(c => `<button data-c="${c}" style="--c:${c}" aria-label="Цвет"></button>`).join('')}</div></div>
        <div class="actions"><button id="pfCancel">Отмена</button><button class="primary" id="pfOk">${ok}</button></div>
        ${canDelete ? '<button class="pf-delete" id="pfDel">Удалить профиль</button>' : ''}
      </div></div>`;
      const paint = () => {
        const prev = $('pfPrev'); prev.textContent = cur.avatar; prev.style.setProperty('--c', cur.color);
        root.querySelectorAll('#pfAv button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.a === cur.avatar)));
        root.querySelectorAll('#pfCol button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === cur.color)));
        root.querySelectorAll('#pfG button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === cur.g)));
      };
      root.querySelectorAll('#pfAv button').forEach(b => b.onclick = () => { cur.avatar = b.dataset.a; paint(); });
      root.querySelectorAll('#pfCol button').forEach(b => b.onclick = () => { cur.color = b.dataset.c; paint(); });
      root.querySelectorAll('#pfG button').forEach(b => b.onclick = () => { cur.g = b.dataset.g; paint(); });
      paint();
      const close = v => { root.innerHTML = ''; resolve(v); };
      $('pfOk').onclick = () => {
        cur.name = $('pfName').value.trim();
        if (!cur.name) { $('pfName').focus(); $('pfName').classList.add('shake'); setTimeout(() => $('pfName').classList.remove('shake'), 400); return; }
        close(cur);
      };
      $('pfCancel').onclick = () => close(null);
      if (canDelete) $('pfDel').onclick = () => close('delete');
    });
  }

  // При первом запуске: познакомиться и объяснить, что прогресс сохранён
  async function welcome() {
    if (data.welcomed) return;
    const p = active();
    const res = await editor({
      title: 'Теперь у каждого свой профиль',
      intro: '<p class="muted">Победы, точность и достижения считаются для каждого игрока отдельно. Всё, что уже было сыграно на этом телефоне, сохранено в этом профиле.</p>',
      p, ok: 'Готово',
    });
    if (res) Object.assign(p, res);
    data.welcomed = true; persist();
  }

  async function add() {
    const res = await editor({ title: 'Новый игрок', ok: 'Создать' });
    if (!res) return false;
    const id = newId();
    data.list.push({ id, ...res });
    persist();
    reloadAs(id);
    return true;
  }
  async function edit() {
    const p = active();
    const res = await editor({ title: 'Мой профиль', p, canDelete: data.list.length > 1 });
    if (res === 'delete') {
      const ok = await sheet({ title: `Удалить «${esc(p.name)}»?`, body: '<p>Пропадут победы, статистика, достижения и начатые партии этого игрока.</p>', ok: 'Удалить', cancel: 'Оставить' });
      if (ok) remove(p.id);
      return false;
    }
    if (res) { Object.assign(p, res); persist(); }
    return !!res;
  }

  load();
  return {
    key: base => base + '@' + data.active,
    active, list: () => data.list, switchTo: id => id !== data.active && reloadAs(id),
    add, edit, welcome, esc,
    get locked() { return locked; },
    // слово в нужном роде: G('сама', 'сам')
    G: (f, m) => (active().g === 'm' ? m : f),
    avatar: (p = active(), cls = '') => `<span class="avatar ${cls}" style="--c:${p.color}">${p.avatar}</span>`,
  };
})();
