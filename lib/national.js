// Válogatott-modell: ingyenes nyilvános adatbázis (martj42/international_results, GitHub)
// Dixon–Coles csapaterősség, időbeli súlyozás, semleges pálya kezelése, barátságos meccsek kisebb súllyal.
const fs = require('fs');
const { fitStrengths, scoreMatrix, markets } = require('./model');

const URL = 'https://raw.githubusercontent.com/martj42/international_results/master/results.csv';
const TTL = 6 * 60 * 60 * 1000;
const DAY = 86400000;
let cache = null;

// hangolva 1 275 tétmeccsen (2025-01 – 2026-10, walk-forward): log-loss 0.819, 1X2 találat 63,5%
const NCFG = { xi: 0.0004, years: 8, friendly: 0.9, ridge: 0.35 };

// Tippmix (magyar) -> adatbázis (angol) nevek
const HU = {
  'Afganisztán': 'Afghanistan', 'Albánia': 'Albania', 'Algéria': 'Algeria', 'Andorra': 'Andorra', 'Angola': 'Angola', 'Anguilla': 'Anguilla',
  'Antigua és Barbuda': 'Antigua and Barbuda', 'Antigua': 'Antigua and Barbuda', 'Argentína': 'Argentina', 'Örményország': 'Armenia', 'Aruba': 'Aruba',
  'Ausztrália': 'Australia', 'Ausztria': 'Austria', 'Azerbajdzsán': 'Azerbaijan', 'Bahama-szigetek': 'Bahamas', 'Bahamák': 'Bahamas', 'Bahrein': 'Bahrain',
  'Banglades': 'Bangladesh', 'Barbados': 'Barbados', 'Fehéroroszország': 'Belarus', 'Belarusz': 'Belarus', 'Belgium': 'Belgium', 'Belize': 'Belize',
  'Benin': 'Benin', 'Bermuda': 'Bermuda', 'Bhután': 'Bhutan', 'Bolívia': 'Bolivia', 'Bosznia-Hercegovina': 'Bosnia and Herzegovina', 'Bosznia': 'Bosnia and Herzegovina',
  'Botswana': 'Botswana', 'Brazília': 'Brazil', 'Brit Virgin-szigetek': 'British Virgin Islands', 'Brunei': 'Brunei', 'Bulgária': 'Bulgaria',
  'Burkina Faso': 'Burkina Faso', 'Burundi': 'Burundi', 'Kambodzsa': 'Cambodia', 'Kamerun': 'Cameroon', 'Kanada': 'Canada', 'Zöld-foki-szigetek': 'Cape Verde',
  'Zöldfoki-szigetek': 'Cape Verde', 'Kajmán-szigetek': 'Cayman Islands', 'Közép-afrikai Köztársaság': 'Central African Republic', 'Csád': 'Chad', 'Chile': 'Chile',
  'Kína': 'China', 'Kolumbia': 'Colombia', 'Comore-szigetek': 'Comoros', 'Kongó': 'Congo', 'Kongói Köztársaság': 'Congo', 'Kongói DK': 'DR Congo', 'KDK': 'DR Congo',
  'Kongói Demokratikus Köztársaság': 'DR Congo', 'Cook-szigetek': 'Cook Islands', 'Costa Rica': 'Costa Rica', 'Horvátország': 'Croatia', 'Kuba': 'Cuba',
  'Curacao': 'Curaçao', 'Curaçao': 'Curaçao', 'Ciprus': 'Cyprus', 'Csehország': 'Czech Republic', 'Dánia': 'Denmark', 'Dzsibuti': 'Djibouti', 'Dominika': 'Dominica',
  'Dominikai Köztársaság': 'Dominican Republic', 'Ecuador': 'Ecuador', 'Egyiptom': 'Egypt', 'Salvador': 'El Salvador', 'El Salvador': 'El Salvador', 'Anglia': 'England',
  'Egyenlítői-Guinea': 'Equatorial Guinea', 'Eritrea': 'Eritrea', 'Észtország': 'Estonia', 'Szváziföld': 'Eswatini', 'Eswatini': 'Eswatini', 'Etiópia': 'Ethiopia',
  'Feröer-szigetek': 'Faroe Islands', 'Feröer': 'Faroe Islands', 'Fidzsi-szigetek': 'Fiji', 'Finnország': 'Finland', 'Franciaország': 'France', 'Gabon': 'Gabon',
  'Gambia': 'Gambia', 'Grúzia': 'Georgia', 'Németország': 'Germany', 'Ghána': 'Ghana', 'Gibraltár': 'Gibraltar', 'Görögország': 'Greece', 'Grenada': 'Grenada',
  'Guatemala': 'Guatemala', 'Guinea': 'Guinea', 'Bissau-Guinea': 'Guinea-Bissau', 'Guinea-Bissau': 'Guinea-Bissau', 'Guyana': 'Guyana', 'Haiti': 'Haiti',
  'Honduras': 'Honduras', 'Hongkong': 'Hong Kong', 'Magyarország': 'Hungary', 'Izland': 'Iceland', 'India': 'India', 'Indonézia': 'Indonesia', 'Irán': 'Iran',
  'Irak': 'Iraq', 'Izrael': 'Israel', 'Olaszország': 'Italy', 'Elefántcsontpart': 'Ivory Coast', 'Jamaica': 'Jamaica', 'Japán': 'Japan', 'Jordánia': 'Jordan',
  'Kazahsztán': 'Kazakhstan', 'Kenya': 'Kenya', 'Koszovó': 'Kosovo', 'Kuvait': 'Kuwait', 'Kirgizisztán': 'Kyrgyzstan', 'Laosz': 'Laos', 'Lettország': 'Latvia',
  'Libanon': 'Lebanon', 'Lesotho': 'Lesotho', 'Libéria': 'Liberia', 'Líbia': 'Libya', 'Liechtenstein': 'Liechtenstein', 'Litvánia': 'Lithuania',
  'Luxemburg': 'Luxembourg', 'Makaó': 'Macau', 'Madagaszkár': 'Madagascar', 'Malawi': 'Malawi', 'Malajzia': 'Malaysia', 'Maldív-szigetek': 'Maldives',
  'Mali': 'Mali', 'Málta': 'Malta', 'Mauritánia': 'Mauritania', 'Mauritius': 'Mauritius', 'Mexikó': 'Mexico', 'Moldova': 'Moldova', 'Moldávia': 'Moldova',
  'Mongólia': 'Mongolia', 'Montenegró': 'Montenegro', 'Montserrat': 'Montserrat', 'Marokkó': 'Morocco', 'Mozambik': 'Mozambique', 'Mianmar': 'Myanmar',
  'Namíbia': 'Namibia', 'Nepál': 'Nepal', 'Hollandia': 'Netherlands', 'Új-Kaledónia': 'New Caledonia', 'Új-Zéland': 'New Zealand', 'Nicaragua': 'Nicaragua',
  'Niger': 'Niger', 'Nigéria': 'Nigeria', 'Észak-Korea': 'North Korea', 'Észak-Macedónia': 'North Macedonia', 'Észak-Írország': 'Northern Ireland',
  'Norvégia': 'Norway', 'Omán': 'Oman', 'Pakisztán': 'Pakistan', 'Palesztina': 'Palestine', 'Panama': 'Panama', 'Pápua Új-Guinea': 'Papua New Guinea',
  'Paraguay': 'Paraguay', 'Peru': 'Peru', 'Fülöp-szigetek': 'Philippines', 'Lengyelország': 'Poland', 'Portugália': 'Portugal', 'Puerto Rico': 'Puerto Rico',
  'Katar': 'Qatar', 'Írország': 'Republic of Ireland', 'Románia': 'Romania', 'Oroszország': 'Russia', 'Ruanda': 'Rwanda', 'Saint Kitts és Nevis': 'Saint Kitts and Nevis',
  'Saint Lucia': 'Saint Lucia', 'Saint Vincent és a Grenadine-szigetek': 'Saint Vincent and the Grenadines', 'Saint Vincent': 'Saint Vincent and the Grenadines',
  'Szamoa': 'Samoa', 'San Marino': 'San Marino', 'Szaúd-Arábia': 'Saudi Arabia', 'Skócia': 'Scotland', 'Szenegál': 'Senegal', 'Szerbia': 'Serbia',
  'Seychelle-szigetek': 'Seychelles', 'Sierra Leone': 'Sierra Leone', 'Szingapúr': 'Singapore', 'Szlovákia': 'Slovakia', 'Szlovénia': 'Slovenia',
  'Salamon-szigetek': 'Solomon Islands', 'Szomália': 'Somalia', 'Dél-Afrika': 'South Africa', 'Dél-afrikai Köztársaság': 'South Africa', 'Dél-Korea': 'South Korea',
  'Dél-Szudán': 'South Sudan', 'Spanyolország': 'Spain', 'Srí Lanka': 'Sri Lanka', 'Szudán': 'Sudan', 'Suriname': 'Suriname', 'Svédország': 'Sweden',
  'Svájc': 'Switzerland', 'Szíria': 'Syria', 'Tahiti': 'Tahiti', 'Tajvan': 'Taiwan', 'Tádzsikisztán': 'Tajikistan', 'Tanzánia': 'Tanzania', 'Thaiföld': 'Thailand',
  'Kelet-Timor': 'Timor-Leste', 'Togo': 'Togo', 'Tonga': 'Tonga', 'Trinidad és Tobago': 'Trinidad and Tobago', 'Tunézia': 'Tunisia', 'Törökország': 'Turkey',
  'Türkmenisztán': 'Turkmenistan', 'Turks- és Caicos-szigetek': 'Turks and Caicos Islands', 'Uganda': 'Uganda', 'Ukrajna': 'Ukraine',
  'Egyesült Arab Emírségek': 'United Arab Emirates', 'EAE': 'United Arab Emirates', 'USA': 'United States', 'Egyesült Államok': 'United States',
  'Amerikai Virgin-szigetek': 'United States Virgin Islands', 'Uruguay': 'Uruguay', 'Üzbegisztán': 'Uzbekistan', 'Vanuatu': 'Vanuatu', 'Venezuela': 'Venezuela',
  'Vietnam': 'Vietnam', 'Wales': 'Wales', 'Jemen': 'Yemen', 'Zambia': 'Zambia', 'Zimbabwe': 'Zimbabwe', 'Sao Tomé és Príncipe': 'São Tomé and Príncipe',
  'São Tomé és Príncipe': 'São Tomé and Príncipe', 'Guam': 'Guam', 'Guadeloupe': 'Guadeloupe', 'Martinique': 'Martinique', 'Francia Guyana': 'French Guiana',
  'Saint Martin': 'Saint Martin', 'Sint Maarten': 'Sint Maarten', 'Bonaire': 'Bonaire', 'Grönland': 'Greenland',
};
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const HUN = Object.fromEntries(Object.entries(HU).map(([k, v]) => [norm(k), v]));

