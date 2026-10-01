# `<pwa-invito>`

Install prompt **and** notification-permission flow for a PWA.
**One file, no dependencies.** Copy it into any project.

[English](#english) · [Italiano](#italiano)

```html
<script type="module" src="/componente/pwa-invito.js"></script>
<pwa-invito nome-app="My App" icona="/icons/192.png"></pwa-invito>
```

That's it. The component decides by itself whether to appear, when, and what to say.
Its visible texts are in Italian; translating them means editing the strings in the
`_scenario*` methods.

---

<a id="english"></a>

## English

### Why it exists, given two mature libraries

`@khmyznikov/pwa-install` and `philfung/add-to-homescreen` are good and battle-tested.
Neither of them knows anything about **notifications**: they stop at installation.

The real path has **two linked steps**:

```
install  ──►  grant permission  ──►  (your app subscribes to push)
```

and on iPhone the second step exists **only after** the first. A library covering the
first half has to be extended anyway — so it is better to own it than to fight someone
else's theming for half the job.

From them we took the *decisions*, not the code:

| From | What | Why |
|---|---|---|
| philfung | the **animated arrow** pointing at Share | the only UI choice with a claim about install rates |
| philfung | **in-app browsers** detected first | the most common case from social media, and the one where installing is impossible |
| khmyznikov | remembering dismissal, bottom sheet | shapes users already know |

### The constraint nobody can get around

**There is no API to install a web app on iOS.** `navigator.install()` is Chromium, and
on iOS every browser is WebKit. Anyone promising "automatic install on iPhone" is
describing Android.

- **Android and desktop**: **one tap** install, via `beforeinstallprompt`.
- **iPhone**: the only thing you can do is *make the gesture obvious*. That is what the
  arrow does.

### What it shows, case by case

The order matters, and mirrors the code in `_disegna()`:

| Situation | What it shows |
|---|---|
| Opened from the installed app | jumps to the permission step |
| App is installed, but you are in the browser (Chromium only) | "You already have it: open it from its icon" — never re-offers installation |
| Inside **Instagram, Facebook, WhatsApp, X, TikTok, LinkedIn** | "Leave *name*": in-app browsers cannot add to the Home Screen |
| iPhone, **Chrome / Edge / Firefox / DuckDuckGo** | instructions for that browser (since iOS 16.4 they can add to Home), with **Safari as a fallback** |
| iPhone or iPad, **Safari** | the three steps **+ the arrow** pointing at Share (bottom on iPhone, top on iPad) |
| Android / desktop with the prompt available | "Install now" — one tap |
| A browser that cannot install (Firefox desktop) | where to look in the menu, and that notifications work anyway |
| iOS below 16.4 | installs anyway, but **warns** that notifications will not arrive |

"Open in Safari" uses `x-safari-https://` and always has a fallback (copy the address),
because that scheme **gives no feedback when it fails** — it does not work on iOS 16, and
some in-app browsers block it.

### Opening links in the installed app

| Platform | Links from **other apps** | Links inside the **browser** |
|---|---|---|
| **Android + Chrome** (WebAPK) | **yes, reliably** | yes |
| Android + Edge / Firefox | no | no |
| ChromeOS | yes | yes |
| macOS — app added to the Dock from **Safari** | yes | yes |
| macOS / Windows — Chrome, Edge | no | only from their own tabs |
| **iOS / iPadOS** | **never** | **never** |

On iOS every link goes to the default browser, installed app or not; only the app icon
and tapping a push notification open the installed web app. You cannot even *know* that
it is installed: `getInstalledRelatedApps()` is Chromium-only and the installed web app
has a storage container separate from Safari's. That is why `giaInstallataAltrove()`
returns **`null`** on iOS — "I don't know" — rather than `false`, and the
"you already have it" screen appears only on a certain yes.

Manifest members that help where links *can* be captured:

```json
{
  "handle_links": "preferred",
  "launch_handler": { "client_mode": "navigate-existing" },
  "prefer_related_applications": false,
  "related_applications": [
    { "platform": "webapp", "url": "https://YOUR-DOMAIN/manifest.webmanifest" }
  ]
}
```

`related_applications.url` **must be absolute**: hard-coded, it breaks silently when the
project moves to another domain. This project generates it on the server from the
request origin.

### API

#### Attributes

| Attribute | Default | Effect |
|---|---|---|
| `nome-app` | `document.title` | the app name used in the texts |
| `icona` | `/icone/icona-192.png` | icon shown in the sheet |
| `ritardo` | `2500` | milliseconds before appearing |
| `rinvio-giorni` | `7` | how long "not now" lasts |
| `senza-notifiche` | — | stops the flow after installation |

#### Methods and properties

```js
const prompt = document.querySelector('pwa-invito');

prompt.stato        // { ambiente, passo, aperto, installabileInUnTocco, rinviato, spento,
                    //   giaInstallata, catturaLink }
prompt.mostra();    // show
prompt.nascondi();  // hide
prompt.riaccendi(); // undo "not now" and "don't show again"
```

`rilevaAmbiente()` is exported on its own, for diagnostics or event logging:

```js
import { rilevaAmbiente } from '/componente/pwa-invito.js';
const env = rilevaAmbiente();
// { iOS, iPad, android, inApp, safariIOS, altroBrowserIOS, nomeBrowserIOS,
//   installata, versioneIOS, sicura, pushPossibile, catturaLink, nome }
```

#### Events

| Event | When | `detail` |
|---|---|---|
| `pwa-invito-mostrato` | the sheet appears | `{ passo, ambiente }` |
| `pwa-invito-rinviato` | "not now", backdrop tap, or dragged down | `{ esplicito, giorni }` |
| `pwa-invito-spento` | "don't show again" | `{}` |
| `pwa-invito-installata` | `appinstalled` (**never on iOS**) | `{}` |
| `pwa-invito-notifiche` | permission answered | `{ esito }` |

> `appinstalled` does **not exist** on iOS. The only signal is the page restarting in
> `display-mode: standalone`, which the component detects. Any count of "iOS installs"
> based on anything else is made up.

#### It asks for permission; you subscribe

On purpose: the component knows nothing about your server, your VAPID keys or your
storage. It asks for permission — which **must** start from a tap — and hands you the
answer:

```js
prompt.addEventListener('pwa-invito-notifiche', (ev) => {
  if (ev.detail.esito !== 'granted') return;
  // from here on it's yours: pushManager.subscribe() and send it to your server
});
```

### Theming

Set from outside, on `pwa-invito` or `:root`:

```css
pwa-invito {
  --pwa-accento:       #2563eb;   /* accent */
  --pwa-accento-scuro: #1e3a8a;
  --pwa-su-accento:    #ffffff;   /* text on accent */
  --pwa-fondo:         #ffffff;   /* background */
  --pwa-testo:         #131c33;   /* text */
  --pwa-tenue:         #5d6a8a;   /* muted text */
  --pwa-bordo:         #e4e8f2;   /* border */
  --pwa-raggio:        22px;      /* radius */
  --pwa-ombra:         0 -8px 40px rgba(16, 24, 48, .18);
  --pwa-carattere:     system-ui, sans-serif;
}
```

Dark mode follows `prefers-color-scheme`. Deeper styling: `::part(velo)`,
`::part(foglio)`, `::part(maniglia)`.

Internally, variables are prefixed `--i-` on purpose: if they shared names with the
page's (`--bordo`, `--testo`…), the page rule `--pwa-bordo: var(--bordo)` and the
internal `--bordo: var(--pwa-bordo)` would reference each other on the same element;
browsers discard cyclic variables and colours fall back to black. It happened, and the
2026-10-01 audit caught it.

### Accessibility

The sheet is a real modal dialog: on open, focus moves into it; Tab cycles only through
its buttons; **Esc** closes it (as "not now"); on close, focus returns where it was.
Drag-to-dismiss always has a tap and keyboard alternative. Under
`prefers-reduced-motion` the arrow **stops but stays visible** — there it is the
instruction, not an ornament.

### Before saying it works

On real devices, not an emulator:

- [ ] Android Chrome: appears; one tap installs
- [ ] Android Chrome: after refusing, the button does **not** stay on and dead
- [ ] iPhone Safari: the arrow points at the bottom bar, not at itself
- [ ] iPad Safari: the arrow points **top right**
- [ ] iPhone Chrome: the instructions really lead to installing **from Chrome**
- [ ] iPhone Chrome: the "open in Safari" fallback works, and visibly reports failure
- [ ] Opened from Instagram: tells you to leave, does not pretend you can install
- [ ] Dragging the sheet down closes it
- [ ] "Don't show again" → reload, it stays away → `riaccendi()` brings it back
- [ ] `prefers-reduced-motion`: the arrow stops but stays visible
- [ ] Keyboard: focus enters the sheet, Tab stays inside, Esc closes, focus returns
- [ ] Android, app installed, link opened **from another app**: the app opens
- [ ] iPhone, app installed, link opened from Safari: **the browser opens** — expected

License: MIT, like the project. The UI decisions are inspired by two MIT projects cited
above; the code is original.

---

<a id="italiano"></a>

## Italiano

Invito all'installazione e all'attivazione delle notifiche per una PWA.
**Un file, nessuna dipendenza.** Si copia in qualunque progetto.

```html
<script type="module" src="/componente/pwa-invito.js"></script>
<pwa-invito nome-app="La mia app" icona="/icone/icona-192.png"></pwa-invito>
```

Fine. Il componente decide da sé se comparire, quando, e che cosa dire.

---

### Perché esiste, dato che ci sono già due librerie mature

`@khmyznikov/pwa-install` e `philfung/add-to-homescreen` sono buone e collaudate.
Nessuna delle due però sa niente di **notifiche**: si fermano all'installazione.

Il percorso vero è a **due passi legati**:

```
installa  ──►  concedi il permesso  ──►  (la tua app iscrive al push)
```

e su iPhone il secondo esiste **solo dopo** il primo. Una libreria che copre il
primo pezzo va comunque estesa — e allora tanto vale possederla, invece di
combattere il tema di qualcun altro per metà del lavoro.

Da loro sono state prese le decisioni, non il codice:

| Da | Che cosa | Perché |
|---|---|---|
| philfung | la **freccia animata** verso Condividi | è l'unica scelta d'interfaccia per cui esista un'affermazione sui tassi di installazione |
| philfung | i **browser in-app** riconosciuti per primi | sono il caso più frequente da social, e quello in cui installare è impossibile |
| khmyznikov | memoria del rifiuto, foglio dal basso | forme che gli utenti già conoscono |

### Il vincolo che nessuno può aggirare

**Su iOS non esiste alcuna API per installare.** `navigator.install()` è Chromium,
e su iOS ogni browser è WebKit. Chi promette «installazione automatica su iPhone»
sta descrivendo Android.

- **Android e desktop**: installazione in **un tocco**, via `beforeinstallprompt`.
- **iPhone**: si può solo *rendere ovvio il gesto*. È quello che fa la freccia.

---

### Che cosa succede, caso per caso

| Situazione | Cosa mostra |
|---|---|
| Android / desktop con prompt disponibile | «Installa ora» — un tocco |
| iPhone o iPad in **Safari** | i tre passaggi **+ la freccia** che punta a Condividi (in basso su iPhone, in alto su iPad) |
| iPhone in **Chrome / Edge / Firefox / DuckDuckGo** | le istruzioni per quel browser: da iOS 16.4 «Aggiungi a Home» c'è anche lì. Safari resta come **ripiego** |
| Dentro **Instagram, Facebook, WhatsApp, X, TikTok, LinkedIn** | «Esci da *nome*»: da lì l'aggiunta a Home non esiste |
| Browser senza installazione (Firefox desktop) | dove cercarla nel menù, e che le notifiche funzionano comunque |
| Aperta dall'app installata | salta al passo del permesso |
| Risulta installata, ma sei nel browser (solo Chromium) | «Ce l'hai già: aprila dall'icona» — non ripropone l'installazione |
| iOS sotto la 16.4 | installa lo stesso, ma **avverte** che le notifiche non arriveranno |

Il salto a Safari ha sempre il ripiego perché `x-safari-https://` **non dà alcun
riscontro se fallisce** — su iOS 16 non funziona, e in certi browser in-app è
bloccato. Senza alternativa visibile l'utente resterebbe fermo davanti a un
pulsante che non ha fatto nulla.

---

### Aprire i link nell'app installata invece che nel browser

La risposta cambia completamente da una piattaforma all'altra.

| Piattaforma | Link da **altre app** | Link dentro il **browser** |
|---|---|---|
| **Android + Chrome** (WebAPK) | **sì, affidabile** | sì |
| Android + Edge / Firefox | no | no |
| ChromeOS | sì | sì |
| macOS — app nel Dock da **Safari** | sì | sì |
| macOS / Windows — Chrome, Edge | no | solo dalle proprie schede |
| **iOS / iPadOS** | **mai** | **mai** |

#### Su iOS non è possibile, e non è una configurazione mancante

Ogni link aperto su iPhone va al browser predefinito, che la PWA sia installata o
no. Le uniche due cose che aprono una web app installata su iOS sono **la sua
icona** e **il tocco su una notifica push**.

E non si può nemmeno *sapere* se è installata: `getInstalledRelatedApps()` è solo
Chromium, e la web app installata ha un **contenitore di dati separato** da
Safari — quindi non funziona neppure il trucco di lasciare un segno in
`localStorage` da una parte e rileggerlo dall'altra.

Per questo `giaInstallataAltrove()` risponde **`null`** su iOS, non `false`.
`null` vuol dire «non lo so», e su un «non lo so» non si può dire all'utente né
che ce l'ha né che non ce l'ha. Il componente mostra lo scenario «ce l'hai già»
**solo** su un sì certo.

#### Che cosa mettere nel manifest

```json
{
  "handle_links": "preferred",
  "launch_handler": { "client_mode": "navigate-existing" },
  "prefer_related_applications": false,
  "related_applications": [
    { "platform": "webapp", "url": "https://IL-TUO-DOMINIO/manifest.webmanifest" }
  ]
}
```

- `handle_links: "preferred"` — i link dentro lo scope vanno all'app. L'utente
  può sempre annullarlo dalle impostazioni dell'app: **è una preferenza, non una
  garanzia**, e un'interfaccia che la dà per certa mente.
- `launch_handler` — avviando l'app da un link, porta all'indirizzo la finestra
  già aperta invece di aprirne una seconda.
- `related_applications` — abilita l'autoriconoscimento. **L'URL dev'essere
  assoluto**: scritto a mano, copiando il progetto su un altro dominio la
  rilevazione smette di funzionare *in silenzio*. Conviene generarlo lato server
  dall'origine della richiesta — in questo progetto lo fa `server.js`.

#### Quello che nessuno può fare

**Non esiste alcuna API per lanciare la PWA installata da una pagina di
browser.** La cattura avviene prima, a livello di sistema: se il link è già
aperto nel browser, è tardi. Il massimo onesto è riconoscerlo e dire di aprirla
dall'icona — che è esattamente ciò che fa `_scenarioGiaInstallata`.

Su Android il **WebAPK si aggiorna con un ritardo** (fino a circa un giorno):
aggiungere `handle_links` non ha effetto immediato sulle installazioni esistenti.

---

### Interfaccia

#### Attributi

| Attributo | Default | Effetto |
|---|---|---|
| `nome-app` | `document.title` | il nome nei testi |
| `icona` | `/icone/icona-192.png` | l'icona nel foglio |
| `ritardo` | `2500` | millisecondi prima di comparire |
| `rinvio-giorni` | `7` | quanto dura «non ora» |
| `senza-notifiche` | — | ferma il percorso all'installazione |

#### Metodi e proprietà

```js
const invito = document.querySelector('pwa-invito');

invito.stato        // { ambiente, passo, aperto, installabileInUnTocco, rinviato, spento,
                    //   giaInstallata, catturaLink }
invito.mostra();
invito.nascondi();
invito.riaccendi(); // annulla «non ora» e «non mostrarlo più»
```

`rilevaAmbiente()` è esportata a parte: serve anche fuori dal componente, per la
diagnostica o per un registro degli eventi.

```js
import { rilevaAmbiente } from '/componente/pwa-invito.js';
const a = rilevaAmbiente();
// { iOS, iPad, android, inApp, safariIOS, altroBrowserIOS,
//   installata, versioneIOS, sicura, pushPossibile, nome }
```

#### Eventi

| Evento | Quando | `detail` |
|---|---|---|
| `pwa-invito-mostrato` | il foglio compare | `{ passo, ambiente }` |
| `pwa-invito-rinviato` | «non ora», velo, o trascinato giù | `{ esplicito, giorni }` |
| `pwa-invito-spento` | «non mostrarlo più» | `{}` |
| `pwa-invito-installata` | `appinstalled` (**mai su iOS**) | `{}` |
| `pwa-invito-notifiche` | risposta al permesso | `{ esito }` |

`invito.stato` include anche `giaInstallata` (`true` | `false` | **`null` = non lo
so**) e `catturaLink` (falso su iOS).

> Su iOS `appinstalled` **non esiste**. L'unico segnale d'installazione è vedere
> la pagina ripartire in `display-mode: standalone`, che il componente rileva da
> sé. Ogni conteggio di «installazioni iOS» basato su altro è inventato.

#### Il permesso lo chiede lui, l'iscrizione la fai tu

Deliberato: il componente non sa nulla del tuo server, delle tue chiavi VAPID,
del tuo archivio. Chiede il permesso — che **deve** partire da un tocco — e ti
passa l'esito:

```js
invito.addEventListener('pwa-invito-notifiche', (ev) => {
  if (ev.detail.esito !== 'granted') return;
  // da qui in poi è casa tua: subscribe() e invio al server
});
```

---

### Tema

Si imposta dall'esterno, su `pwa-invito` o su `:root`:

```css
pwa-invito {
  --pwa-accento:       #2563eb;
  --pwa-accento-scuro: #1e3a8a;
  --pwa-su-accento:    #ffffff;
  --pwa-fondo:         #ffffff;
  --pwa-testo:         #131c33;
  --pwa-tenue:         #5d6a8a;
  --pwa-bordo:         #e4e8f2;
  --pwa-raggio:        22px;
  --pwa-ombra:         0 -8px 40px rgba(16, 24, 48, .18);
  --pwa-carattere:     system-ui, sans-serif;
}
```

Il tema scuro segue `prefers-color-scheme` da solo. Per una personalizzazione più
profonda ci sono le parti `::part(velo)`, `::part(foglio)`, `::part(maniglia)`.

Dentro il componente le variabili hanno il prefisso `--i-`, e non è un vezzo: se si
chiamassero come quelle della pagina (`--bordo`, `--testo`…), la regola della pagina
`--pwa-bordo: var(--bordo)` e quella interna `--bordo: var(--pwa-bordo)` si
richiamerebbero a vicenda sullo stesso elemento, e il browser le scarterebbe: colori
e bordi tornerebbero neri. È successo, e l'audit del 2026-10-01 l'ha trovato.

#### Accessibilità

Il foglio è una finestra modale vera: all'apertura il focus entra nel foglio, Tab
gira solo fra i suoi pulsanti, **Esc** lo chiude (come «non ora») e alla chiusura il
focus torna dov'era. Il trascinamento verso il basso ha sempre un'alternativa da
tastiera e da tocco: i pulsanti «Non ora» e «Non mostrarlo più».

---

### Prima di dire che funziona

Sul dispositivo, non in emulatore:

- [ ] Android Chrome: compare, un tocco installa
- [ ] Android Chrome: rifiutando, il pulsante **non resta acceso e morto**
      (`beforeinstallprompt` non si ripresenta nella stessa sessione)
- [ ] iPhone Safari: la freccia punta alla barra in basso, non a sé stessa
- [ ] iPad Safari: la freccia punta **in alto a destra**
- [ ] iPhone Chrome: le istruzioni portano davvero a installare **da Chrome**
- [ ] iPhone Chrome: il ripiego «apri in Safari» funziona, e se non funziona si vede
- [ ] Aperto da Instagram: dice di uscire, e non finge che si possa installare
- [ ] Trascinando il foglio verso il basso si chiude
- [ ] «Non mostrarlo più» → ricaricando non torna → `riaccendi()` lo riporta
- [ ] `prefers-reduced-motion`: la freccia si **ferma** ma resta visibile
- [ ] Android, app già installata, link aperto **da un'altra app**: si apre l'app
- [ ] Android, app già installata, pagina aperta **in Chrome**: dice «ce l'hai
      già», non ripropone l'installazione
- [ ] iPhone, app installata, link aperto da Safari: **si apre il browser** — è
      il comportamento atteso, non un difetto
- [ ] Tastiera: all'apertura il focus entra nel foglio, Tab gira solo al suo
      interno, Esc lo chiude, e il focus torna dov'era

Il punto su `prefers-reduced-motion` non è pignoleria: lì la freccia è
l'istruzione, non un ornamento. Nasconderla toglierebbe l'informazione proprio a
chi ha chiesto meno movimento.

---

Licenza MIT, come il progetto. Le decisioni d'interfaccia sono ispirate a due
progetti MIT, citati sopra; il codice è originale.
