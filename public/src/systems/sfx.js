// MexiVerse hangeffektek – 16 bites chiptune hangok WebAudio-val generálva (nincs letöltendő fájl).
// Használat: Sfx.play('hit') · Sfx.move('tuz') · Sfx.setVolume(0..1)

const LS = 'mexiverse_sfx_vol';
let ctx = null, master = null, comp = null, noiseBuf = null;
let volume = (() => { try { const v = parseFloat(localStorage.getItem(LS)); return Number.isFinite(v) ? v : 0.6; } catch { return 0.6; } })();
const lastPlayed = {};

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master = ctx.createGain(); master.gain.value = volume * 0.5;
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
// Mobilon/böngészőben csak felhasználói interakció után indulhat hang.
['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, () => ensure(), { capture: true, passive: true }));

const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI → Hz

/** Egy hang: hullámforma, frekvencia (vagy [kezdő, vég]), időtartam, hangerő, burkoló. */
function tone(t0, { type = 'square', f = 440, f2 = null, dur = 0.1, vol = 0.3, a = 0.005, r = 0.05, slide = 'exp', detune = 0, lp = null, vib = 0 }) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f, t0);
  if (f2) slide === 'exp' ? o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur) : o.frequency.linearRampToValueAtTime(f2, t0 + dur);
  if (vib) { const l = ctx.createOscillator(); const lg = ctx.createGain(); l.frequency.value = 7; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + r); }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + a);
  g.gain.setValueAtTime(vol, t0 + Math.max(a, dur - r));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + r);
  let node = o;
  if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); node = fl; }
  node.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + r + 0.02);
}

/** Szűrt zaj (ütés, suhintás, tűz, víz…). */
function noise(t0, { dur = 0.15, vol = 0.3, type = 'lowpass', f = 2000, f2 = null, q = 1, a = 0.003, r = 0.06 }) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t0); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + a);
  g.gain.setValueAtTime(vol, t0 + Math.max(a, dur - r)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + r);
  s.connect(fl); fl.connect(g); g.connect(master);
  s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + r + 0.02);
}

/** Dallam: [[midi, hossz(ütem)], ...], tempo = 1 ütem másodpercben. */
function melody(t0, notes, { step = 0.09, type = 'square', vol = 0.22, harmony = null, bass = false } = {}) {
  let t = t0;
  for (const [n, len = 1] of notes) {
    if (n != null) {
      tone(t, { type, f: N(n), dur: step * len * 0.92, vol, r: 0.04 });
      if (harmony) tone(t, { type: 'square', f: N(n + harmony), dur: step * len * 0.9, vol: vol * 0.45, r: 0.04, detune: 6 });
      if (bass) tone(t, { type: 'triangle', f: N(n - 24), dur: step * len * 0.95, vol: vol * 1.2, r: 0.03 });
    }
    t += step * len;
  }
  return t;
}