function toEn(name, teams) {
  const n = name.trim();
  if (HU[n]) return HU[n];
  if (HUN[norm(n)]) return HUN[norm(n)];
  if (teams && teams.has(n)) return n; // már angol
  return null;
}

// Válogatott-e a Tippmix esemény (felnőtt férfi)?
function isSeniorNational(league) {
  if (/U\s?\d{2}|női|futsal|strand|olimpi/i.test(league)) return false;
  return /Nemzetek Lig|Válogatott|selejt|Világbajnok|VB|Európa-bajnok|Eb-|Nemzetek Kupája|Gold Cup|Copa Am|Ázsia-kupa|Arab Kupa|Golf-kupa|CONCACAF|NL \(/i.test(league);
}

async function load() {
  if (cache && Date.now() - cache.t < TTL) return cache.rows;
  let text = null;
  if (process.env.NAT_LOCAL) text = fs.readFileSync(process.env.NAT_LOCAL, 'utf8');
  else {
    try { const r = await fetch(URL); if (r.ok) text = await r.text(); } catch (e) { /* hálózati hiba */ }
  }
  if (!text) return cache ? cache.rows : [];
  const lines = text.split(/\r?\n/).slice(1);
  const rows = [];
  for (const l of lines) {
    const c = l.split(',');
    if (c.length < 9 || c[3] === 'NA' || c[3] === '') continue;
    rows.push({ date: c[0], home: c[1], away: c[2], hg: +c[3], ag: +c[4], tournament: c[5], neutral: c[c.length - 1] === 'TRUE', played: true });
  }
  cache = { t: Date.now(), rows };
  return rows;
}

const models = new Map();
async function modelFor(date, cfg = NCFG) {
  const key = `${date}|${JSON.stringify(cfg)}`;
  if (models.has(key)) return models.get(key);
  const rows = await load();
  const t0 = Date.parse(date), from = t0 - cfg.years * 365 * DAY;
  const past = rows.filter(r => { const t = Date.parse(r.date); return t < t0 && t >= from; });
  if (past.length < 200) return null;
  const fit = fitStrengths(past.map(r => ({
    home: r.home, away: r.away, x: r.hg, y: r.ag, hf: r.neutral ? 0 : 1,
    w: Math.exp(-cfg.xi * (t0 - Date.parse(r.date)) / DAY) * (r.tournament === 'Friendly' ? cfg.friendly : 1),
  })), { useTau: true, ridge: cfg.ridge, iters: 600 });
  const m = { fit, past, teams: new Set(past.flatMap(r => [r.home, r.away])) };
  models.set(key, m);
  if (models.size > 30) models.delete(models.keys().next().value);
  return m;
}

async function predict(homeHu, awayHu, date, neutral = false) {
  const m = await modelFor(date);
  if (!m) return null;
  const h = toEn(homeHu, m.teams), a = toEn(awayHu, m.teams);
  if (!h || !a) return null;
  const p = m.fit.predict(h, a, neutral ? 0 : 1);
  if (!p) return null;
  const nH = m.past.filter(r => r.home === h || r.away === h).length, nA = m.past.filter(r => r.home === a || r.away === a).length;
  if (nH < 8 || nA < 8) return null; // túl kevés meccs -> megbízhatatlan
  return { l: p.l, m: p.m, rho: m.fit.rho, homeEn: h, awayEn: a, model: m };
}

// Visszamérés: havonta újraillesztve, csak múltbeli adatokkal
async function backtest(from = '2025-01-01', to = '2026-10-31', cfg = NCFG) {
  const rows = await load();
  let n = 0, ll = 0, hit = 0, llBase = 0, br = 0;
  const base = { h: 0.47, d: 0.23, a: 0.30 };
  for (let t = Date.parse(from); t < Date.parse(to); t += 30 * DAY) {
    const d0 = new Date(t).toISOString().slice(0, 10), d1 = new Date(t + 30 * DAY).toISOString().slice(0, 10);
    const m = await modelFor(d0, cfg);
    if (!m) continue;
    for (const r of rows.filter(r => r.date >= d0 && r.date < d1 && r.tournament !== 'Friendly')) {
      const p = m.fit.predict(r.home, r.away, r.neutral ? 0 : 1);
      if (!p) continue;
      const cnt = t2 => m.past.filter(x => x.home === t2 || x.away === t2).length;
      if (cnt(r.home) < 8 || cnt(r.away) < 8) continue;
      const k = markets(scoreMatrix(p.l, p.m, m.fit.rho));
      const res = r.hg > r.ag ? 'h' : r.hg === r.ag ? 'd' : 'a';
      n++; ll -= Math.log(k.x12[res]); llBase -= Math.log(base[res]);
      if (['h', 'd', 'a'].sort((x, y) => k.x12[y] - k.x12[x])[0] === res) hit++;
      br += ['h', 'd', 'a'].reduce((s, o) => s + (k.x12[o] - (o === res ? 1 : 0)) ** 2, 0);
    }
  }
  return { n, logloss: ll / n, base: llBase / n, hit: hit / n, brier: br / n };
}

module.exports = { predict, isSeniorNational, toEn, backtest, modelFor, load, NCFG, HU };
