# Web Push su iOS e Android — requisiti reali
Data: 2026-08-28 · Validità stimata: riverificare a ogni major di iOS (il supporto e' cambiato piu' volte)

## Fonti
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ — Apple, annuncio del
  supporto in iOS/iPadOS **16.4**. Dichiara: Web Push **W3C standard** (non un'API proprietaria),
  sopra APNs; solo per web app **aggiunte alla schermata Home**; il permesso si chiede **solo in
  risposta a un'interazione diretta dell'utente** ("such as tapping on a 'subscribe' button");
  supporto alla Badging API.
- https://developer.mozilla.org/en-US/docs/Web/API/Push_API — Push API "Baseline: widely available"
  da marzo 2023. Serve un service worker **attivo**; l'iscrizione passa da `PushManager.subscribe()`
  con `applicationServerKey` (VAPID).
- https://webkit.org/blog/16535/meet-declarative-web-push/ — variante dichiarativa piu' recente
  (il push porta gia' il testo della notifica, senza passare dal service worker). **Non usata qui**:
  il push classico funziona ovunque, il dichiarativo no.
- https://www.npmjs.com/package/web-push — libreria di invio lato server. Versione al momento
  della verifica: **3.6.7**, `engines: node >= 16`. Genera anche le chiavi VAPID.

## Sintesi operativa

Cinque requisiti. Se ne manca **uno solo**, non arriva niente, e quasi sempre **senza errori**.

1. **HTTPS con certificato valido** (o `localhost`, che il browser considera contesto sicuro).
   Un certificato autofirmato non basta: su iOS non si installa nemmeno la web app.
2. **Manifest** collegato dalla pagina, con `display` = `standalone` **oppure** `fullscreen`.
   Con `browser` o `minimal-ui` iOS non la tratta come web app e il push non esiste.
3. **Service worker** registrato, con uno *scope* che copra la pagina. Se il file e' servito da
   una sottocartella serve l'header `Service-Worker-Allowed: /`; la via semplice e' servirlo
   dalla radice.
4. **Gesto dell'utente**: `Notification.requestPermission()` (e la successiva `subscribe()`)
   devono partire da un `click`. Chiamate al caricamento della pagina vengono ignorate.
5. **Su iOS: l'app dev'essere aggiunta alla schermata Home.** Nel browser il pulsante non
   fara' mai niente. Non e' un bug da aggirare, e' il modello di Apple.
   (Aggiornato 2026-09-30: l'aggiunta a Home **non e' esclusiva di Safari** — da iOS 16.4 la
   offrono anche Chrome, Edge, Firefox e DuckDuckGo. Vedi
   `installazione-pwa-librerie-e-limiti.md`, punto 3.)

### Cosa funziona dove

| Piattaforma | In browser | Installata |
|---|---|---|
| Android — Chrome/Edge/Samsung | sì | sì |
| iOS/iPadOS 16.4+ — Safari | **no** | sì |
| iOS 16.4+ — Chrome, Edge, Firefox, DuckDuckGo | no | **sì**: «Aggiungi a Home» dal menu Condividi |
| iOS — browser dentro Instagram/Facebook/WhatsApp | no | no: non sono browser autorizzati |
| Desktop — Chrome/Edge/Firefox/Safari | sì | sì |

### Invio lato server (`web-push`)

- Coppia VAPID generata una volta: la **pubblica** va al browser in `applicationServerKey`,
  la **privata** resta sul server e firma gli invii. Cambiare la coppia **invalida tutte le
  iscrizioni esistenti**.
- `vapidDetails.subject` dev'essere un `mailto:` o un `https:` reale.
- Il payload viaggia **cifrato** con le chiavi `p256dh`/`auth` che il browser fornisce
  nell'iscrizione: il server push (Google/Apple) non puo' leggerlo.
- Esiti da gestire: **`404` e `410` significano iscrizione morta** — va cancellata dal proprio
  archivio, altrimenti si accumulano invii falliti per sempre. `429` = troppo traffico,
  `413` = payload troppo grande (tenersi sotto ~4 KB).

## Trappole / errori comuni

- **Un evento `push` che non mostra una notifica visibile costa l'iscrizione.** Safari revoca il
  permesso, Chrome mostra al posto tuo "questo sito e' stato aggiornato in background" e a lungo
  andare penalizza. Quindi nel gestore `push` **ogni ramo**, compreso quello del payload
  illeggibile, deve finire in `showNotification()`, e la chiamata va dentro `event.waitUntil()`
  o il service worker viene terminato prima di mostrarla.
- **`Notification.permission === 'granted'` non implica un'iscrizione push attiva.** Sono due
  cose distinte: si puo' avere il permesso e nessuna `subscription`. Vanno controllate separatamente.
- Su iOS il permesso concesso **nella web app installata** e' un'altra cosa rispetto a Safari:
  disinstallare l'icona dalla Home butta via permesso e iscrizione.
- `applicationServerKey` vuole un `Uint8Array`: la chiave pubblica arriva in **base64url**
  (`-` e `_` al posto di `+` e `/`, senza `=`) e va convertita, altrimenti `subscribe()` fallisce.
- `userVisibleOnly: true` e' obbligatorio su Chrome: senza, `subscribe()` viene rifiutata.
- Cambiare `data/` o rigenerare le chiavi VAPID senza svuotare le iscrizioni lascia in archivio
  iscrizioni che falliranno tutte con `403`.

## Incertezze

- Non verificato su dispositivo: **tutto quanto sopra riguarda il comportamento reale dei telefoni**.
  Queste sono le dichiarazioni della documentazione. Vedi Regola 4 in `CLAUDE.md`: gli esiti
  osservati vanno nel verbale delle prove, e solo quelli.
