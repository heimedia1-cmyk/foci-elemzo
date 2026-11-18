# MexiVerse – Visual Update 1.0: vizuális audit és képgenerálási terv

Készült: 2026-11-18 · Alap: `mexiverse` ág, 4745cf4
Ebben a körben **semmi nem módosult** a grafikán vagy a játékkódon: ez csak felmérés, sorrend és képlista.

---

## 0. Röviden: mit gondolok a ChatGPT-tervről

**Amiben egyetértek:**
- A sorrend jó: előbb élet a világban és a harcban, utána a menük.
- Csak a meglévő területekre készüljön terv.
- Minden menjen a tesztágra, és minden animáció legyen kikapcsolható.

**Amiben mást javaslok:**

1. **A legtöbb animációhoz nem kell új kép, elég a kód.**
   - A ChatGPT képgenerátora nem tud pixelpontosan egyforma képkockákat rajzolni. Egy 8 kockás „levegővétel” vagy „pislogás” sorozatban a kutya minden kockán kicsit más lesz: más a szín, a vonal, a méret. Ettől remegni fog.
   - Ezért a légzés, lebegés, belépés, visszahívás, sérülés-villanás, ájulás-lecsúszás, győzelmi ugrás, kritikus találat, szintlépés és státuszhatások mind kódból menjenek. A meglévő képet mozgatjuk, nyújtjuk és színezzük. Ez nem nő az APK méretén, és nem lesz szétcsúszó stílus.
   - Új képet csak ott kérünk, ahol új testtartás kell, és azt kód nem tudja kitalálni: térképes séta, ülés, támadó póz.
2. **A legnagyobb vizuális hiba nem a harcban van, hanem a térképen.**
   - A 36 új Mexi térképes (követő) sprite-ja a harci képből van lekicsinyítve. Elmosódott, minden irányból ugyanaz a kép, csak tükrözve.
   - A 3 fejlett forma (Mocsárkirály, Méhkirálynő, Árnyékmester) csak átszínezett alapforma.
   - Mivel a követő Mexi mindig látszik, ez a P0.
3. **A fény, árnyék, napszak, víz és tűz kódból jobb, mint képből.**
   - Lámpafény, lágy árnyék a lábak alatt, csillogó víz, pislákoló fáklya, szentjánosbogár, eső: mind előállítható néhány pixeles kódrajzzal. Nem kell rájuk generált kép.
4. **Kevesebb, de nagyobb képet kérjünk.**
   - Egy képre 4 Mexi kerüljön, rácsban.
   - A képeket mi vágjuk szét, és mi kicsinyítjük le pontosan 32 px-re. Ezt eszköz csinálja (legközelebbi szomszéd, palettára igazítás), nem kézzel.
   - Így a teljes P0+P1 csomag **12 kép** a sokszáz helyett.
5. **Minden prompthoz csatoljunk referenciaképet.** Szöveg alapján a ChatGPT eltér a stílustól, referenciával sokkal pontosabb.

**Ami a tervből most nem kell:**
- Mexi-tó/Mocsár, Neonváros, Japán Szentély, Sárkányhegy és Holdmancs-aréna még nem létezik játszható területként.
  - Ezekhez most nem készül kép.
  - A harci háttereik (bg_swamp, bg_neon, bg_shrine, bg_volcano) már megvannak, tartaléknak.
- 8+ kockás harci idle-, pislogás- és farokcsóválás-sorozatok fajonként. Ez 47 fajnál több száz kép lenne, és a fenti remegés miatt rosszabb eredményt adna, mint a kódos megoldás.

---

## 1. Meglévő asset-leltár

Összesen ~29 MB a `public/assets` mappa. A `later/` mappa (2,3 MB) nem kerül az APK-ba.

