// Főmenü.
import { el, UI, pushKeys } from '../ui/ui.js';
import { G, hasSave, load, newGameState, deleteSave, save, syncFromCloud, adoptGuestSave, guestSaveExists } from '../systems/state.js';
import { Account } from '../systems/account.js';
import { choose, toast } from '../ui/ui.js';
import { T } from '../art/placeholders.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    document.getElementById('touch').classList.add('hidden');
    document.getElementById('ui').innerHTML = '';
    while (UI.busy) UI.unlock();
    this.drawBackground();
    this.scale.on('resize', this.drawBackground, this);
    this.events.once('shutdown', () => { this.scale.off('resize', this.drawBackground, this); this.ui?.remove(); this.offKeys?.(); });
    this.showMenu();
    if (Account.loggedIn) syncFromCloud().then((r) => { if (r === 'auth') { Account.current = null; toast('Lejárt a belépésed, lépj be újra.'); } if (this.scene.isActive()) this.showMenu(); });
  }

  drawBackground() {
    this.children.removeAll(true);
    const { width: W, height: H } = this.scale;
    const z = Math.max(2, Math.round(Math.min(W, H) / 200));
    const cols = Math.ceil(W / (T * z)) + 1, rows = Math.ceil(H / (T * z)) + 1;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const pathRow = Math.floor(rows * 0.72);
      let f = 'grass' + ((x * 7 + y * 13) % 4);
      if (y === pathRow || y === pathRow + 1) f = 'path';
      else if (y < 2) f = 'tree';
      else if ((x * 31 + y * 17) % 23 === 0) f = 'flower0';
      else if ((x * 11 + y * 5) % 29 === 0) f = 'tall0';
      this.add.image(x * T * z, y * T * z, 'tiles', f).setOrigin(0).setScale(z);
    }
    this.add.rectangle(0, 0, W, H, 0x1b1430, 0.45).setOrigin(0);
    const py = Math.floor(rows * 0.72) * T * z + 2;
    const runners = ['alap', 'beka', 'mehecske', 'lang', 'kacsa', 'nindzsa'];
    runners.forEach((sp, i) => {
      const s = this.add.sprite(-60 - i * 70 * z / 3, py, 'mm_' + sp, 6).setOrigin(0).setScale(z);
      this.tweens.add({ targets: s, x: W + 60, duration: 9000 + i * 400, repeat: -1, delay: i * 500 });
      let fr = 0; this.time.addEvent({ delay: 160, loop: true, callback: () => { fr = (fr + 1) % 3; s.setFrame(6 + fr); } });
    });
  }

  showMenu() {
    this.ui?.remove();
    const root = document.getElementById('ui');
    const saveExists = hasSave();
    const btns = [];
    if (saveExists) btns.push(el('button', { class: 'btn primary', onclick: () => this.continueGame() }, '▶ Folytatás'));
    btns.push(el('button', { class: 'btn' + (saveExists ? '' : ' primary'), onclick: () => this.newGameForm() }, '✨ Új játék'));
    const acct = Account.current;
    const bar = acct
      ? el('div', { class: 'acctbar panel' }, el('span', {}, '👤 Belépve: ', el('b', {}, acct.username), ' • a mentésed a fiókodban van'),
          el('button', { class: 'btn', onclick: () => { Account.logout(); toast('Kijelentkeztél.'); this.showMenu(); } }, 'Kilépés'))
      : el('div', { class: 'acctbar panel' }, el('span', {}, 'Vendégként játszol (a mentés csak ezen az eszközön van)'),
          el('button', { class: 'btn primary', onclick: () => this.loginForm('login') }, 'Belépés / Regisztráció'));
    this.ui = el('div', { id: 'title' },
      el('h1', {}, 'Mexi', el('span', {}, 'Verse')),
      el('h3', {}, 'Az elveszett Mexik'),
      el('div', { class: 'btns' }, ...btns),
      bar,
      el('div', { class: 'ver' }, 'v0.1 – első játszható verzió'));
    root.append(this.ui);
    this.offKeys?.();
    this.offKeys = pushKeys((e) => { if (e.key === 'Enter') saveExists ? this.continueGame() : this.newGameForm(); });
  }

  loginForm(mode = 'login') {
    this.offKeys?.();
    this.ui?.remove();
    const user = el('input', { autocomplete: 'username', maxlength: 24 });
    const pass = el('input', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
    const email = el('input', { type: 'email', autocomplete: 'email' });
    const err = el('div', { style: 'color:#c03030;font-weight:700;min-height:20px' });
    const submit = el('button', { class: 'btn primary', style: 'flex:1' }, mode === 'login' ? 'Belépés' : 'Fiók létrehozása');
    const go = async () => {
      if (!user.value.trim() || !pass.value) { err.textContent = 'Add meg a felhasználónevet és a jelszót.'; return; }
      submit.disabled = true; err.textContent = '';
      try {
        await Account.login(mode, user.value.trim(), pass.value, email.value.trim());
        const r = await syncFromCloud();
        if (r === 'none' && guestSaveExists()) {
          const c = await choose(['Igen, hozd át', 'Nem, új játék lesz'], { question: 'Ezen az eszközön van egy vendégként elkezdett MexiVerse-játékod. Áthozod a fiókodba?', cancel: false });
          if (c === 0) adoptGuestSave();
        }
        if (r === 'offline') toast('A felhős mentés most nem érhető el, később szinkronizálunk.');
        toast(`Szia, ${Account.current.username}!`);
        this.showMenu();
      } catch (e) { err.textContent = e.message; submit.disabled = false; }
    };
    submit.onclick = go;
    for (const i of [user, pass, email]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    this.ui = el('div', { id: 'title' },
      el('div', { class: 'panel newgame' },
        el('div', { class: 'gpick' },
          el('button', { class: 'btn' + (mode === 'login' ? ' sel' : ''), onclick: () => this.loginForm('login') }, 'Belépés'),
          el('button', { class: 'btn' + (mode === 'register' ? ' sel' : ''), onclick: () => this.loginForm('register') }, 'Regisztráció')),
        el('p', { style: 'margin:0 0 8px;font-size:14px' }, 'A Mexi Survivors (és Anime Battlegrounds) fiókod itt is működik – ugyanazzal a névvel és jelszóval lépj be.'),
        el('label', { style: 'font-weight:700' }, 'Felhasználónév'), user,
        el('label', { style: 'font-weight:700' }, 'Jelszó'), pass,
        mode === 'register' ? el('label', { style: 'font-weight:700' }, 'E-mail (nem kötelező, jelszó-visszaállításhoz)') : null,
        mode === 'register' ? email : null,
        err,
        el('div', { style: 'display:flex;gap:8px' }, el('button', { class: 'btn', onclick: () => this.showMenu() }, 'Vissza'), submit)));
    document.getElementById('ui').append(this.ui);
    setTimeout(() => user.focus(), 50);
  }

  async continueGame() {
    if (Account.loggedIn) { const r = await syncFromCloud(); if (r === 'auth') { toast('Lejárt a belépésed, lépj be újra.'); this.loginForm('login'); return; } }
    if (!load()) { this.newGameForm(); return; }
    this.offKeys?.();
    this.scene.start('World');
  }

  newGameForm() {
    this.offKeys?.();
    this.ui?.remove();
    let gender = 'fiu';
    const input = el('input', { maxlength: 12, value: 'Kalandor' });
    const gb = (g, t) => el('button', { class: 'btn' + (g === gender ? ' sel' : ''), onclick: (e) => { gender = g; [...e.target.parentNode.children].forEach(b => b.classList.remove('sel')); e.target.classList.add('sel'); } }, t);
    const start = () => {
      if (hasSave() && !confirm('Van már mentésed. Biztosan új játékot kezdesz? A régi mentés törlődik.')) return;
      deleteSave();
      G.state = newGameState(input.value.trim() || 'Kalandor', gender);
      G.state.flags.intro = false;
      save();
      this.offKeys?.();
      this.scene.start('World');
    };
    this.ui = el('div', { id: 'title' },
      el('div', { class: 'panel newgame' },
        el('h2', { style: 'margin:0 0 8px' }, 'Új kaland'),
        el('label', { style: 'font-weight:700' }, 'Hogy hívnak?'), input,
        el('div', { style: 'font-weight:700' }, 'Karakter:'),
        el('div', { class: 'gpick' }, gb('fiu', '🧢 Fiú'), gb('lany', '🎀 Lány')),
        el('div', { style: 'display:flex;gap:8px' },
          el('button', { class: 'btn', onclick: () => this.showMenu() }, 'Vissza'),
          el('button', { class: 'btn primary', style: 'flex:1', onclick: start }, 'Indulás!'))));
    document.getElementById('ui').append(this.ui);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
    setTimeout(() => input.focus(), 50);
  }
}
