// Android build előkészítése: a teljes játék helyi másolata a mobile-dist mappába,
// a Phaser és a Leaflet is helyben, az API pedig a Railway-szerverre mutat.
// Használat: node scripts/build-mobile.mjs [--api https://mexiverse.up.railway.app]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'mobile-dist');
const argApi = process.argv.indexOf('--api');
const API = argApi > 0 ? process.argv[argApi + 1] : 'https://mexiverse.up.railway.app';

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true, filter: (src) => !src.includes(path.join('public', 'app')) && !src.includes(path.join('assets', 'later')) });
fs.mkdirSync(path.join(out, 'vendor', 'leaflet'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/phaser/dist/phaser.min.js'), path.join(out, 'vendor/phaser.min.js'));
fs.cpSync(path.join(root, 'node_modules/leaflet/dist'), path.join(out, 'vendor/leaflet'), { recursive: true, filter: (s) => !s.endsWith('.map') && !/leaflet-src/.test(s) });
// natív (APK) verzió: csak akkor emeld, ha a frissítéshez új APK kell (új natív bővítmény stb.)
const NATIVE = 2;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(out, 'app-config.js'),
  `// Android app: helyi játékfájlok, online funkciók a Railway-szerveren.\nwindow.MEXI_API_BASE = ${JSON.stringify(API)};\nwindow.MEXI_APP = true;\nwindow.MEXI_BUILD = ${JSON.stringify(pkg.version + ' (' + new Date().toISOString().slice(0, 10) + ')')};\nwindow.MEXI_BUILD_ID = ${JSON.stringify(process.env.BUNDLE_VERSION || 'dev')};\nwindow.MEXI_NATIVE = ${NATIVE};\n`);
let files = 0, bytes = 0;
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else { files++; bytes += st.size; } } })(out);
console.log(`mobile-dist kész: ${files} fájl, ${(bytes / 1048576).toFixed(1)} MB, API: ${API}`);