| Csoport | Mennyiség | Állapot | Megjegyzés |
|---|---|---|---|
| Csempék (tiles, fringe, itiles) | 3 lap | ✅ használt | víz: 2 kockás csere, 650 ms |
| Épületek b_* | 8 | ✅ használt | **b_gym, b_temple helyőrző jellegű** |
| Kellékek p_* | 30 | 24 használt, 6 nem | nem használt: fence_v, fence_c, mailbox, chest_open, secretwall, pondisle |
| Bútorok/puzzle f_* | 149 | ~80 használt | ~65 csak a jövőbeli aréna/puzzle-hez (ajtók, kapcsolók, nyilak, jég, teleport). **Mind betöltődik induláskor** → csak kódjavítás kell (lusta betöltés) |
| Játékos/NPC lap | player.png, npcs.png | ✅ | Edző3/4/5 csak átszínezett sprite → **új kép kell (P2)** |
| Mexi harci kép, régi 12 faj | mexi_front/back + anim_a/b | ✅ | támadó/győzelmi póz megvan |
| Mexi harci kép, új 36 faj | `mexi/*_f`, `*_b` (192 px) | ✅ | a hátnézet a többi faj 1-2 helyén tükrözés |
| Sérült/ájult pózok | 39 faj `_hurt`, `_faint` | ✅ | a 12 régi fajnál kód teszi rá |
| Támadó/győzelmi póz, új 36 faj | – | ⚠️ kódból (eltolás, nyújtás) | elfogadható; P2-ben lehet kép |
| **Térképes Mexi (követő)**, régi 12 | mexi_map.png 3×4 kocka | ✅ | jó |
| **Térképes Mexi, új 36 + 3 fejlett** | – | ❌ lekicsinyített/átszínezett | **P0: új kép kell** (a 33 megszerezhetőnek) |
| Fejlődött térképes alakok | mexi_evo.png | ✅ | |
| Harci hátterek | 10 jpg | 4 használt + 2 éjszakai | swamp/neon/shrine/volcano tartalék |
| Harci talapzatok | 16 | ✅ | |
| Harci effektek (fx_*, hit, crit, heal, lvl, up/down, st_*, c_*) | ~95 | ✅ | elég; csak kódos időzítés kell |
| UI (keret, ikonok, menüikonok, emo_*, ia_*) | 114 | ✅ | emo_* és ia_* megvan a követőhöz |
| Időjárás w_* | 13 | ✅ | |
| Címkép title.jpg | 1 | ✅ | |
| later/ (areas, badges, raidbosses) | 3 | ⏸ nem használt | nem kerül az APK-ba |

**Hibás asset nincs**: minden betöltött fájl létezik és megfelelő méretű.
**Újragenerálandó**: csak a térképes Mexik (36 faj) és az Edző3/4/5.

---

## 2. Audit területenként

### 2.1 Világ élénksége

| Elem | Most | Javaslat | Kell kép? |
|---|---|---|---|
| Víz | 2 kockás csere | + véletlen csillanás pixelek, part menti hab (kód) | nem |
| Fű | lépéskor zizzen | + szélben enyhe ringás csoportosan (kód, ritka frissítés) | nem |
| Fák | állók | lombkorona lassú ringása (2 px, kód) | nem |
| Tűz/fáklya | statikus kép | pislákolás: méret/fény ingadozás (kód) | nem |
| Füst (kémény) | nincs | 3-4 szürke pixelfelhő felszáll, elhalványul (kód) | nem |
| Lámpák | statikus | éjjel meleg fénykör alatta (kódból rajzolt gradiens) | nem |
| Kristályok (barlang) | statikus | lassú fényesedés/csillanás (kód) | nem |
| Szentjánosbogár | van (w_fireflies) | éjjel erdőben gyakrabban | nem |
| Időjárás | eső, hó, köd, szél, napsugár | jó; esőnél tócsa-gyűrű már van | nem |
| Napszak | egyszínű sötétítő réteg | + lámpák, ablakok éjjel világítanak (kód) | nem |
| Árnyék | nincs | lágy ovális árnyék minden karakter és Mexi alatt (kód) | nem |
| Textúrák | rendben | – | nem |
| NPC-k | sétálnak, néznek | + véletlen „körülnéz” és ritka emote-buborék (meglévő emo_*) | nem |

### 2.2 Harci animációk

| Animáció | Most | Javaslat | Kép? |
|---|---|---|---|
| Idle / légzés | **nincs** (áll a kép) | lassú függőleges nyújtás 2%, 1,6 s ciklus (kód) – **P0** | nem |
| Pislogás | nincs | kihagyjuk: fajonként csukott szemes kép kellene, kockánként eltérne | – |
| Farokcsóválás | nincs | kihagyjuk (külön test- és farokréteg kellene) | – |
| Belépés | becsúszik | + fehér villanásból kiszínesedés, kis porfelhő (kód) | nem |
| Visszahívás | eltűnik | összezsugorodás fénysugárral (c_beam már van) | nem |
| Támadás | előre lökés + nyújtás | + támadó póz a régi 12-nél megvan; újaknál P2 kép | P2 |
| Sérülés | villog + rázás + hurt póz | jó; + piros villanás (tint) | nem |
| Ájulás | faint póz + leesés | + lassú lecsúszás és elhalványulás | nem |
| Győzelem | ugrálás | jó | nem |
| Elkapás | teljes (c_* effektek) | jó | nem |
| Státusz | ikon + st_* effekt | + körönkénti rövid ismétlés (pl. zzz alváskor) | nem |
| Kritikus | crit képek + rázás | jó | nem |
| Szintlépés | lvl effekt | + fényoszlop, „+” számok felúsznak | nem |
| Fejlődés | villanás + c_evo | + sziluett-váltogatás (fehér tint) lassuló → gyorsuló | nem |

