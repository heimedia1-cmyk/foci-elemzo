// Séta mód (GO) – valódi térkép, közeli Mexik, Mancs-pontok, GO-stílusú elkapás, sétatárs.
// A pozíció csak a telefonon marad: a szerverre semmilyen helyadat nem kerül.
import { G, save, addCaught } from '../systems/state.js';
import { MEXIS } from '../data/mexis.js';
import { ITEMS, itemIcon } from '../data/items.js';
import { createMexi, displayName } from '../systems/mexi.js';
import { addBones, familyOf } from '../systems/bones.js';
import { getArtURL } from '../art/registerArt.js';
import { el, toast, dialog, choose } from '../ui/ui.js';
import { Sfx } from '../systems/sfx.js';
import { GO, spawnsNear, stopsNear, stopRewards, dist, offset, throwQuality, goThrow, goCatchChance, fleeChance, isNight } from './goLogic.js';

const DEMO_START = { lat: 47.5076, lng: 19.0457 }; // Budapest, Szabadság tér környéke (GPS nélküli kipróbáláshoz)
let L = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css'; document.head.append(css);
    const s = document.createElement('script'); s.src = 'vendor/leaflet/leaflet.js'; s.onload = () => res(window.L); s.onerror = rej; document.head.append(s);
  });
}

function goState() {
  const s = G.state;
  s.go ??= { km: 0, buddyKm: 0, buddy: null, stops: {}, spins: 0, caught: {}, seenIntro: false, catches: 0 };
  return s.go;
}
const topLevel = () => Math.max(2, ...[...G.state.party, ...G.state.storage].map(m => m.level));
const allMexis = () => [...G.state.party, ...G.state.storage];
const buddyMon = () => allMexis().find(m => m.uid === goState().buddy) || null;
const fmtD = (d) => d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;

