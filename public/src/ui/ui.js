// UIManager – DOM-alapú felület (párbeszédek, választások, ablakok, értesítések).
const root = () => document.getElementById('ui');

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}

// ---- Billentyű-kezelő verem: a legfelső ablak kapja a billentyűket ----
const keyStack = [];
export function pushKeys(fn) { keyStack.push(fn); return () => { const i = keyStack.lastIndexOf(fn); if (i >= 0) keyStack.splice(i, 1); }; }
window.addEventListener('keydown', (e) => {
  const top = keyStack[keyStack.length - 1];
  if (top && !(e.target instanceof HTMLInputElement)) { top(e); e.preventDefault(); }
});

let busyCount = 0;
export const UI = {
  get busy() { return busyCount > 0; },
  lock() { busyCount++; }, unlock() { busyCount = Math.max(0, busyCount - 1); },
};

// ---- Párbeszéd (gépelés-effekttel) ----
export function dialog(lines, who = null) {
  if (typeof lines === 'string') lines = [lines];
  UI.lock();
  return new Promise((resolve) => {
    const box = el('div', { id: 'dialog', class: 'panel' });
    root().append(box);
    let i = 0, typing = null, full = '';
    const show = () => {
      full = lines[i]; let n = 0;
      box.innerHTML = ''; if (who) box.append(el('div', { class: 'who' }, who));
      const span = el('span'); box.append(span, el('div', { class: 'more' }, '▼'));
      clearInterval(typing);
      typing = setInterval(() => { n += 2; span.textContent = full.slice(0, n); if (n >= full.length) { clearInterval(typing); typing = null; } }, 16);
    };
    const next = () => {
      if (typing) { clearInterval(typing); typing = null; box.querySelector('span').textContent = full; return; }
      i++; if (i >= lines.length) { off(); box.remove(); UI.unlock(); setTimeout(resolve, 60); } else show();
    };
    box.addEventListener('pointerdown', (e) => { e.stopPropagation(); next(); });
    const off = pushKeys((e) => { if (['Enter', ' ', 'e', 'E', 'Escape'].includes(e.key)) next(); });
    show();
  });
}

// ---- Választás ----
export function choose(options, { question = null, who = null, cancel = true } = {}) {
  UI.lock();
  return new Promise((resolve) => {
    let qBox = null;
    if (question) { qBox = el('div', { id: 'dialog', class: 'panel' }, who ? el('div', { class: 'who' }, who) : null, question); root().append(qBox); }
    const box = el('div', { class: 'choices panel' });
    let sel = 0;
    const btns = options.map((o, i) => el('button', { class: 'btn', onclick: () => done(i) }, o));
    box.append(...btns); root().append(box);
    const paint = () => btns.forEach((b, i) => b.classList.toggle('sel', i === sel)); paint();
    const done = (i) => { off(); box.remove(); qBox?.remove(); UI.unlock(); setTimeout(() => resolve(i), 30); };
    const off = pushKeys((e) => {
      if (e.key === 'ArrowDown' || e.key === 's') { sel = (sel + 1) % btns.length; paint(); }
      else if (e.key === 'ArrowUp' || e.key === 'w') { sel = (sel - 1 + btns.length) % btns.length; paint(); }
      else if (['Enter', ' ', 'e', 'E'].includes(e.key)) done(sel);
      else if (e.key === 'Escape' && cancel) done(-1);
    });
  });
}

// ---- Értesítés ----
let toastT = null;
export function toast(text, ms = 2200) {
  let t = document.getElementById('toast');
  if (!t) { t = el('div', { id: 'toast', class: 'panel' }); root().append(t); }
  t.textContent = text; t.style.opacity = 1;
  clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = 0; }, ms);
}

// ---- Ablak ----
export function openWindow(title, build, { onClose } = {}) {
  UI.lock();
  const body = el('div', { class: 'body' });
  const close = () => { off(); modal.remove(); UI.unlock(); onClose?.(); };
  const modal = el('div', { class: 'modal', onpointerdown: (e) => { if (e.target === modal) close(); } },
    el('div', { class: 'win panel' },
      el('header', {}, el('h2', {}, title), el('button', { class: 'x', onclick: close }, '✕')),
      body));
  root().append(modal);
  const keyHandlers = [];
  const off = pushKeys((e) => { if (e.key === 'Escape') { if (keyHandlers.length) keyHandlers[keyHandlers.length - 1](); else close(); } });
  const api = {
    body, close, modal,
    setTitle(t) { modal.querySelector('h2').textContent = t; },
    render(fn) { body.innerHTML = ''; fn(body); },
    onBack(fn) { keyHandlers.push(fn); return () => keyHandlers.splice(keyHandlers.indexOf(fn), 1); },
  };
  build(api);
  return api;
}

export function hpClass(hp, max) { const r = hp / max; return r > 0.5 ? '' : r > 0.2 ? 'mid' : 'low'; }
export function hpBar(hp, max) { return el('div', { class: 'hpbar ' + hpClass(hp, max) }, el('i', { style: `width:${Math.max(0, Math.round((hp / max) * 100))}%` })); }

// ---- Szövegbekérés (a böngésző saját prompt() ablaka helyett) ----
export function askText(question, value = '', max = 14) {
  UI.lock();
  return new Promise((resolve) => {
    const input = el('input', { value, maxlength: max, style: 'font:inherit;font-size:18px;width:100%;padding:8px;border:3px solid var(--line);border-radius:8px;margin:8px 0' });
    const done = (v) => { off(); modal.remove(); UI.unlock(); setTimeout(() => resolve(v), 30); };
    const modal = el('div', { class: 'modal' }, el('div', { class: 'panel newgame' },
      el('div', { style: 'font-weight:800' }, question), input,
      el('div', { style: 'display:flex;gap:8px' },
        el('button', { class: 'btn', onclick: () => done(null) }, 'Mégse'),
        el('button', { class: 'btn primary', style: 'flex:1', onclick: () => done(input.value) }, 'OK'))));
    document.getElementById('ui').append(modal);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value); if (e.key === 'Escape') done(null); e.stopPropagation(); });
    const off = pushKeys(() => {});
    setTimeout(() => input.focus(), 50);
  });
}
