# MexiVerse – Az elveszett Mexik

Böngészős, felülnézetes gyűjtögetős RPG (Phaser 3 + Node/Express).

## Indítás
```
npm install
npm start        # http://localhost:3000
npm test         # logikai tesztek (harc, típusok, befogás, XP)
```
Railway: a `npm start` parancsot futtatja, a `PORT` változót automatikusan kezeli.

## Felépítés
- `public/src/data/` – Mexik, támadások, típusmátrix, tárgyak, térképek, beállítások (CONFIG)
- `public/src/systems/` – Mexi-példányok/XP/fejlődés, BattleEngine, CaptureSystem, mentés
- `public/src/scenes/` – Title, World (felfedezés), Battle (harc)
- `public/src/ui/` – menük (Mexidex, csapat, tároló, táska, bolt), párbeszéd, mobil vezérlés
- `public/src/art/` – ideiglenes, kódból rajzolt pixel grafika (a végleges sprite-lapok ezt cserélik)
- `server.js` – statikus szerver; később ide jön az online backend (profilok, Gym, Raid)