export async function openGoMode(world) {
  if (document.getElementById('go')) return;
  const gs = goState();
  world?.scene.pause(); if (world) world.cutscene = true;
  const root = el('div', { id: 'go' }, el('div', { class: 'go-loading' }, '🗺️ Térkép betöltése...'));
  document.body.append(root);
  try { L = await loadLeaflet(); } catch { root.remove(); world?.scene.resume(); if (world) world.cutscene = false; toast('A térkép nem tölthető be. Van internet?'); return; }
  root.innerHTML = '';
  const S = { pos: null, demo: false, watch: null, last: null, markers: new Map(), stopMarkers: new Map(), busy: false, closed: false, timer: null };

  // ---------- felület ----------
  const mapDiv = el('div', { class: 'go-map' + (isNight(Date.now()) ? ' night' : '') });
  const kmEl = el('span'), ballEl = el('span'), buddyEl = el('button', { class: 'go-chip', onclick: () => pickBuddy() });
  const statusEl = el('div', { class: 'go-status' });
  const nearby = el('div', { class: 'go-nearby' });
  const top = el('div', { class: 'go-top' },
    el('div', { class: 'go-chip' }, '🚶 ', kmEl), el('div', { class: 'go-chip' }, el('img', { src: 'assets/ui/ball_sima.png' }), ballEl), buddyEl,
    el('button', { class: 'go-chip go-exit', onclick: () => close() }, '✕ Vissza'));
  const pad = el('div', { class: 'go-pad hidden' },
    ...[['↑', 0, 12], ['←', -12, 0], ['→', 12, 0], ['↓', 0, -12]].map(([t, e, n]) => el('button', { onpointerdown: (ev) => { ev.preventDefault(); demoMove(e, n); } }, t)));
  const bottom = el('div', { class: 'go-bottom' },
    el('button', { class: 'go-round', title: 'Saját pozícióm', onclick: () => S.pos && map.setView([S.pos.lat, S.pos.lng], 17) }, '◎'),
    el('button', { class: 'go-round big', title: 'Mexik a közelben', onclick: () => nearby.classList.toggle('open') }, '🐾'),
    el('button', { class: 'go-round', title: 'Táska', onclick: () => showBag() }, '🎒'));
  root.append(mapDiv, top, statusEl, nearby, pad, bottom);

  const map = L.map(mapDiv, { zoomControl: false, attributionControl: true, minZoom: 15, maxZoom: 19 }).setView([DEMO_START.lat, DEMO_START.lng], 17);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> közreműködők' }).addTo(map);
  const meIcon = L.divIcon({ className: 'go-me', html: `<div class="go-me-ring"></div><img src="${playerImg()}">`, iconSize: [48, 64], iconAnchor: [24, 56] });
  const me = L.marker([DEMO_START.lat, DEMO_START.lng], { icon: meIcon, interactive: false, zIndexOffset: 1000 }).addTo(map);
  const range = L.circle([DEMO_START.lat, DEMO_START.lng], { radius: GO.catchRadius, color: '#7fd4ff', weight: 1, fillOpacity: 0.06, interactive: false }).addTo(map);

  const refreshHud = () => {
    kmEl.textContent = `${gs.km.toFixed(2)} km`;
    const inv = G.state.inventory; ballEl.textContent = ['sima_labda', 'profi_labda', 'arany_labda', 'hos_labda'].reduce((a, k) => a + (inv[k] || 0), 0);
    const b = buddyMon();
    buddyEl.replaceChildren(b ? el('img', { src: getArtURL(b.species, b.shiny) || '' }) : '🐶', b ? ` ${displayName(b)} ${gs.buddyKm.toFixed(1)}/${GO.buddyKm} km` : ' Sétatárs?');
  };
  refreshHud();

  // ---------- első indítás: biztonság ----------
  if (!gs.seenIntro) {
    await dialog(['🚶 SÉTA MÓD', 'Sétálj a valóságban, és a közeledben Mexik bukkannak fel! A Mancs-pontokon labdát és tárgyakat kapsz.', '⚠️ Figyelj a környezetedre és a forgalomra! Ne játssz vezetés vagy biciklizés közben, és ne menj veszélyes helyre egy Mexi miatt.', 'A pozíciódat csak a telefonod használja – nem mentjük el sehova.']);
    gs.seenIntro = true; save();
  }

  // ---------- pozíció ----------
  const setPos = (p, real) => {
    if (S.pos && real) {
      const d = dist(S.pos, p); const dt = (p.t - (S.pos.t || p.t)) / 1000;
      const speed = dt > 0 ? d / dt : 0;
      if (p.acc <= 50 && d > 3 && d < 500) {
        if (speed <= GO.maxSpeed) addWalk(d);
        else statusEl.textContent = '🚗 Túl gyorsan haladsz – vezetés közben nem számít a séta.';
      }
    }
    S.pos = p;
    me.setLatLng([p.lat, p.lng]); range.setLatLng([p.lat, p.lng]);
    if (!S.centered) { map.setView([p.lat, p.lng], 17); S.centered = true; } else if (!map.getBounds().pad(-0.25).contains([p.lat, p.lng])) map.panTo([p.lat, p.lng]);
    refreshWorld();
  };
  const startDemo = (why) => {
    S.demo = true; pad.classList.remove('hidden');
    statusEl.textContent = `🧪 Kipróbáló mód (${why}) – a nyilakkal sétálhatsz. A sétatárs-csont csak valódi sétával jár.`;
    setPos({ ...DEMO_START, t: Date.now(), acc: 5 }, false);
  };
  const demoMove = (e, n) => {
    if (!S.pos) return;
    const p = offset(S.pos, e, n);
    if (dist(DEMO_START, p) > 800) { toast('Kipróbáló módban 800 m-en belül maradhatsz.'); return; }
    setPos({ ...p, t: Date.now(), acc: 5 }, false);
  };
  S.keys = (ev) => {
    if (!S.demo || S.busy) return;
    const k = { ArrowUp: [0, 12], w: [0, 12], ArrowDown: [0, -12], s: [0, -12], ArrowLeft: [-12, 0], a: [-12, 0], ArrowRight: [12, 0], d: [12, 0] }[ev.key];
    if (k) { ev.preventDefault(); ev.stopPropagation(); demoMove(...k); }
    if (ev.key === 'Escape') close();
  };
  window.addEventListener('keydown', S.keys, true);

  const BG = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.BackgroundGeolocation;
  if (window.MEXI_GO_DEMO) startDemo('teszt');
  else if (BG) {
    // Android app: pontos GPS, ami a háttérben (kikapcsolt képernyővel) is számolja a sétát
    statusEl.textContent = '📡 GPS keresése...';
    const fallback = setTimeout(() => { if (!S.pos) startDemo('nem jött GPS-jel'); }, 20000);
    BG.addWatcher({ backgroundTitle: 'MexiVerse – séta mód', backgroundMessage: 'Számoljuk a sétádat, és figyeljük a közeli Mexiket 🐾', requestPermissions: true, stale: false, distanceFilter: 4 },
      async (loc, err) => {
        if (err) {
          clearTimeout(fallback);
          if (err.code === 'NOT_AUTHORIZED' && !S.pos) {
            const c = await choose(['Beállítások megnyitása', 'Kipróbáló mód'], { question: 'A séta módhoz engedélyezd a helymeghatározást (pontos hely).' });
            if (c === 0) BG.openSettings();
          }
          if (!S.pos) startDemo('nincs engedély');
          return;
        }
        if (!loc || S.demo) return;
        clearTimeout(fallback); statusEl.textContent = '';
        setPos({ lat: loc.latitude, lng: loc.longitude, acc: loc.accuracy ?? 10, t: loc.time || Date.now() }, true);
      }).then((id) => { S.bgId = id; if (S.closed) BG.removeWatcher({ id }); });
  } else if (!navigator.geolocation) startDemo('nincs GPS');
  else {
    statusEl.textContent = '📡 GPS keresése...';
    const fallback = setTimeout(() => { if (!S.pos) startDemo('nem jött GPS-jel'); }, 12000);
    S.watch = navigator.geolocation.watchPosition(
      (gp) => { clearTimeout(fallback); if (S.demo) return; statusEl.textContent = ''; setPos({ lat: gp.coords.latitude, lng: gp.coords.longitude, acc: gp.coords.accuracy, t: gp.timestamp }, true); },
      (err) => { clearTimeout(fallback); if (!S.pos) startDemo(err.code === 1 ? 'a helymeghatározás nincs engedélyezve' : 'nincs GPS-jel'); },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
    if (/Android/i.test(navigator.userAgent)) setTimeout(() => { if (!S.closed && !S.demo) toast('Tipp: az Android appban a séta kikapcsolt képernyővel is számol!'); }, 4000);
  }

  // ---------- séta, sétatárs ----------
  function addWalk(m) {
    gs.km += m / 1000;
    const b = buddyMon();
    if (b) {
      gs.buddyKm += m / 1000;
      if (gs.buddyKm >= GO.buddyKm) {
        gs.buddyKm -= GO.buddyKm; addBones(b.species, 1); Sfx.play('bark');
        toast(`🦴 ${displayName(b)} talált egy ${MEXIS[familyOf(b.species)].name}-csontot!`);
      }
    }
    S.unsaved = (S.unsaved || 0) + m; if (S.unsaved > 100) { S.unsaved = 0; save(); } // ~100 m-enként mentés
    refreshHud();
  }
  async function pickBuddy() {
    if (S.busy) return;
    const list = allMexis(); if (!list.length) return;
    const i = await choose(list.map(m => `${displayName(m)} (Sz. ${m.level})${m.uid === gs.buddy ? ' ✓' : ''}`), { question: `Ki legyen a sétatársad? ${GO.buddyKm} km sétánként talál egy csontot a családjából.` });
    if (i < 0) return;
    if (gs.buddy !== list[i].uid) gs.buddyKm = 0;
    gs.buddy = list[i].uid; save(); refreshHud(); Sfx.play('heart');
    toast(`${displayName(list[i])} mostantól veled sétál! 🐾`);
  }

  // ---------- térkép-elemek ----------
  function refreshWorld() {
    if (!S.pos || S.closed) return;
    const now = Date.now(); const lvl = topLevel();
    const spawns = spawnsNear(S.pos, now, lvl).filter(sp => !gs.caught[sp.id] && sp.expires > now);
    const keep = new Set();
    for (const sp of spawns) {
      keep.add(sp.id);
      if (!S.markers.has(sp.id)) {
        const icon = L.divIcon({ className: 'go-mon', html: `<img src="${getArtURL(sp.species, sp.shiny) || ''}">${sp.shiny ? '<b>✨</b>' : ''}`, iconSize: [56, 56], iconAnchor: [28, 46] });
        const mk = L.marker([sp.lat, sp.lng], { icon }).addTo(map);
        mk.on('click', () => tryEncounter(S.spawnById.get(sp.id) || sp));
        S.markers.set(sp.id, mk);
      }
    }
    for (const [id, mk] of S.markers) if (!keep.has(id)) { mk.remove(); S.markers.delete(id); }
    S.spawnById = new Map(spawns.map(sp => [sp.id, sp]));
    const stops = stopsNear(S.pos); const keepS = new Set();
    for (const st of stops) {
      keepS.add(st.id);
      const used = (gs.stops[st.id] || 0) > now - GO.stopCooldownMs; const near = st.d <= GO.stopRadius;
      const cls = 'go-stop' + (used ? ' used' : near ? ' near' : '');
      let mk = S.stopMarkers.get(st.id);
      if (!mk) {
        mk = L.marker([st.lat, st.lng], { icon: L.divIcon({ className: cls, html: '<div class="pole"></div><div class="disc">🐾</div>', iconSize: [40, 56], iconAnchor: [20, 54] }) }).addTo(map);
        mk.on('click', () => spinStop(S.stopById.get(st.id) || st));
        S.stopMarkers.set(st.id, mk);
      } else mk._icon && (mk._icon.className = mk._icon.className.replace(/go-stop[^ ]*( used| near)?/, cls));
    }
    for (const [id, mk] of S.stopMarkers) if (!keepS.has(id)) { mk.remove(); S.stopMarkers.delete(id); }
    S.stopById = new Map(stops.map(st => [st.id, st]));
    // közeli lista
    nearby.replaceChildren(el('div', { class: 'go-nh' }, `🐾 Mexik a közelben (${spawns.length})`),
      ...spawns.slice(0, 9).map(sp => el('div', { class: 'go-ni', onclick: () => { map.panTo([sp.lat, sp.lng]); tryEncounter(sp); } },
        el('img', { src: getArtURL(sp.species, sp.shiny) || '' }), el('span', {}, `${MEXIS[sp.species].name}${sp.shiny ? ' ✨' : ''}`), el('small', {}, fmtD(sp.d)))));
  }
  S.timer = setInterval(refreshWorld, 15000);

  // ---------- Mancs-pont ----------
  async function spinStop(st) {
    if (S.busy || !S.pos) return;
    const d = dist(S.pos, st); const now = Date.now();
    if ((gs.stops[st.id] || 0) > now - GO.stopCooldownMs) { toast(`${st.name}: pár perc múlva újra pörgetheted.`); return; }
    if (d > GO.stopRadius) { toast(`${st.name} – még ${fmtD(d - GO.stopRadius)}-re van. Menj közelebb!`); return; }
    gs.spins++; gs.stops[st.id] = now;
    const r = stopRewards(st.id, gs.spins, topLevel());
    for (const [k, n] of Object.entries(r)) G.state.inventory[k] = (G.state.inventory[k] || 0) + n;
    Sfx.play('item'); save(); refreshWorld(); refreshHud();
    toast(`🐾 ${st.name}: ` + Object.entries(r).map(([k, n]) => `${n}× ${ITEMS[k].name}`).join(', '));
  }

  // ---------- táska ----------
  async function showBag() {
    const inv = G.state.inventory;
    const lines = Object.entries(inv).filter(([, n]) => n > 0).map(([k, n]) => `${ITEMS[k]?.name || k}: ${n}`);
    await dialog(lines.length ? lines.join(' • ') : 'A táskád üres – pörgess Mancs-pontokat!');
  }

  // ---------- elkapás ----------
  async function tryEncounter(sp) {
    if (S.busy || !S.pos) return;
    const d = dist(S.pos, sp);
    if (d > GO.catchRadius) { toast(`${MEXIS[sp.species].name} még ${fmtD(d - GO.catchRadius)}-re van. Menj közelebb!`); return; }
    if (!['sima_labda', 'profi_labda', 'arany_labda', 'hos_labda'].some(k => G.state.inventory[k] > 0)) { toast('Nincs labdád! Pörgess Mancs-pontot.'); return; }
    S.busy = true;
    const mon = createMexi(sp.species, sp.level, { shiny: sp.shiny });
    G.state.dex.seen[sp.species] = true;
    const res = await catchScreen(mon);
    if (res === 'caught') {
      gs.caught[sp.id] = sp.expires; gs.catches++;
      const where = addCaught(mon, 'séta mód');
      G.state.money += 10;
      toast(`${displayName(mon)} a tiéd! +3 csont, +10 🪙${where === 'storage' ? ' (a tárolóba került)' : ''}`);
    } else if (res === 'fled') gs.caught[sp.id] = sp.expires;
    // régi bejegyzések törlése
    for (const [k, exp] of Object.entries(gs.caught)) if (exp < Date.now()) delete gs.caught[k];
    save(); S.busy = false; refreshWorld(); refreshHud();
  }

  function close() {
    if (S.closed) return; S.closed = true;
    if (S.watch != null) navigator.geolocation.clearWatch(S.watch);
    if (S.bgId != null) BG?.removeWatcher({ id: S.bgId });
    clearInterval(S.timer); window.removeEventListener('keydown', S.keys, true);
    map.remove(); root.remove(); save();
    if (world) { world.cutscene = false; world.scene.resume(); world.updateHud?.(); world.refreshFollower?.(); }
  }
  S.close = close; S.spin = spinStop;
  window.MEXI_GO = S;
}

function playerImg() {
  try {
    const key = 'p_' + (G.state.player.gender === 'lany' ? 'lany' : 'fiu');
    const tex = window.MEXI_DEBUG.game.textures.get(key); const fr = tex.get(0);
    const c = document.createElement('canvas'); c.width = fr.cutWidth; c.height = fr.cutHeight;
    c.getContext('2d').drawImage(tex.getSourceImage(), fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, fr.cutWidth, fr.cutHeight);
    return c.toDataURL();
  } catch { return ''; }
}

/** GO-stílusú elkapó képernyő. Visszaad: 'caught' | 'fled' | 'run'. */
function catchScreen(mon) {
  return new Promise((resolve) => {
    const night = isNight(Date.now());
    const balls = ['sima_labda', 'profi_labda', 'arany_labda', 'hos_labda'];
    let ball = balls.find(k => G.state.inventory[k] > 0);
    const wrap = el('div', { class: 'go-catch', style: `background-image:url(assets/battle/${night ? 'bg_route_night' : 'bg_route'}.jpg)` });
    const name = el('div', { class: 'go-cname' }, `${displayName(mon)}${mon.shiny ? ' ✨' : ''}`, el('small', {}, ` Sz. ${mon.level}`));
    const monImg = el('img', { class: 'go-cmon', src: getArtURL(mon.species, mon.shiny) || '' });
    const ring = el('div', { class: 'go-ring' });
    const target = el('div', { class: 'go-target' }, monImg, ring);
    const ballImg = el('img', { class: 'go-ball', src: itemIcon(ball), draggable: false });
    const ballBtn = el('button', { class: 'go-chip go-ballsel', onclick: () => cycleBall() });
    const msg = el('div', { class: 'go-cmsg' });
    const runBtn = el('button', { class: 'go-chip go-run', onclick: () => done('run') }, '🏃 Elfutok');
    wrap.append(name, target, msg, ballImg, ballBtn, runBtn, el('div', { class: 'go-hint' }, 'Húzd fel a labdát és engedd el! Minél kisebb a kör, annál jobb a dobás.'));
    document.body.append(wrap);
    Sfx.play('encounter');

    const chanceColor = () => { const c = goCatchChance(mon, ball); return c > 0.5 ? '#5cd65c' : c > 0.25 ? '#f0c030' : '#f05040'; };
    const updBall = () => { ballImg.src = itemIcon(ball); ballBtn.textContent = `${ITEMS[ball].name}: ${G.state.inventory[ball] || 0} ▸`; ring.style.borderColor = chanceColor(); };
    const cycleBall = () => { const own = balls.filter(k => G.state.inventory[k] > 0); if (!own.length) return; ball = own[(own.indexOf(ball) + 1) % own.length]; updBall(); };
    updBall();

    // a célkör folyamatosan zsugorodik és újraindul
    let t0 = performance.now(), raf = 0, ringV = 1, busy = false;
    const loop = (t) => { ringV = 1 - (((t - t0) / 1800) % 1) * 0.85; ring.style.transform = `translate(-50%,-50%) scale(${ringV})`; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);

    // húzás és dobás
    let drag = null;
    ballImg.addEventListener('pointerdown', (e) => { if (busy) return; drag = { x: e.clientX, y: e.clientY, t: performance.now(), samples: [[performance.now(), e.clientY]] }; ballImg.setPointerCapture(e.pointerId); });
    ballImg.addEventListener('pointermove', (e) => { if (!drag) return; drag.samples.push([performance.now(), e.clientY]); if (drag.samples.length > 12) drag.samples.shift(); ballImg.style.transform = `translate(calc(-50% + ${e.clientX - drag.x}px), ${e.clientY - drag.y}px)`; });
    ballImg.addEventListener('pointerup', async (e) => {
      if (!drag) return; const d = drag; drag = null;
      const dy = d.y - e.clientY, dx = e.clientX - d.x;
      const now = performance.now(); const old = d.samples.find(([t]) => now - t <= 140) || d.samples[0];
      const speed = (old[1] - e.clientY) / Math.max(16, now - old[0]); // a felengedés előtti lendület (px/ms)
      ballImg.style.transform = '';
      if (dy < 60) return; // csak egy kis húzás – nem dobás
      if (!G.state.inventory[ball]) { toast('Ebből a labdából elfogyott.'); cycleBall(); return; }
      G.state.inventory[ball]--; updBall(); busy = true;
      const ringAtThrow = ringV;
      // találat: elég erős és nagyjából középre ment
      const tr = target.getBoundingClientRect(); const br = ballImg.getBoundingClientRect();
      const aimX = br.left + br.width / 2 + dx * (tr.top < br.top ? (br.top - (tr.top + tr.height / 2)) / Math.max(1, dy) : 1);
      const hit = speed > 0.25 && Math.abs(aimX - (tr.left + tr.width / 2)) < tr.width * 0.42;
      Sfx.play('throw');
      await flyBall(ballImg, hit ? { x: tr.left + tr.width / 2, y: tr.top + tr.height * 0.45 } : { x: aimX, y: tr.top - 40 });
      if (!hit) { msg.textContent = speed <= 0.25 ? 'Túl gyenge dobás!' : 'Mellé ment!'; Sfx.play('miss'); resetBall(); busy = false; return; }
      const q = throwQuality(ringAtThrow);
      if (q.name) { msg.textContent = q.name; msg.classList.add('pop'); setTimeout(() => msg.classList.remove('pop'), 900); }
      const r = goThrow(mon, ball, q.mult);
      monImg.classList.add('sucked'); Sfx.play('ball_open');
      for (let i = 0; i < r.shakes; i++) { await wait(380); Sfx.play('shake'); ballImg.classList.add('wob'); await wait(320); ballImg.classList.remove('wob'); }
      await wait(350);
      if (r.caught) {
        Sfx.play('catch'); msg.textContent = `Megvan! ${displayName(mon)} a tiéd!`; ballImg.classList.add('caught');
        await wait(1500); done('caught'); return;
      }
      Sfx.play('escape'); monImg.classList.remove('sucked'); msg.textContent = ['Kiugrott!', 'Majdnem!', 'Hajszálon múlt!', 'Hajszálon múlt!'][r.shakes];
      await wait(600);
      if (Math.random() < fleeChance(mon.species)) { msg.textContent = `${displayName(mon)} elszaladt...`; monImg.classList.add('flee'); Sfx.play('run'); await wait(1300); done('fled'); return; }
      resetBall(); busy = false;
      if (!balls.some(k => G.state.inventory[k] > 0)) { msg.textContent = 'Elfogyott a labdád!'; await wait(1200); done('run'); }
      else if (!G.state.inventory[ball]) cycleBall();
    });
    const resetBall = () => { ballImg.className = 'go-ball'; ballImg.style.cssText = ''; };
    function done(r) { cancelAnimationFrame(raf); wrap.remove(); resolve(r); }
  });
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));
function flyBall(img, to) {
  return new Promise((res) => {
    const r = img.getBoundingClientRect();
    img.style.position = 'fixed'; img.style.left = r.left + 'px'; img.style.top = r.top + 'px'; img.style.bottom = 'auto'; img.style.transform = 'none';
    img.style.transition = 'left .45s cubic-bezier(.3,.6,.4,1), top .45s cubic-bezier(.2,.9,.3,1), width .45s, height .45s';
    requestAnimationFrame(() => { img.style.left = (to.x - 24) + 'px'; img.style.top = (to.y - 24) + 'px'; img.style.width = '48px'; img.style.height = '48px'; });
    setTimeout(res, 470);
  });
}
