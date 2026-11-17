// Időjárás: térképenként és naponta (valós dátum szerint) egy állandó időjárás.
// Hatással van a vad Mexikre (pl. esőben több vízi Mexi, ködben Szellem Mexi).
export const WEATHER = {
  clear: { name: 'Derült', icon: '☀️' },
  rain:  { name: 'Eső',    icon: '🌧️' },
  fog:   { name: 'Köd',    icon: '🌫️' },
  wind:  { name: 'Szeles', icon: '🍂' },
  snow:  { name: 'Havazás', icon: '❄️' },
};

function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

export function getWeather(mapKey, interior, d = new Date()) {
  if (interior) return 'clear';
  if (typeof window !== 'undefined' && window.MEXI_FORCE_WEATHER) return window.MEXI_FORCE_WEATHER;
  // 6 óránként változik
  const slot = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${Math.floor(d.getHours() / 6)}`;
  const r = hash(mapKey + slot);
  const winter = [11, 0, 1].includes(d.getMonth());
  if (winter && r < 0.18) return 'snow';
  if (r < 0.55) return 'clear';
  if (r < 0.75) return 'rain';
  if (r < 0.88) return 'fog';
  return 'wind';
}

/** A találkozási táblázat módosítása az időjárás szerint. */
export function weatherTable(table, weather) {
  const t = table.map(([sp, w]) => [sp, w]);
  const mul = (sp, f) => { for (const e of t) if (e[0] === sp) e[1] *= f; };
  const add = (sp, w) => { if (!t.some(e => e[0] === sp)) t.push([sp, w]); };
  if (weather === 'rain') { mul('beka', 2); mul('kacsa', 2); mul('lang', 0.3); }
  if (weather === 'fog') { add('szellem', 10); mul('nindzsa', 1.5); }
  if (weather === 'snow') { add('jeg', 10); mul('lang', 0.3); }
  if (weather === 'wind') { mul('mehecske', 1.6); }
  return t;
}
