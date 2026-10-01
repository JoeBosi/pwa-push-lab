# Audit d'interfaccia — 2026-10-01

Regole: [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md),
tramite la skill `web-design-guidelines` (`vercel-labs/agent-skills`), installata nel progetto.
Pagine: home notizie, accesso, admin, banco, laboratorio, architettura, comunicazione, componente `<pwa-invito>`.

| # | Gravità | Dove | Problema | Esito |
|---|---|---|---|---|
| A1 | **alta** | `componente/pwa-invito.js:210` | Il foglio dichiara `role="dialog" aria-modal="true"` ma non porta il focus al suo interno, non lo trattiene e non si chiude con Esc: chi usa tastiera o lettore di schermo resta bloccato fuori da una finestra che dichiara inerte il resto | corretto |
| A2 | **alta** | `laboratorio.html:30` | Campo del token senza etichetta | corretto |
| A3 | media | tutti i CSS | Nessuno stile `:focus-visible`: sui pulsanti colorati l'anello del browser si vede male | corretto |
| A4 | media | `stile.css`, `architettura.css`, componente | Manca `color-scheme`: in tema scuro campi e barre di scorrimento restano chiari | corretto |
| A5 | media | 7 pagine | Manca il collegamento «salta al contenuto» | corretto |
| A6 | bassa | pulsanti | Manca `touch-action: manipulation` (ritardo del doppio tocco) | corretto |
| A7 | bassa | `stile.css` | Pulsanti senza stato `:hover` | corretto |
| A8 | bassa | titoli | Manca `text-wrap: balance` (parole orfane sui titoli lunghi) | corretto |
| A9 | bassa | `js/notizie.js:140` | Tempo relativo scritto a mano («5 min fa») invece di `Intl.RelativeTimeFormat` | corretto |
| A10 | bassa | `admin.html:32`, `laboratorio.html:30` | Segnaposto senza esempio e senza «…» | corretto |
| A11 | bassa | verbale, elenco notizie | Testi lunghi (user agent, titoli) senza `overflow-wrap` | corretto |
| A12 | bassa | banco, laboratorio, documenti | `theme-color` indaco su pagine a fondo chiaro. **Voluto** sulle pagine notizie, dove la fascia in cima è indaco e la barra di stato la prosegue | corretto dove non voluto |
| A13 | — | testi | «Title Case» per titoli e pulsanti | **non applicabile**: è una regola dell'inglese, in italiano si usa la maiuscola solo alla prima parola |
| A14 | bassa | `laboratorio.js` | Il filtro del verbale non finisce nell'URL | corretto |
| A15 | bassa | pagine di documentazione | Blocchi di codice senza `translate="no"`: la traduzione automatica li storpia | corretto |

Già conformi: zoom non bloccato; nessun `transition: all`; nessun `outline: none`; immagini con
dimensioni; `aria-live` sugli esiti; `prefers-reduced-motion` rispettato (la freccia si ferma ma
resta visibile); `overscroll-behavior: contain` sul foglio; azioni distruttive confermate; filtro
delle notizie riflesso nell'URL; stati di caricamento con «…».

## Trovati guardando le pagine, non leggendo il codice

Dopo le correzioni le pagine sono state **fotografate** con Chromium (Playwright), a
misura di iPhone, in tema chiaro e scuro, e i diagrammi uno per uno. Le foto hanno
trovato quattro difetti che nessuna regola della lista avrebbe colto:

| # | Gravità | Dove | Problema | Esito |
|---|---|---|---|---|
| F1 | **alta** | `componente/pwa-invito.js` | Le variabili interne del componente si chiamavano come quelle della pagina (`--bordo`, `--testo`…): la regola della pagina `--pwa-bordo: var(--bordo)` e quella interna `--bordo: var(--pwa-bordo)` si richiamavano a vicenda sullo stesso elemento, e il browser scarta le variabili cicliche. Bordi e testi del foglio uscivano neri, maniglia e barra di avanzamento erano **invisibili dalla fase 2** | corretto: prefisso `--i-`, e un test |
| F2 | **alta** | `laboratorio.html` | Riscrivendo `stile.css` nella fase 2 le classi `riquadro` e `pulsantiera` erano diventate `carta` e `azioni`: il laboratorio, che usava i nomi vecchi, aveva perso la grafica | corretto, e un test confronta ogni classe usata con quelle definite |
| F3 | media | `public/architettura.html` | L'albero di decisione era più alto del suo riquadro: l'ultimo caso veniva tagliato. E mancava un ramo che il codice ha davvero («ce l'hai già, aprila dall'icona») | corretto, e un test verifica che nessun elemento esca dal disegno |
| F4 | media | diagrammi | Nel diagramma di architettura una freccia partiva dal registro e non arrivava a niente; in quello della comunicazione il passo 5 partiva da un punto vuoto e le linee dei passi 3 e 4 si incrociavano | ridisegnati; il secondo come diagramma di sequenza |
| F5 | bassa | home | 60 notizie in fila: pagina alta 18.000 pixel, la griglia spariva dalla vista | 15 alla volta, con «Mostra altre» |
| F6 | bassa | componente | Il focus portato sul primo pulsante all'apertura mostrava l'anello anche a chi tocca | il focus va sul foglio: il lettore di schermo legge il titolo, la tastiera entra con Tab |

La lezione è la stessa della fase 1, in un'altra forma: un test automatico verde non
dice che una pagina si veda come deve. Lo dice guardarla.

## Leggibilità — oltre la lista di controllo

| # | Problema | Esito |
|---|---|---|
| L1 | Chi entra per la prima volta vede tre riquadri e non sa in che ordine usarli | aggiunto «Come funziona» in tre passi |
| L2 | I collegamenti in fondo («App ↔ server», «Come è fatta») non dicono cosa contengono | rinominati |
| L3 | La griglia dice «No» senza spiegare cosa significhi la frequenza | legenda sopra la griglia |
