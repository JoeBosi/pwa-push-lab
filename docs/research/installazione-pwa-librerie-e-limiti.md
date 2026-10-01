# Guidare l'utente all'installazione di una PWA — cosa esiste e cosa non si puo' fare
Data: 2026-08-29 · **Corretta il 2026-09-30** (vedi punto 3)
Validità stimata: riverificare a ogni major di iOS — il supporto e' cambiato piu' volte,
e questa nota e' gia' stata smentita una volta dai fatti.

## Fonti
- https://webkit.org/blog/13966/webkit-features-in-safari-16-4/ — **fonte primaria della
  correzione del 2026-09-30**: *"iOS and iPadOS 16.4 also add support so that third-party web
  browsers can offer 'Add to Home Screen' in the Share menu."* Il browser deve avere
  l'autorizzazione `com.apple.developer.web-browser` e passare la `WKWebView` fra gli
  `activityItems`.
- https://www.macworld.com/article/2238869/ios-17-4-home-screen-web-apps-digital-markets-act-eu.html
  — nell'UE Apple annuncio' la rimozione delle web app sulla Home con iOS 17.4, poi **fece
  marcia indietro**: sono rimaste. Da iOS 18.2 nell'UE i browser terzi possono creare web app
  **con il proprio motore**.
- https://groups.google.com/a/chromium.org/g/blink-dev/c/KCpVX8F6yh8 — **Web Install API**
  (`navigator.install()`): origin trial in Chrome ed Edge **143-148**. Prima Windows, Mac,
  Linux, ChromeOS; **Android "later"**; iOS non previsto. Installa l'app corrente, o un'altra
  dato URL + App ID.
- https://github.com/philfung/add-to-homescreen — MIT. Modale con **freccia animata** che
  punta al pulsante Condividi; la documentazione dichiara che lasciarla accesa
  *"drastically affects install rates"*. Dichiara **~85% di installazioni** su iOS e Android
  (**metodologia non pubblicata**: da trattare come indicazione, non come misura).
  Gestisce iOS Safari, iOS < 16, **iOS Chrome/Firefox (rimanda a Safari)**, e i **browser
  in-app di Instagram/Facebook/X**. Opzioni: `appName`, `appIconUrl`, `displayOptions`,
  `allowClose`, `showArrow`, `maxModalDisplayCount`, `clearModalDisplayCount()`.
- https://github.com/khmyznikov/pwa-install — MIT, **28 kB brotli**, web component
  `<pwa-install>`. Bottom sheet con stile di piattaforma, **look nativo su iOS/macOS 26+**,
  **30+ lingue** (italiano incluso), screenshot dal manifest, `getInstalledRelatedApps()`,
  `use-local-storage` per ricordare il rifiuto. Eventi `pwa-install-success-event` ecc.
  **solo su Chromium**: su iOS non esiste modo di sapere se l'utente ha installato.
  Personalizzazione grafica limitata a `--tint-color` sui template Apple.
- https://christiantietze.de/posts/2023/05/safari-for-mac-url-scheme/ +
  https://github.com/chromium/chromium/blob/main/docs/ios/opening_links.md — schemi URL:
  `x-safari-https://…` apre in Safari da un altro browser iOS; `googlechromes://…` apre in
  Chrome. Riferito funzionante su iOS recenti (fino a iOS 26), **non su iOS 16**.

## Sintesi operativa

**1. Su iOS l'installazione non e' automatizzabile, e non lo sara' a breve.**
La Web Install API e' Chromium; su iOS ogni browser e' WebKit. Non c'e' `beforeinstallprompt`
e non c'e' `navigator.install`. Il massimo possibile e' *guidare il gesto*. Chi promette
"installazione automatica su iPhone" sta descrivendo Android.

**2. Il gesto si puo' pero' rendere ovvio.** La lezione piu' concreta trovata e' la freccia
animata che punta al pulsante Condividi: sposta il problema da "leggi tre righe e capisci"
a "guarda dove indica". E' l'unica affermazione delle due librerie che parla di *tassi*.

**3. Il caso "iPhone ma non Safari".** ⚠️ **CORRETTO il 2026-09-30.**

