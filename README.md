# Foci Elemző

Böngészős focimeccs-elemző. Kiválasztod a napot és a meccset, és megkapod az 1X2, a mindkét csapat lő gólt (BTTS), a gólszám (over/under) és a pontos végeredmény valószínűségeit.

## Modell
- **Dixon–Coles** bivariáns Poisson modell (alacsony eredmények korrekciója, időbeli súlyozás, Bayes-i shrinkage, feljutók priorja)
- **Kapura lövés alapú xG-proxy** modell
- **Piaci szorzók** marzs nélkül (power-módszer), ebből visszaszámolt várható gólok
- **Ensemble** a várható gólokra → egységes eredménymátrix → minden piac
- **Value / EV / negyed-Kelly**, **visszamérés** (csak múltbeli adatokkal), **ligánkénti auto-hangolás**

Adatforrás: football-data.co.uk (ingyenes, kulcs nélkül), 38 liga.

## Futtatás
    npm start   # http://localhost:3000