### 2.3 Harci képernyő
- Talapzatok és hátterek rendben vannak.
- Javaslat (kód): HP-csík színváltás animálva, sebzésszám felúszik, éjszakai háttér az erdőn kívül is.

### 2.4 Menük
- Egységes keret és ikonok megvannak.
- Javaslat (kód): ablaknyitáskor 120 ms-os felugrás, kijelölt gomb finom pulzálása, csapatlistában a Mexi-ikon kis ugrálása.

### 2.5 Területek hangulata (csak a létezők)

| Terület | Hangulat | Kódos kiegészítés |
|---|---|---|
| Mancsfalva | meleg, otthonos | kéményfüst, éjjel ablakfény, lámpafény |
| Mexi-ösvény | napos, nyitott | fűringás, vízcsillanás, pillangók (pixel) |
| Titokzatos Erdő | sejtelmes | gyakoribb köd, szentjánosbogár, lombárnyék foltok |
| Kristálybarlang | hideg, rejtélyes | kristálycsillanás, csepegő víz (w_drop), fáklyafény |
| Belső terek | barátságos | kandalló pislákol, gyógyítógép fény |

**Nem létező területek** (most nincs terv): Mexi-tó/Mocsár, Neonváros, Japán Szentély, Sárkányhegy, Holdmancs-aréna. Az Aréna épülete (b_gym) és a Templom (b_temple) helyőrző → P2.

### 2.6 Követő Mexi terve

| Viselkedés | Most | Javaslat | Kép? |
|---|---|---|---|
| Követés | van, 4 irány | jó sprite kell → **P0 kép** | igen |
| Megállás | áll | 3 s után körülnéz (balra-jobbra fordul, kód) | nem |
| Ülés | nincs | 8 s tétlenség után leül → **P1 kép** (ülő póz, lefelé néző) | igen |
| Alvás | van (ia_sleep) | jó | nem |
| Öröm | ia_happy | jó | nem |
| Simogatás | ia_pet | jó | nem |
| Érzelem-buborék | emo_* megvan | HP < 25%: verejték; shiny: csillag; fű mellett: „!” (kód) | nem |

---

## 3. Prioritási sorrend

### P0 – azonnal, a legnagyobb látható nyereség
1. **Térképes Mexi sprite-ok** a 33 megszerezhető új + 3 fejlett fajhoz (**9 kép**). A 4 legendás kimarad: nem szerezhető meg, így követő sem lehet.
2. Harci légzés-idle, belépő/visszahívó effekt, ájulás-lecsúszás (csak kód).
3. Karakterárnyékok és a követő „körülnéz” viselkedése (csak kód).
4. A ~65 nem használt f_* bútor lusta betöltése: gyorsabb indulás, kód.

### P1 – második kör
5. Ülő követő póz mind a 47 megszerezhető fajhoz (**3 kép**, 16 faj/kép).
6. Világélet kódból: víz, fa, füst, lámpa, kristály, fáklya.
7. Menük mikroanimációi, sebzésszámok.

### P2 – később
8. Támadó + győzelmi póz a 33 megszerezhető új fajhoz (**9 kép**, 4 faj/kép).
9. Új Edző3/4/5 sprite-lapok (**1 kép**).
10. Aréna- és templomépület végleges képe (**1 kép**), amikor az aréna készül.

**Összesen:** P0 9 kép · P1 3 kép · P2 11 kép.

**Teljesítmény:**
- Minden kódos animáció egy „Animációk: teljes / csökkentett / ki” kapcsolóra kerül a beállításokban.
- Csökkentett módban nincs fűringás, füst, csillanás.
- Az új képek után az APK becsült növekedése: P0 kb. +0,3 MB (36 db 96×128 px sprite-lap, PNG, palettázva).

---

## 4. Képgenerálási feladatlista (ChatGPT-nek)