> **Quello che questa nota diceva il 2026-08-29 era sbagliato.** Diceva che da Chrome,
> Firefox ecc. l'aggiunta a Home "non esiste come voce di menu". **Non e' vero da iOS 16.4**
> (vedi la prima fonte). Verificato sul campo su un iPhone reale in Italia: da Chrome
> si installa. L'errore non era innocuo: mandava a fare un giro inutile chi era gia' nel
> posto giusto, e il componente mostrava un'affermazione falsa.

Situazione reale:

- **Safari**: si installa, e si sa **dove sta** il pulsante Condividi → si puo' puntare la
  freccia.
- **Chrome, Edge, Firefox, DuckDuckGo, Opera, Yandex su iOS 16.4+**: si installa **anche da
  li'**. Cambia la *certezza* della posizione del pulsante, non la possibilita': ogni browser
  mette Condividi in un posto suo e lo sposta fra le versioni → istruzioni a parole, niente
  freccia (puntarla a caso e' peggio che non averla), e Safari offerto come **ripiego**.
- **Browser in-app** (Instagram, Facebook, WhatsApp, X): qui l'aggiunta a Home **davvero non
  c'e'** — non sono browser con l'autorizzazione di sistema. Resta l'unico caso in cui
  bisogna uscire.

`x-safari-https://` resta utile come ripiego; serve comunque un'alternativa visibile (copia
dell'indirizzo) perche' su iOS 16 non funziona e nei browser in-app puo' essere bloccato.

**4. Nessuna delle due librerie si occupa di notifiche.** Si fermano all'installazione. Il
percorso reale e' a **tre** passi — installa → concedi il permesso → iscriviti — e il secondo
e il terzo, su iOS, sono possibili **solo dopo** il primo. Questa e' la ragione principale per
cui adottarne una non basterebbe.

**5. Nessuna delle due misura nulla.** Non sanno dire quanti utenti si sono fermati e dove.

## Trappole / errori comuni

- Su iOS **non si puo' sapere se l'utente ha installato**: non esiste `appinstalled`. L'unico
  segnale e' vedere la pagina ripartire in `display-mode: standalone`. Ogni conteggio di
  "installazioni iOS" basato su altro e' inventato.
- `beforeinstallprompt` **non si ripresenta** nella stessa sessione dopo un rifiuto: un
  pulsante "Installa" lasciato acceso dopo un rifiuto e' un pulsante morto.
- Gli schemi `x-safari-https://` non danno alcun riscontro se falliscono: la pagina resta
  ferma. Serve sempre un'alternativa visibile.
- I browser in-app (Instagram, Facebook, X, WhatsApp) sono la sorgente di traffico piu'
  comune da social e sono **quelli in cui l'installazione e' impossibile**: vanno riconosciuti
  e trattati per primi, non come caso residuale.
- La freccia animata va disattivata sotto `prefers-reduced-motion`.

## Incertezze

- L'~85% dichiarato da philfung non ha metodologia pubblicata: non e' un dato su cui basare
  promesse, e' un indizio che quelle scelte di interfaccia contano.
- Il comportamento di `x-safari-https://` dentro i browser in-app non e' documentato:
  **va provato sul dispositivo** prima di dichiararlo funzionante (Regola 4).

## Aggiornare nome e icona di un'app gia' installata (2026-10-01)

- **Android + Chrome**: si', da solo. Chrome ricontrolla il manifest del WebAPK di norma ogni
  **giorno** (dopo un errore puo' passare a 30) e aggiorna `name`, `short_name`, `icons`,
  `theme_color` ecc. Fonte: https://web.dev/articles/manifest-updates
- **iOS**: nome e icona vengono **fissati al momento dell'aggiunta a Home** (il nome lo
  conferma o lo cambia l'utente nel riquadro "Aggiungi a Home"). Nessuna fonte documenta un
  meccanismo di aggiornamento successivo, e non esiste un'API per farlo. Per cambiarli va
  tolta e rimessa. Tutto il resto — pagine, JavaScript, service worker — si aggiorna invece
  da se', perche' arriva dal server a ogni apertura.