// ------------------------------------------------------------------ hangok
const SOUNDS = {
  // --- felület ---
  cursor: (t) => tone(t, { f: 1320, dur: 0.025, vol: 0.12, r: 0.02 }),
  select: (t) => { tone(t, { f: 988, dur: 0.04, vol: 0.18 }); tone(t + 0.045, { f: 1480, dur: 0.06, vol: 0.18 }); },
  back: (t) => { tone(t, { f: 880, dur: 0.04, vol: 0.16 }); tone(t + 0.045, { f: 587, dur: 0.06, vol: 0.16 }); },
  text: (t) => tone(t, { type: 'triangle', f: 1046, dur: 0.02, vol: 0.12, r: 0.015 }),
  open: (t) => { tone(t, { f: 659, f2: 1318, dur: 0.08, vol: 0.15 }); },
  close: (t) => { tone(t, { f: 1318, f2: 659, dur: 0.08, vol: 0.15 }); },
  error: (t) => { tone(t, { type: 'sawtooth', f: 180, dur: 0.09, vol: 0.18, lp: 1200 }); tone(t + 0.11, { type: 'sawtooth', f: 150, dur: 0.12, vol: 0.18, lp: 1200 }); },
  bump: (t) => { tone(t, { type: 'triangle', f: 140, f2: 70, dur: 0.07, vol: 0.35 }); noise(t, { dur: 0.04, vol: 0.12, f: 600 }); },
  door: (t) => { noise(t, { dur: 0.18, vol: 0.2, type: 'bandpass', f: 400, f2: 1600, q: 2 }); tone(t + 0.12, { type: 'triangle', f: 220, f2: 110, dur: 0.12, vol: 0.3 }); },
  coin: (t) => { tone(t, { f: N(83), dur: 0.06, vol: 0.18 }); tone(t + 0.07, { f: N(88), dur: 0.22, vol: 0.18, r: 0.15 }); },
  item: (t) => melody(t, [[72], [76], [79], [84, 3]], { step: 0.07, vol: 0.16, harmony: -12 }),
  save: (t) => melody(t, [[79], [84, 2]], { step: 0.08, vol: 0.12, type: 'triangle' }),

  // --- világ ---
  bark: (t) => { // „Vau!” – két rövid, formáns-szerű ugatás
    for (const [dt, p] of [[0, 1], [0.2, 1.08]]) {
      tone(t + dt, { type: 'sawtooth', f: 720 * p, f2: 300 * p, dur: 0.09, vol: 0.28, lp: 1800, a: 0.004, r: 0.03 });
      tone(t + dt, { type: 'square', f: 360 * p, f2: 180 * p, dur: 0.08, vol: 0.12, lp: 900 });
      noise(t + dt, { dur: 0.05, vol: 0.12, type: 'bandpass', f: 1500, q: 1.5 });
    }
  },
  yip: (t) => tone(t, { type: 'sawtooth', f: 1100, f2: 600, dur: 0.07, vol: 0.2, lp: 2400 }),
  snore: (t) => noise(t, { dur: 0.6, vol: 0.08, type: 'lowpass', f: 300, f2: 700, a: 0.3, r: 0.3 }),
  heart: (t) => melody(t, [[84], [88], [91, 2]], { step: 0.07, vol: 0.12, type: 'triangle' }),
  excl: (t) => { tone(t, { f: N(88), dur: 0.05, vol: 0.2 }); tone(t + 0.06, { f: N(95), dur: 0.12, vol: 0.2 }); },
  grass: (t) => noise(t, { dur: 0.05, vol: 0.06, type: 'highpass', f: 3000 }),
  encounter: (t) => { // klasszikus „vad Mexi!” felfutó trilla
    for (let i = 0; i < 10; i++) tone(t + i * 0.035, { f: N(64 + (i % 2 ? 7 : 0) + i), dur: 0.03, vol: 0.16, r: 0.01 });
    noise(t, { dur: 0.35, vol: 0.12, type: 'bandpass', f: 800, f2: 4000, q: 1 });
    melody(t + 0.36, [[76], [79], [83], [88, 3]], { step: 0.06, vol: 0.18, harmony: -5 });
  },
  trainer: (t) => { melody(t + 0.05, [[69], [72], [76], [81], [80], [76], [77, 3]], { step: 0.08, vol: 0.18, harmony: -12, bass: true }); },
  heal: (t) => melody(t, [[72, 2], [76, 2], [79, 2], [76], [84, 4], [null, 1], [83, 2], [84, 5]], { step: 0.09, vol: 0.17, harmony: -8, type: 'triangle' }),

  // --- harc ---
  hit: (t) => { noise(t, { dur: 0.08, vol: 0.4, f: 3000, f2: 400 }); tone(t, { type: 'square', f: 220, f2: 60, dur: 0.1, vol: 0.3 }); },
  hit_super: (t) => { noise(t, { dur: 0.14, vol: 0.5, f: 5000, f2: 300 }); tone(t, { type: 'square', f: 300, f2: 50, dur: 0.16, vol: 0.38 }); tone(t + 0.05, { type: 'sawtooth', f: 160, f2: 40, dur: 0.14, vol: 0.25 }); },
  hit_weak: (t) => { noise(t, { dur: 0.05, vol: 0.22, f: 1200, f2: 300 }); tone(t, { type: 'triangle', f: 180, f2: 90, dur: 0.07, vol: 0.2 }); },
  crit: (t) => { SOUNDS.hit_super(t); tone(t + 0.05, { f: N(96), f2: N(91), dur: 0.12, vol: 0.14, r: 0.1 }); },
  miss: (t) => noise(t, { dur: 0.18, vol: 0.18, type: 'bandpass', f: 600, f2: 3000, q: 3 }),
  faint: (t) => { tone(t, { type: 'square', f: 880, f2: 110, dur: 0.6, vol: 0.2, lp: 2500 }); tone(t + 0.62, { type: 'triangle', f: 110, f2: 55, dur: 0.25, vol: 0.3 }); },
  stat_up: (t) => { for (let i = 0; i < 6; i++) tone(t + i * 0.05, { f: N(72 + i * 3), dur: 0.05, vol: 0.13 }); },
  stat_down: (t) => { for (let i = 0; i < 6; i++) tone(t + i * 0.05, { f: N(88 - i * 3), dur: 0.05, vol: 0.13 }); },
  status: (t) => tone(t, { type: 'triangle', f: 440, dur: 0.35, vol: 0.2, vib: 60 }),
  heal_hp: (t) => { for (let i = 0; i < 5; i++) tone(t + i * 0.06, { type: 'triangle', f: N(79 + i * 2), dur: 0.08, vol: 0.14 }); },
  switch_in: (t) => { tone(t, { f: 300, f2: 1200, dur: 0.12, vol: 0.12 }); SOUNDS.bark(t + 0.14); },
  throw: (t) => { noise(t, { dur: 0.32, vol: 0.18, type: 'bandpass', f: 500, f2: 2500, q: 2 }); tone(t, { type: 'triangle', f: 300, f2: 900, dur: 0.3, vol: 0.1 }); },
  ball_open: (t) => { tone(t, { f: 2000, f2: 400, dur: 0.15, vol: 0.18 }); noise(t, { dur: 0.15, vol: 0.15, type: 'highpass', f: 2500 }); },
  shake: (t) => { tone(t, { type: 'triangle', f: 330, dur: 0.04, vol: 0.3 }); tone(t + 0.05, { type: 'triangle', f: 247, dur: 0.05, vol: 0.25 }); },
  catch: (t) => { tone(t, { f: 1600, dur: 0.05, vol: 0.2 }); melody(t + 0.25, [[72], [76], [79], [84, 2], [79], [84, 5]], { step: 0.1, vol: 0.18, harmony: -5, bass: true }); },
  escape: (t) => { tone(t, { f: 200, f2: 1400, dur: 0.12, vol: 0.2 }); noise(t, { dur: 0.1, vol: 0.2, type: 'highpass', f: 2000 }); },
  run: (t) => { for (let i = 0; i < 3; i++) noise(t + i * 0.09, { dur: 0.06, vol: 0.12, type: 'bandpass', f: 1200 + i * 400, q: 2 }); },
  levelup: (t) => melody(t, [[72], [76], [79], [84], [null], [84], [88, 4]], { step: 0.075, vol: 0.18, harmony: -5 }),
  learn: (t) => melody(t, [[79], [83], [86], [91, 3]], { step: 0.08, vol: 0.17, harmony: -12 }),
  win: (t) => melody(t, [[67], [72], [76], [79, 2], [76], [79, 4], [null], [81], [79], [77], [79, 6]], { step: 0.1, vol: 0.18, harmony: -9, bass: true }),
  lose: (t) => melody(t, [[67, 2], [66, 2], [65, 2], [64, 6]], { step: 0.14, vol: 0.18, type: 'triangle', bass: true }),
  evolve: (t) => {
    for (let i = 0; i < 16; i++) tone(t + i * 0.07, { type: 'triangle', f: N(60 + (i % 4) * 4 + Math.floor(i / 4) * 5), dur: 0.08, vol: 0.12 });
    noise(t, { dur: 1.1, vol: 0.06, type: 'bandpass', f: 1500, f2: 7000, q: 4, a: 0.5 });
    melody(t + 1.15, [[72], [76], [79], [84], [88], [91, 6]], { step: 0.08, vol: 0.2, harmony: -5, bass: true });
  },
};

