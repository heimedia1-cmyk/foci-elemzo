// Szervercímek: böngészőben relatív (ugyanaz a szerver), az Android appban a Railway-szerver.
// Az app-config.js állítja be (a mobil buildben: window.MEXI_API_BASE = 'https://mexiverse.up.railway.app').
export const API_BASE = String(window.MEXI_API_BASE || '').replace(/\/$/, '');
export const IS_APP = !!(window.MEXI_APP || window.Capacitor?.isNativePlatform?.());
export const apiUrl = (p) => API_BASE + p;
export const wsUrl = () => (API_BASE ? API_BASE.replace(/^http/, 'ws') : (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host) + '/ws';
export const isOnline = () => navigator.onLine !== false;
/** Natív Capacitor bővítmény (vagy null böngészőben). */
export function plugin(name) {
  const C = window.Capacitor; if (!C?.isNativePlatform?.()) return null;
  return C.Plugins?.[name] || (C.registerPlugin ? C.registerPlugin(name) : null);
}
