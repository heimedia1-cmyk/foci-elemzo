// Kapcsolat a szerverrel (WebSocket) a közös játékhoz. Magától újrakapcsolódik.
import { G } from './state.js';
import { Account } from './account.js';
import { wsUrl, isOnline } from './api.js';

const listeners = {};
let ws = null, sid = null, pid = null, retry = 0, queue = [];
try { sid = localStorage.getItem('mexiverse_sid'); } catch {}

export const Net = {
  party: null,          // { code, members: [...] }
  partner: null,        // { pid, name, gender, pos }
  get sid() { return pid; },   // nyilvános azonosító (a titkos sid sosem hagyja el ezt az eszközt)
  get pid() { return pid; },
  get online() { return ws?.readyState === 1; },
  on(t, fn) { (listeners[t] ||= []).push(fn); return () => { listeners[t] = listeners[t].filter(f => f !== fn); }; },
  send(msg) { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); else queue.push(msg); },
  connect() {
    if (window.MEXI_PREVIEW || ws) return;
    if (!isOnline()) { setTimeout(() => Net.connect(), 8000); return; }
    ws = new WebSocket(wsUrl());
    ws.onopen = () => {
      retry = 0;
      ws.send(JSON.stringify({ t: 'hello', sid, token: Account.current?.token || null, name: Account.current?.username || G.state?.player?.name || 'Kalandor', gender: G.state?.player?.gender }));
      for (const m of queue.splice(0)) ws.send(JSON.stringify(m));
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') { sid = m.sid; pid = m.pid; try { localStorage.setItem('mexiverse_sid', sid); } catch {} }
      if (m.t === 'party_state') {
        Net.party = m.code ? m : null;
        const other = m.members?.find(x => x.pid !== pid);
        Net.partner = other ? { ...(Net.partner || {}), ...other } : null;
      }
      if (m.t === 'partner_pos') Net.partner = { ...(Net.partner || {}), pid: m.pid, name: m.name, gender: m.gender, pos: m.pos };
      for (const fn of listeners[m.t] || []) fn(m);
      for (const fn of listeners['*'] || []) fn(m);
    };
    ws.onclose = () => { ws = null; setTimeout(() => Net.connect(), Math.min(10000, 1000 * 2 ** retry++)); };
  },
};
