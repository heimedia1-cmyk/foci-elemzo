// Mobil vezérlés: virtuális joystick + gombok.
export function setupTouch({ onA, onSniff, onMenu }) {
  const wrap = document.getElementById('touch');
  if (!window.MEXI_TOUCH) return { dir: () => null, hide() {}, show() {}, destroy() {} };
  wrap.classList.remove('hidden');
  const joy = document.getElementById('joy'), knob = document.getElementById('joy-knob');
  let cur = null, pid = null;
  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
  const move = (e) => {
    const r = joy.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy), max = r.width / 2 - 10;
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    setKnob(dx, dy);
    if (len < 14) { cur = null; return; }
    cur = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  };
  const down = (e) => { pid = e.pointerId; joy.setPointerCapture(pid); move(e); };
  const mv = (e) => { if (e.pointerId === pid) move(e); };
  const up = (e) => { if (e.pointerId === pid) { pid = null; cur = null; setKnob(0, 0); } };
  joy.addEventListener('pointerdown', down); joy.addEventListener('pointermove', mv);
  joy.addEventListener('pointerup', up); joy.addEventListener('pointercancel', up);
  const bA = document.getElementById('tb-a'), bS = document.getElementById('tb-sniff'), bM = document.getElementById('tb-menu');
  const a = (e) => { e.preventDefault(); onA(); }, s = (e) => { e.preventDefault(); onSniff(); }, m = (e) => { e.preventDefault(); onMenu(); };
  bA.addEventListener('pointerdown', a); bS.addEventListener('pointerdown', s); bM.addEventListener('pointerdown', m);
  return {
    dir: () => cur,
    hide() { wrap.classList.add('hidden'); cur = null; setKnob(0, 0); },
    show() { wrap.classList.remove('hidden'); },
    destroy() {
      joy.removeEventListener('pointerdown', down); joy.removeEventListener('pointermove', mv); joy.removeEventListener('pointerup', up); joy.removeEventListener('pointercancel', up);
      bA.removeEventListener('pointerdown', a); bS.removeEventListener('pointerdown', s); bM.removeEventListener('pointerdown', m);
      wrap.classList.add('hidden');
    },
  };
}