### Általános szabályok (minden képhez másold be)
```
Stílus: 16-bites pixel art, Pokémon FireRed / LeafGreen hangulat, tiszta 1 px sötét körvonal,
korlátozott paletta (kb. 16–24 szín fajonként), lapos árnyalás 2–3 tónussal, nincs elmosás,
nincs gradiens, nincs anti-aliasing, nincs szöveg, nincs vízjel, nincs háttér (átlátszó PNG).
Minden figura ugyanakkora léptékű, a cellák közepén áll, a cellák között legalább 24 px üres hely.
A figurák Yorkshire terrier („Mexi”) változatok – ugyanaz a fajta, ugyanaz a jellegzetes
yorki arc és szőrzet, csak a ruha/szín/elem tér el. A csatolt referenciakép stílusát kövesd.
Tilos: valódi Pokémon, logó, más ismert karakter, szöveg, keret, rácsvonal, árnyék a háttéren.
```
**Referencia:** csatold a `public/assets/mexi_map.png` képet (térképes stílus), és az érintett fajok `public/assets/mexi/<faj>_f.png` harci képét (kinézet).

**Feldolgozás nálunk:**
- A képet szétvágjuk.
- Minden figurát 32×32 px-re kicsinyítünk legközelebbi-szomszéd módszerrel, majd palettára igazítjuk.
- A jobbra néző irányt a balra nézőből tükrözéssel készítjük. A második lépéskockát az elsőből tükrözzük (le/fel irányban).

### P0 – Térképes Mexi sprite-lapok (9 kép)
- **Fájlnév:** `map_mexi_01.png` … `map_mexi_09.png`
- **Képméret:** 1536×1024, átlátszó háttér
- **Rács:** 6 oszlop × 4 sor, cellánként 256×256. **1 sor = 1 faj.**
- **Oszlopok sorrendje:**
  1. lefelé néz, áll
  2. lefelé néz, lép
  3. balra néz, áll
  4. balra néz, lép
  5. felfelé néz (hátulról), áll
  6. felfelé néz, lép
- **Nézet:** felülről-elölről (3/4 top-down), mint a Pokémon követő Pokémonok. Kicsi, zömök, nagy fej (chibi arány, fej ≈ test 45%-a).
- **Végső sprite-méret:** 32×32, a figura kb. 24–28 px magas.
- **Fajok képenként (4/kép):**
  1. szikra, viharfarkas, virag, rozsakert
  2. kaloz, kalozkapitany, vulkan, lavakiraly
  3. lovag, pancellovag, szakacs, mesterszakacs
  4. urhajos, csillagjaro, vampir, vampirgrof
  5. gomba, gombakiraly, angyal, arkangyal
  6. rocker, rocksztar, kristaly, gyemant
  7. hosmexi, bajnok, langvezer, viharkacsa
  8. kiborg, kofalo, gleccser, fomagus
  9. kisertet, mocsarkiraly, mehkiralyno, arnyekmester
  (A legendások – fonix, tengerur, aranymexi, sarkany – kimaradnak, megszerezhetetlenek maradnak.)
- **Prompt (minta, 1. kép):**
```
[Általános szabályok]
Készíts egy 1536×1024-es átlátszó hátterű pixel art sprite-lapot: 6 oszlop × 4 sor,
minden cella 256×256. Minden sor egy Mexi (Yorkshire terrier változat) térképes séta-sprite-jai,
3/4-es felülnézetből, chibi arányokkal.
Oszlopok: 1) lefelé néz áll, 2) lefelé néz lép (bal mancs előre), 3) balra néz áll,
4) balra néz lép, 5) háttal (felfelé) áll, 6) háttal lép.
1. sor: Szikra Mexi – [a csatolt szikra_f.png alapján: sárga-fekete villám elem, …]
2. sor: Viharfarkas – [viharfarkas_f.png alapján]
3. sor: Virág Mexi – [virag_f.png alapján]
4. sor: Rózsakert Mexi – [rozsakert_f.png alapján]
Egy soron belül a figura mérete, színei és részletei pontosan egyezzenek.
```
(A `[…]` részbe a harci kép csatolása elég; leírást mi adunk faj szerint, ha kell.)
- **Beépítés:**
  - A szétvágott kockákból 96×128 px-es lap készül (3×4, a meglévő `mexi_map.png` formátumában): le, bal, jobb (tükrözött bal), fel.
  - `assets/mexi/<faj>_map.png` néven kerül a játékba, és a `registerArt.js` ezt tölti be a mostani lekicsinyítés helyett.

