# Far aprire i link nella PWA installata invece che nel browser
Data: 2026-08-29 · Validità stimata: riverificare a ogni major di Chrome e di iOS

## Fonti
- https://developer.chrome.com/docs/capabilities/pwa-navigation-management — **Launch Handler API**,
  Chrome **110+**, rivista in **Chrome 139**. `launch_handler.client_mode`:
  `focus-existing` (porta in primo piano la finestra gia' aperta), `navigate-existing`
  (la porta all'URL richiesto), `navigate-new`, `auto`. La cattura dei link e' attiva
  **da Chrome 139 su Windows, Mac e Linux**; ChromeOS "in una versione futura".
  `scope_extensions` (catturare link di altre origini) e' **ancora in sviluppo**.
- https://modernwebweekly.substack.com/p/the-state-of-link-capturing-in-pwas — stato piattaforma
  per piattaforma (vedi tabella sotto). Su iOS: *"No deep linking support exists. All clicked links
  open in the default browser, regardless of whether a PWA is installed and with which browser."*
- https://github.com/WICG/pwa-url-handler/blob/main/explainer.md — `handle_links` nel manifest:
  `preferred` | `not-preferred` | `auto`. L'utente puo' sempre annullare la scelta dalle
  impostazioni dell'app ("Apri in Chrome").
- https://developer.chrome.com/docs/capabilities/get-installed-related-apps +
  https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getInstalledRelatedApps —
  `navigator.getInstalledRelatedApps()`: una PWA scopre se **se stessa** e' gia' installata,
  dichiarandosi in `related_applications` con `platform: "webapp"` e l'URL del proprio manifest.
  Solo contesti sicuri. **Solo i primi tre elementi** di `related_applications` vengono considerati.
- https://www.idownloadblog.com/2025/06/17/apple-ios-26-safari-web-apps-home-screen-bookmarks/ —
  da **iOS 26** ogni sito aggiunto alla Home si apre come web app per impostazione predefinita
  (l'utente puo' disattivare "Apri come web app"). Riguarda il segnalibro, **non** la cattura dei link.

## Sintesi operativa

### Chi cattura i link, e chi no

| Piattaforma | Link da **altre app** | Link dentro il **browser** |
|---|---|---|
| **Android + Chrome** (WebAPK) | **sì, affidabile** | sì |
| Android + Edge / Firefox | no | no |
| ChromeOS + Chrome | sì | sì |
| macOS — app aggiunta al Dock da **Safari** | sì | sì |
| macOS / Windows — Chrome, Edge | **no** | solo dalle proprie schede |
| **iOS / iPadOS** | **MAI** | **MAI** |

### Su iOS non e' possibile. Punto.

Non e' una questione di configurazione mancante: **non esiste**. Ogni link aperto su iPhone
va al browser predefinito, che la PWA sia installata o no. Le uniche due cose che aprono una
web app installata su iOS sono **la sua icona** e **il tocco su una notifica push**.

Peggio: su iOS non si puo' nemmeno **sapere** se l'app e' installata.
`getInstalledRelatedApps()` e' solo Chromium, e la web app installata ha un **contenitore di
dati separato** da Safari — quindi non c'e' nemmeno il trucco di lasciare un segno in
`localStorage` da Safari e rileggerlo dall'app, o viceversa.

### Che cosa si puo' fare davvero

1. **`handle_links: "preferred"`** nel manifest: dichiara che i link dentro lo scope vanno
   aperti nell'app. Vale su Chromium; l'utente puo' sempre annullarlo dalle impostazioni.
2. **`launch_handler: { client_mode: "navigate-existing" }`**: quando l'app viene avviata da
   un link, invece di aprire una seconda finestra si porta all'indirizzo quella gia' aperta.
3. **`related_applications: [{ platform: "webapp", url: "<url assoluto del manifest>" }]`** +
   `prefer_related_applications: false`: abilita `getInstalledRelatedApps()` a riconoscere se
   stessa. Da li' si puo' dire, nel browser, "ce l'hai gia': aprila dall'icona" invece di
   riproporre l'installazione a chi ha gia' installato.
4. Su iOS: **dirlo**. Un invito che ripropone l'installazione a chi ha gia' installato e' il
   modo piu' rapido per sembrare rotti.

## Trappole / errori comuni

- `related_applications.url` **dev'essere assoluto**: copiando il manifest su un altro dominio
  la rilevazione smette di funzionare **in silenzio**. Conviene generarlo lato server
  dall'origine della richiesta, invece di scriverlo a mano.
- Non esiste alcuna API per **lanciare** la PWA installata da una pagina di browser. La cattura
  avviene prima, a livello di sistema: se il link e' gia' aperto nel browser, e' tardi.
  Il massimo e' dire all'utente di aprirla dall'icona.
- Su Android il **WebAPK si aggiorna con un ritardo** (fino a circa un giorno): una modifica a
  `handle_links` non ha effetto immediato sulle installazioni esistenti.
- L'utente puo' disattivare "Apri i link supportati" nelle impostazioni dell'app: la cattura
  e' una preferenza, non una garanzia. Un'interfaccia che la da' per certa mente.
- `scope_extensions` non e' pronto: i link di **altre** origini non si catturano.

## Incertezze

- Il comportamento esatto della cattura su Android per un WebAPK gia' installato **prima**
  dell'aggiunta di `handle_links` va verificato sul dispositivo (Regola 4).
- `getInstalledRelatedApps()` su Android richiede che il WebAPK sia aggiornato: subito dopo
  l'installazione potrebbe non riconoscersi.
