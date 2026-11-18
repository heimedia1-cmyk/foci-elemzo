// Mobil vezérlés: lebegő joystick vagy D-pad + A / B / Menü / Szimat / Futás gombok.
// Több ujjal is működik (minden vezérlő a saját érintését követi), holt zónával és
// iránytartással, és sosem akad be: elengedéskor, alkalmazásváltáskor, hívásnál mindig nulláz.
import { el } from './ui.js';
import { plugin } from '../systems/api.js';

const KEY = 'mexiverse_controls';
export const DEFAULT_CONTROLS = { show: 'auto', mode: 'joystick', joySize: 140, btnScale: 1, opacity: 0.85, leftHanded: false, vibration: true, fx: 'full' };
export function getControls() {
  try { return { ...DEFAULT_CONTROLS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT_CONTROLS }; }
}
export function setControls(patch) {
  const c = { ...getControls(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* */ }
  window.dispatchEvent(new CustomEvent('mexi-controls', { detail: c }));
  return c;
}
export const touchEnabled = () => { const c = getControls(); return c.show === 'always' || (c.show === 'auto' && window.MEXI_TOUCH); };

/** Rövid rezgés (ha be van kapcsolva). kind: 'tap' | 'hit' | 'catch' */
export function vibrate(kind = 'tap') {
  if (!getControls().vibration) return;
  const H = plugin('Haptics');
  try {
    if (H) { if (kind === 'catch') H.notification({ type: 'SUCCESS' }); else H.impact({ style: kind === 'hit' ? 'MEDIUM' : 'LIGHT' }); }
    else navigator.vibrate?.(kind === 'catch' ? [30, 40, 60] : kind === 'hit' ? 35 : 12);
  } catch { /* */ }
}
const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

export function setupTouch({ onA, onB, onSniff, onMenu, uiBusy }) {
  const root = document.getElementById('touch');
  root.innerHTML = '';
  let cfg = getControls();
  let dir = null, run = false;
  const active = new Map(); // pointerId -> leállító függvény

  const stick = el('div', { class: 'tc-stick' }, el('div', { class: 'tc-knob' }));
  const dpad = el('div', { class: 'tc-dpad' }, ...['up', 'left', 'right', 'down'].map(d => el('div', { class: 'tc-d ' + d })));
  const zone = el('div', { class: 'tc-zone' }, stick, dpad);
  const mk = (cls, label, onDown, onUp) => {
    const b = el('button', { class: 'tc-btn ' + cls, 'aria-label': label }, label);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch { /* */ }
      b.classList.add('on'); vibrate('tap'); onDown?.();
      active.set(e.pointerId, () => { b.classList.remove('on'); onUp?.(); });
    });
    const end = (e) => { const f = active.get(e.pointerId); if (f) { active.delete(e.pointerId); f(); } };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('lostpointercapture', end);
    return b;
  };
  const bA = mk('a', 'A', () => (uiBusy() ? key('Enter') : onA()));
  const bB = mk('b', 'B', () => (uiBusy() ? key('Escape') : onB?.()));
  const bS = mk('sniff', '🐾', () => !uiBusy() && onSniff());
  const bR = mk('run', '🏃', () => { run = !run; bR.classList.toggle('lit', run); });
  const bM = mk('menu', '☰', () => !uiBusy() && onMenu());
  const btns = el('div', { class: 'tc-btns' }, bR, bS, bB, bA);
  root.append(zone, btns, bM);

  // ---- joystick / D-pad ----
  let stickId = null, cx = 0, cy = 0;
  const knob = stick.firstChild;
  const setDir = (d) => { if (d !== dir) { dir = d; for (const x of dpad.children) x.classList.toggle('on', x.classList.contains(d || '-')); } };
  const fromVector = (dx, dy, radius) => {
    const len = Math.hypot(dx, dy);
    if (len < radius * 0.28) return null; // holt zóna
    const ax = Math.abs(dx), ay = Math.abs(dy);
    // iránytartás: a mostani irányt csak egyértelműen erősebb másik tengely írja felül
    if (dir === 'left' || dir === 'right') { if (ay > ax * 1.25) return dy > 0 ? 'down' : 'up'; return dx > 0 ? 'right' : 'left'; }
    if (dir === 'up' || dir === 'down') { if (ax > ay * 1.25) return dx > 0 ? 'right' : 'left'; return dy > 0 ? 'down' : 'up'; }
    return ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  };
  const release = () => { stickId = null; setDir(null); knob.style.transform = ''; stick.classList.remove('live'); if (cfg.mode === 'joystick') stick.style.cssText = stickStyle(); };
  const stickStyle = () => `width:${cfg.joySize}px;height:${cfg.joySize}px`;
  zone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    e.preventDefault(); stickId = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch { /* */ }
    const zr = zone.getBoundingClientRect();
    if (cfg.mode === 'joystick') { // lebegő: oda kerül, ahová az ujj ér
      cx = e.clientX; cy = e.clientY;
      stick.style.cssText = `${stickStyle()};left:${cx - zr.left - cfg.joySize / 2}px;top:${cy - zr.top - cfg.joySize / 2}px;bottom:auto`;
      stick.classList.add('live');
    } else { const r = dpad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e); }
    active.set(e.pointerId, release);
  });
  const move = (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const R = cfg.mode === 'joystick' ? cfg.joySize / 2 : dpad.offsetWidth / 2;
    const len = Math.hypot(dx, dy);
    if (cfg.mode === 'joystick') { const k = len > R - 8 ? (R - 8) / len : 1; knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`; }
    setDir(fromVector(dx, dy, cfg.mode === 'joystick' ? R : R * 0.55));
  };
  zone.addEventListener('pointermove', move);
  const endZone = (e) => { if (e.pointerId === stickId) { active.delete(e.pointerId); release(); } };
  zone.addEventListener('pointerup', endZone); zone.addEventListener('pointercancel', endZone); zone.addEventListener('lostpointercapture', endZone);

  // ---- biztonsági nullázás: alkalmazásváltás, hívás, fókuszvesztés ----
  const resetAll = () => { for (const f of active.values()) f(); active.clear(); release(); };
  const onVis = () => { if (document.hidden) resetAll(); };
  window.addEventListener('blur', resetAll); document.addEventListener('visibilitychange', onVis); window.addEventListener('pagehide', resetAll);
  window.addEventListener('mexi-app-pause', resetAll);

  // ---- megjelenés a beállítások szerint ----
  const apply = () => {
    cfg = getControls();
    const on = touchEnabled() && root.dataset.hide !== '1';
    root.classList.toggle('hidden', !on);
    root.classList.toggle('lefty', cfg.leftHanded);
    document.body.classList.toggle('tc-on', on); document.body.classList.toggle('tc-lefty', cfg.leftHanded);
    root.style.setProperty('--tc-op', cfg.opacity);
    root.style.setProperty('--tc-scale', cfg.btnScale);
    stick.style.display = cfg.mode === 'joystick' ? '' : 'none';
    dpad.style.display = cfg.mode === 'dpad' ? '' : 'none';
    dpad.style.width = dpad.style.height = Math.round(cfg.joySize * 1.05) + 'px';
    release();
  };
  const onCfg = () => apply();
  window.addEventListener('mexi-controls', onCfg);
  apply();

  return {
    dir: () => dir,
    get run() { return run; },
    hide() { root.dataset.hide = '1'; resetAll(); apply(); },
    show() { root.dataset.hide = ''; apply(); },
    reset: resetAll,
    destroy() {
      resetAll();
      window.removeEventListener('blur', resetAll); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', resetAll);
      window.removeEventListener('mexi-app-pause', resetAll); window.removeEventListener('mexi-controls', onCfg);
      root.innerHTML = ''; root.classList.add('hidden'); document.body.classList.remove('tc-on');
    },
  };
}