### P1 – Ülő követő póz (3 kép)
- **Fájlnév:** `sit_mexi_01.png` … `sit_mexi_03.png`
- **Képméret:** 1024×1024, átlátszó; **rács** 4×4 (cella 256×256), 1 cella = 1 faj ülő póza
- **Nézet:** ugyanaz a 3/4 felülnézet, szemből, ül, farok oldalt. Végső méret 32×32.
- **Sorrend:**
  1. alap, beka, mehecske, lang, kacsa, nindzsa, kiber, banyasz, jeg, magus, szellem, mocsarkiraly, mehkiralyno, arnyekmester, szikra, viharfarkas
  2. virag, rozsakert, kaloz, kalozkapitany, vulkan, lavakiraly, lovag, pancellovag, szakacs, mesterszakacs, urhajos, csillagjaro, vampir, vampirgrof, gomba, gombakiraly
  3. angyal, arkangyal, rocker, rocksztar, kristaly, gyemant, hosmexi, bajnok, langvezer, viharkacsa, kiborg, kofalo, gleccser, fomagus, kisertet, + 1 üres cella
- **Referencia:** az adott faj elkészült P0 térképes lapja.
- **Prompt:** „[Általános szabályok] 1024×1024 átlátszó lap, 4×4 cella. Minden cellában egy Mexi ül, szemből, 3/4 felülnézetben, ugyanolyan stílusban és méretben, mint a csatolt térképes sprite-ok. Sorrend balról jobbra, fentről le: …”
- **Beépítés:** `assets/mexi/<faj>_sit.png` (32×32). A követő 8 s tétlenség után erre vált.

### P2 – Támadó + győzelmi póz (9 kép)
- **Fájlnév:** `pose_mexi_01.png` … `pose_mexi_09.png`
- **Képméret:** 1024×1024, rács 2×2 (cella 512×512). Soronként 1 faj: bal = támadó póz (előrevetődés, száj nyitva), jobb = győzelmi póz (két lábon ugrik, boldog).
- **Fajok:** a 33 megszerezhető új faj, 4/kép, a P0 csoportosítás szerint (a 9. képen csak kisertet).
- **Nézet:** a harci képpel azonos (szemből, enyhén balra néz), **végső méret 192×192**, mint a `_f.png`.
- **Referencia:** az adott faj `_f.png` és `_hurt.png` képe (ezek egyeznek a stílussal).
- **Beépítés:** `assets/mexi/<faj>_atk.png`, `<faj>_win.png`. A mostani kódos póz helyett ezek jelennek meg.

### P2 – Edző3/4/5 (1 kép)
- **Fájlnév:** `trainers_345.png`, 1536×1024, rács 6×3: soronként 1 edző (Máté mágus-tanonc, Réka erdőjáró, Kristóf bányász). Oszlopok: le-áll, le-lép, bal-áll, bal-lép, fel-áll, fel-lép.
- **Végső méret:** a meglévő játékos-sprite mérete (player.png kockája).
- **Referencia:** `player.png`.
- **Beépítés:** a hue-shift helyett saját lap, `npcs2.png`.

### P2 – Aréna és templom (1 kép)
- **Fájlnév:** `buildings_arena.png`, 1536×1024, 2 épület egymás mellett (bal: Holdmancs-aréna, kék-ezüst holdas tető, mancs-embléma; jobb: kis kő templom holdkoronggal).
- **Végső méret:** b_gym 192×175, b_temple 160×148.
- **Referencia:** `b_lab.png`, `b_shop.png`.
- **Csak akkor kell**, amikor az aréna fejlesztése indul.

---

## 5. Technikai korlátok és ellenőrzés
- FPS: a kódos animációk közös időzítőn futnak (nem objektumonként). Csökkentett módban kikapcsolnak. Mobilon a fű- és fa-ringás alapból „csökkentett”.
- APK: csak a P0–P2 új sprite-ok kerülnek bele (összesen < 2 MB). A nem használt bútorok nem töltődnek be induláskor.
- Stílus: minden új kép a meglévő palettára igazítva, 1 px körvonallal, elmosás nélkül (legközelebbi szomszéd).
- Mentés: egyik változás sem érinti a mentéseket.
- Minden fejlesztés a `mexiverse-dev` ágon készül. Élesre csak külön jóváhagyással kerül.
- Valódi Android-eszközön tesztelés eddig nem történt. Az asztali böngészős és mobil-nézetes teszt nem helyettesíti.