// Típusonkénti támadáshang
const MOVE_SFX = {
  semleges: (t) => { noise(t, { dur: 0.12, vol: 0.2, type: 'bandpass', f: 800, f2: 2500, q: 2 }); },
  tuz: (t) => { noise(t, { dur: 0.45, vol: 0.35, type: 'lowpass', f: 400, f2: 3000, a: 0.08, r: 0.2 }); tone(t, { type: 'sawtooth', f: 90, f2: 160, dur: 0.4, vol: 0.12, lp: 600 }); },
  viz: (t) => { for (let i = 0; i < 7; i++) tone(t + i * 0.05, { type: 'sine', f: 400 + Math.random() * 500, f2: 900 + Math.random() * 600, dur: 0.05, vol: 0.2 }); noise(t, { dur: 0.35, vol: 0.12, type: 'bandpass', f: 1200, q: 0.8 }); },
  noveny: (t) => { noise(t, { dur: 0.4, vol: 0.18, type: 'bandpass', f: 2000, f2: 5000, q: 1.5, a: 0.1 }); for (let i = 0; i < 3; i++) tone(t + i * 0.1, { type: 'triangle', f: N(79 + i * 5), dur: 0.06, vol: 0.1 }); },
  villam: (t) => { for (let i = 0; i < 8; i++) tone(t + i * 0.035, { type: 'square', f: 200 + Math.random() * 1800, dur: 0.03, vol: 0.18, r: 0.01 }); noise(t + 0.1, { dur: 0.2, vol: 0.3, type: 'highpass', f: 1500 }); },
  fold: (t) => { tone(t, { type: 'triangle', f: 90, f2: 35, dur: 0.4, vol: 0.5 }); noise(t, { dur: 0.4, vol: 0.3, type: 'lowpass', f: 500, f2: 120 }); },
  jeg: (t) => { for (let i = 0; i < 6; i++) tone(t + i * 0.045, { type: 'triangle', f: N(96 - (i % 3) * 2 + i), dur: 0.05, vol: 0.13 }); noise(t, { dur: 0.3, vol: 0.12, type: 'highpass', f: 5000 }); },
  arnyek: (t) => { tone(t, { type: 'sawtooth', f: 110, f2: 70, dur: 0.45, vol: 0.18, detune: 15, lp: 900 }); tone(t, { type: 'sawtooth', f: 113, f2: 72, dur: 0.45, vol: 0.18, lp: 900 }); noise(t, { dur: 0.4, vol: 0.12, type: 'bandpass', f: 300, f2: 900, q: 3 }); },
  feny: (t) => { for (let i = 0; i < 8; i++) tone(t + i * 0.04, { type: 'sine', f: N(84 + (i % 4) * 4), dur: 0.12, vol: 0.12 }); },
  gep: (t) => { tone(t, { type: 'square', f: 150, dur: 0.25, vol: 0.15, vib: 40, lp: 1500 }); for (let i = 0; i < 3; i++) noise(t + i * 0.08, { dur: 0.03, vol: 0.2, type: 'highpass', f: 3000 }); },
};

export const Sfx = {
  play(name, { delay = 0, throttle = 40 } = {}) {
    if (volume <= 0) return;
    const fn = SOUNDS[name]; if (!fn) return;
    const now = performance.now();
    if (throttle && lastPlayed[name] && now - lastPlayed[name] < throttle) return;
    lastPlayed[name] = now;
    if (!ensure()) return;
    try { fn(ctx.currentTime + 0.01 + delay); } catch (e) { /* hang nélkül megyünk tovább */ }
  },
  move(type, { delay = 0 } = {}) {
    if (volume <= 0 || !ensure()) return;
    try { (MOVE_SFX[type] || MOVE_SFX.semleges)(ctx.currentTime + 0.01 + delay); } catch (e) { /* */ }
  },
  /** Találat hangja hatékonyság szerint. */
  hit({ crit = false, eff = 1 } = {}) { this.play(crit ? 'crit' : eff > 1 ? 'hit_super' : eff < 1 ? 'hit_weak' : 'hit'); },
  get volume() { return volume; },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(LS, String(volume)); } catch { /* */ }
    if (master) master.gain.value = volume * 0.5;
  },
  list: () => Object.keys(SOUNDS),
};
if (typeof window !== 'undefined') window.MEXI_SFX = Sfx;
