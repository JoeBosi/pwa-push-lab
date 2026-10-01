# Feed RSS per il sito notizie
Data: 2026-10-01 · Validità stimata: riverificare se un feed smette di dare voci (cambiano indirizzo senza avvisare)

## Fonti — verificate con richiesta reale il 2026-10-01
| Categoria | Feed | Esito |
|---|---|---|
| Politica | https://www.ansa.it/sito/notizie/politica/politica_rss.xml | 200, 23 voci |
| Politica | https://www.repubblica.it/rss/politica/rss2.0.xml | 200, 25 voci |
| Mercati | https://www.ilsole24ore.com/rss/finanza.xml | 200, 4 voci |
| Mercati | https://www.ansa.it/sito/notizie/economia/economia_rss.xml | 200, 58 voci |
| Sport | https://www.ansa.it/sito/notizie/sport/sport_rss.xml | 200, 34 voci |
| Guerre e macro | https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml | 200, 33 voci |
| Guerre e macro | https://www.ilsole24ore.com/rss/mondo.xml | 200, 12 voci |

Scartati: `ispionline.it/it/feed` (nessuna risposta); `gazzetta.it/rss/home.xml` (risponde, ma
mescola cronaca generica: c'era "Maltempo in Toscana" fra le notizie sportive).

## Sintesi operativa
- Tutti RSS 2.0, titoli in `<![CDATA[...]]>`: serve un parser XML vero (`fast-xml-parser` 5.x),
  non espressioni regolari.
- Chiave di deduplica: il `link` (le stesse notizie ANSA compaiono in piu' feed).
- Lettura ogni 5 minuti: e' la frequenza minima offerta agli utenti, e piu' spesso sarebbe
  scortesia verso chi pubblica il feed. User-Agent dichiarato.
- "Nuova" = vista per la prima volta dal nostro server, non `pubDate`: le date dei feed sono
  inaffidabili (fusi orari, ripubblicazioni).

## Trappole
- Un feed che fallisce non deve fermare gli altri: ogni lettura e' isolata.
- Il Sole 24 Ore finanza ha poche voci: per i mercati serve affiancare ANSA economia.
- "Guerre e situazione macroeconomica" non ha un feed dedicato: si compone da esteri + economia
  internazionale. E' una scelta editoriale, va dichiarata all'utente.
