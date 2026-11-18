import { apiUrl } from './api.js';
// Fiók: a Mexi Survivors / Anime Battlegrounds fiókja (ugyanaz a felhasználónév és jelszó).
// A MexiVerse-mentés a MexiVerse szerverén tárolódik a fiókhoz kötve.
const KEY = 'mexiverse_acct';

export const Account = {
  get current() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
  set current(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} },
  get loggedIn() { return !!this.current?.token; },
  headers(h = {}) { const a = this.current; if (a) h.Authorization = 'Bearer ' + a.token; return h; },

  async login(mode, username, password, email) {
    const body = mode === 'register' ? { username, password, email } : { username, password };
    let r;
    try { r = await fetch(apiUrl(mode === 'register' ? '/api/register' : '/api/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch { throw new Error('A szerver most nem érhető el. Próbáld újra később.'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.token) throw new Error(d.error || 'Nem sikerült belépni.');
    this.current = { token: d.token, username: d.username || username };
    return this.current;
  },

  async backups() {
    const r = await fetch(apiUrl('/api/save/backups'), { headers: this.headers() }).catch(() => null);
    return r?.ok ? (await r.json()).backups : null;
  },
  async restore(id) {
    const r = await fetch(apiUrl('/api/save/restore'), { method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ id }) }).catch(() => null);
    return r?.ok ? (await r.json()).save : null;
  },

  logout() {
    const h = this.headers();
    fetch(apiUrl('/api/logout'), { method: 'POST', headers: h }).catch(() => {});
    this.current = null;
  },

  /** Felhős mentés lekérése. null = nincs mentés; 'auth' = lejárt belépés; 'offline' = nem elérhető. */
  async fetchSave() {
    try {
      const r = await fetch(apiUrl('/api/save'), { headers: this.headers() });
      if (r.status === 401) return 'auth';
      if (!r.ok) return 'offline';
      return (await r.json()).save;
    } catch { return 'offline'; }
  },

  _timer: null, _pending: null,
  /** Mentés feltöltése (összevonva, hogy ne menjen túl sok kérés). */
  pushSave(state, immediate = false, force = false) {
    if (!this.loggedIn) return;
    this._pending = state;
    clearTimeout(this._timer);
    const go = () => {
      const s = this._pending; this._pending = null; if (!s) return;
      const body = JSON.stringify({ save: s, baseRev: Number.isFinite(s.rev) ? s.rev : null, force });
      fetch(apiUrl('/api/save'), { method: 'PUT', headers: this.headers({ 'Content-Type': 'application/json' }), body, keepalive: body.length < 60000 })
        .then(async (r) => {
          if (r.status === 401) return window.dispatchEvent(new Event('mexi-auth-expired'));
          const d = await r.json().catch(() => ({}));
          if (r.ok && Number.isFinite(d.rev)) window.dispatchEvent(new CustomEvent('mexi-save-rev', { detail: d.rev }));
          if (r.status === 409 && d.save) window.dispatchEvent(new CustomEvent('mexi-save-conflict', { detail: d.save }));
        })
        .catch(() => {});
    };
    if (immediate) go(); else this._timer = setTimeout(go, 1500);
  },
};
