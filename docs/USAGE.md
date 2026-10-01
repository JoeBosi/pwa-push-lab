# Usage guide · Guida d'uso

[English](#english) · [Italiano](#italiano)

---

<a id="english"></a>

## English

Three readers, three sections: [people using the news site](#users),
[the administrator](#admin), and [developers](#developers) who want to run or reuse it.
The site itself is in Italian; button names are quoted here as they appear on screen.

<a id="users"></a>

### 1. Using the news site

#### First login

1. Open the site and sign in with the user name and the **initial password** the
   administrator gave you.
2. You are asked to choose your own password (at least 8 characters, different from
   the initial one). Until you do, you cannot do anything else — the initial
   password travelled through a chat or an email, and must stop working.

#### Install the app — required on iPhone

On iPhone, notifications reach **only the app installed on the Home Screen**, never a
browser tab. The site shows the right instructions for your browser by itself.

| Where you are | What to do |
|---|---|
| iPhone/iPad, Safari | Share (square with arrow) → *Add to Home Screen* → *Add*. An animated arrow points at the Share button. |
| iPhone, Chrome / Edge / Firefox (iOS 16.4+) | Share or the browser menu → *Add to Home Screen*. If your browser lacks it, use *Open in Safari*. |
| Inside Instagram, WhatsApp, Facebook… | Leave the in-app browser (*Open in browser*): from there installing is impossible. |
| Android, Chrome | Tap *Installa ora* — one tap. |

Then **close the browser and open the app from its new icon**.

#### Enable notifications

Tap *Attiva le notifiche*. The phone asks for permission **once**: if you answer
*Don't allow*, it will not ask again and you must re-enable it in the system settings
(iPhone: *Settings → Notifications → Notizie*; Android/desktop: the lock icon next to
the address → *Notifications*).

#### Fill in the grid

For each category — politics, financial markets, sport, wars and macroeconomics —
choose *No*, *5 min*, *Ogni ora* (hourly), *Ogni giorno* (daily) or *Ogni settimana*
(weekly). Changes are saved immediately.

- The frequency is a **maximum**: if nothing new is published in that interval, you
  receive nothing.
- Categories that fall due together arrive in **one** notification
  ("4 notizie per te", one line per category).
- *Mandamene una adesso* sends you a digest right away, to check that everything works.
- Tapping a notification opens the app on that category's news — or on all your news, for a grouped digest.

#### Sign out

*Esci* removes **all** your devices from the server: they stop receiving your news.
Always sign out on a shared or borrowed phone.

<a id="admin"></a>

### 2. Administering

#### Becoming administrator

The admin role is granted **only from the server terminal**, never from the browser —
a stolen admin session could create users, but not more administrators:

```bash
sudo -u pwanotifiche FILE_UTENTI=/opt/pwa-notifiche/data/utenti.json \
  FILE_ISCRIZIONI=/opt/pwa-notifiche/data/iscrizioni.json \
  node /opt/pwa-notifiche/strumenti/utenti.js ruolo <name> admin
```

#### Managing users at `/admin`

| Action | What happens |
|---|---|
| *Crea utente* | The server generates an initial password and shows it **once**: it is not stored in clear and cannot be read again. Send it to the person; they must change it at first login. |
| *Nuova password* | New initial password, and **all sessions** of that user are closed. |
| *Elimina* | Removes the user and their devices. You cannot delete yourself, and the last administrator cannot lose the role — nobody gets locked out. |

The same from the terminal: `node strumenti/utenti.js crea|reimposta|elenca|elimina|ruolo`.

#### Watching what happens

- **`/laboratorio`** — the live event log, refreshed every 2 seconds: logins, grid
  changes, feed reads, digests sent, and — the line that matters — *COMPARSA SUL
  DISPOSITIVO*, reported by the phone itself. Requires `TOKEN_INVIO`
  (`sudo grep TOKEN_INVIO /opt/pwa-notifiche/.env`).
- **`node strumenti/banco.js segui`** — the same log in the terminal.
- **`/banco`** — the original technical test bench: send yourself a push now or in
  10 seconds (close the app and lock the screen: that is the real test).

<a id="developers"></a>

### 3. For developers

#### Run it locally

```bash
npm install
VAPID_SUBJECT=mailto:you@example.com npm run chiavi
npm run icone
npm test
npm start   # http://127.0.0.1:3020
```

To try it on a phone you need HTTPS with a valid certificate: see
[`deploy/README.md`](../deploy/README.md).

#### Reuse the install prompt

[`componente/pwa-invito.js`](../componente/README.md) is one file with no
dependencies:

```html
<script type="module" src="/componente/pwa-invito.js"></script>
<pwa-invito nome-app="My App" icona="/icons/192.png"></pwa-invito>
```

It asks for notification permission; **subscribing is up to you**, because only your
code knows your server:

```js
document.querySelector('pwa-invito').addEventListener('pwa-invito-notifiche', (ev) => {
  if (ev.detail.esito === 'granted') { /* pushManager.subscribe(), then POST it */ }
});
```

#### Build only the push backend

The minimal server — four routes, about 150 lines — is explained step by step, with
copyable code, at `/comunicazione` on your deployment ([source](../public/comunicazione.htm), Italian). Section 8
covers per-user messages and the two traps that deliver them to the wrong person:
trusting a `userId` sent by the client, and not unsubscribing on logout.

#### Add a news category

1. `lib/utenti.js` → add the id to `CATEGORIE`.
2. `lib/notizie.js` → add its feeds to `FEED` and its label to `ETICHETTE`.
3. Run the tests. Existing users get the new category switched off.

Verify a feed before adding it (`curl -sL <url> | head`): some answer but mix unrelated
content.

#### Where things are

| Need | File |
|---|---|
| Frequencies | `FREQUENZE` in `lib/utenti.js` |
| Notification text | `componi` / `componiGruppo` in `lib/pianificatore.js` |
| Feed read interval | `LETTURA_FEED_MS` in `lib/pianificatore.js` |
| Security middleware | top of `server.js` (CSRF) and `soloUtenti` / `soloAdmin` |
| What the service worker caches | `STATICI` and the `fetch` handler in `sw.js` |

### 4. Troubleshooting

| Symptom | Most likely cause |
|---|---|
| On iPhone the *Attiva* button is greyed out | You opened the site in the browser, not from the Home Screen icon. |
| Permission never asked on iPhone | Same as above, or iOS older than 16.4. |
| `/laboratorio` shows *consegnata* but never *COMPARSA* | Apple/Google accepted it; the phone was offline or notifications are muted for the app. |
| Every send fails with `403` | Subscriptions were made with a different VAPID key pair: re-enable from the device. |
| No digests even with the grid filled in | Nothing new since the last one (frequency is a maximum), or no device enabled. |
| The installed iPhone app still shows the old name | iOS freezes name and icon at install time; remove and re-add it. Android updates them within about a day. |

---

<a id="italiano"></a>

## Italiano

Tre lettori, tre sezioni: [chi usa il sito notizie](#utenti),
[l'amministratore](#amministratore) e [chi sviluppa](#sviluppo) e vuole avviarlo o
riusarlo.

<a id="utenti"></a>

### 1. Usare il sito notizie

#### Primo accesso

1. Apri il sito ed entra con il nome utente e la **password iniziale** ricevuti
   dall'amministratore.
2. Ti viene chiesto di sceglierne una tua (almeno 8 caratteri, diversa da quella
   iniziale). Finché non lo fai non puoi fare altro: la password iniziale è passata da
   una chat o da una email, e deve smettere di valere.

#### Installare l'app — obbligatorio su iPhone

Su iPhone le notifiche arrivano **solo all'app installata sulla schermata Home**, mai
a una scheda del browser. Il sito mostra da solo le istruzioni giuste per il tuo
browser.

| Dove sei | Che cosa fare |
|---|---|
| iPhone/iPad, Safari | Condividi (il quadrato con la freccia) → *Aggiungi a Home* → *Aggiungi*. Una freccia animata indica il pulsante. |
| iPhone, Chrome / Edge / Firefox (iOS 16.4+) | Condividi o il menu del browser → *Aggiungi a Home*. Se il tuo browser non ce l'ha, *Apri in Safari*. |
| Dentro Instagram, WhatsApp, Facebook… | Esci dal browser dell'app (*Apri nel browser*): da lì installare è impossibile. |
| Android, Chrome | Tocca *Installa ora*: un tocco. |

Poi **chiudi il browser e apri l'app dalla nuova icona**.

#### Attivare le notifiche

Tocca *Attiva le notifiche*. Il telefono chiede il permesso **una volta sola**: se
rispondi *Non consentire* non lo chiederà più, e va riattivato dalle impostazioni di
sistema (iPhone: *Impostazioni → Notifiche → Notizie*; Android/desktop: il lucchetto
accanto all'indirizzo → *Notifiche*).

#### Compilare la griglia

Per ogni categoria — politica, mercati finanziari, sport, guerre e macroeconomia —
scegli *No*, *5 min*, *Ogni ora*, *Ogni giorno* o *Ogni settimana*. Il salvataggio è
immediato.

- La frequenza è un **massimo**: se in quell'intervallo non esce niente di nuovo, non
  arriva niente.
- Le categorie che scadono insieme arrivano in **una sola** notifica («4 notizie per
  te», una riga per categoria).
- *Mandamene una adesso* manda subito un riepilogo, per verificare che tutto funzioni.
- Toccando una notifica l'app si apre sulle notizie di quella categoria — o su tutte le tue, se il riepilogo ne raggruppa più d'una.

#### Uscire

*Esci* toglie dal server **tutti** i tuoi dispositivi: smettono di ricevere le tue
notizie. Esci sempre da un telefono condiviso o prestato.

<a id="amministratore"></a>

### 2. Amministrare

#### Diventare amministratore

Il ruolo si assegna **solo dal terminale del server**, mai dal browser: una sessione
admin rubata potrebbe creare utenti, ma non altri amministratori.

```bash
sudo -u pwanotifiche FILE_UTENTI=/opt/pwa-notifiche/data/utenti.json \
  FILE_ISCRIZIONI=/opt/pwa-notifiche/data/iscrizioni.json \
  node /opt/pwa-notifiche/strumenti/utenti.js ruolo <nome> admin
```

#### Gestire gli utenti da `/admin`

| Azione | Che cosa succede |
|---|---|
| *Crea utente* | Il server genera una password iniziale e la mostra **una volta**: non è salvata in chiaro e non si può rileggere. Comunicala alla persona, che al primo accesso dovrà cambiarla. |
| *Nuova password* | Nuova password iniziale, e **tutte le sessioni** di quell'utente vengono chiuse. |
| *Elimina* | Toglie l'utente e i suoi dispositivi. Non puoi eliminare te stesso, e l'ultimo amministratore non può perdere il ruolo: nessuno resta chiuso fuori. |

Lo stesso da terminale: `node strumenti/utenti.js crea|reimposta|elenca|elimina|ruolo`.

#### Guardare che cosa succede

- **`/laboratorio`** — il verbale in tempo reale, aggiornato ogni 2 secondi: accessi,
  griglie, letture dei feed, riepiloghi inviati e — la riga che conta — *COMPARSA SUL
  DISPOSITIVO*, riferita dal telefono stesso. Serve `TOKEN_INVIO`
  (`sudo grep TOKEN_INVIO /opt/pwa-notifiche/.env`).
- **`node strumenti/banco.js segui`** — lo stesso verbale nel terminale.
- **`/banco`** — il banco di prova tecnico originale: mandati una notifica subito o fra
  10 secondi (chiudi l'app e blocca lo schermo: è quella la prova vera).

<a id="sviluppo"></a>

### 3. Per chi sviluppa

#### Avviarlo in locale

```bash
npm install
VAPID_SUBJECT=mailto:tu@esempio.it npm run chiavi
npm run icone
npm test
npm start   # http://127.0.0.1:3020
```

Per provarlo su un telefono serve HTTPS con un certificato valido: vedi
[`deploy/README.md`](../deploy/README.md).

#### Riusare l'invito all'installazione

[`componente/pwa-invito.js`](../componente/README.md) è un file solo, senza
dipendenze:

```html
<script type="module" src="/componente/pwa-invito.js"></script>
<pwa-invito nome-app="La mia app" icona="/icone/192.png"></pwa-invito>
```

Chiede il permesso alle notifiche; **l'iscrizione la fai tu**, perché solo il tuo
codice conosce il tuo server:

```js
document.querySelector('pwa-invito').addEventListener('pwa-invito-notifiche', (ev) => {
  if (ev.detail.esito === 'granted') { /* pushManager.subscribe(), poi la mandi al server */ }
});
```

#### Costruire solo il server push

Il server minimo — quattro rotte, circa 150 righe — è spiegato passo per passo, con
codice da copiare, su `/comunicazione` della tua installazione ([sorgente](../public/comunicazione.htm)). La sezione 8 tratta
i messaggi per utente e le due trappole che li fanno arrivare alla persona sbagliata:
fidarsi di un `utenteId` mandato dal client, e non disiscrivere all'uscita.

#### Aggiungere una categoria di notizie

1. `lib/utenti.js` → aggiungi l'identificativo a `CATEGORIE`.
2. `lib/notizie.js` → aggiungi i feed in `FEED` e l'etichetta in `ETICHETTE`.
3. Fai girare i test. Per gli utenti esistenti la nuova categoria parte spenta.

Prova un feed prima di aggiungerlo (`curl -sL <url> | head`): alcuni rispondono ma
mescolano contenuti che non c'entrano.

#### Dove stanno le cose

| Che cosa | File |
|---|---|
| Frequenze | `FREQUENZE` in `lib/utenti.js` |
| Testo delle notifiche | `componi` / `componiGruppo` in `lib/pianificatore.js` |
| Intervallo di lettura dei feed | `LETTURA_FEED_MS` in `lib/pianificatore.js` |
| Difese delle rotte | inizio di `server.js` (CSRF) e `soloUtenti` / `soloAdmin` |
| Cosa mette in cache il service worker | `STATICI` e il gestore `fetch` in `sw.js` |

### 4. Se qualcosa non va

| Sintomo | Causa più probabile |
|---|---|
| Su iPhone il pulsante *Attiva* è spento | Hai aperto il sito nel browser, non dall'icona sulla Home. |
| Su iPhone il permesso non viene mai chiesto | Come sopra, oppure iOS precedente alla 16.4. |
| `/laboratorio` dice *consegnata* ma mai *COMPARSA* | Apple o Google l'hanno accettata; il telefono era offline o le notifiche sono silenziate per l'app. |
| Ogni invio fallisce con `403` | Le iscrizioni sono state fatte con un'altra coppia di chiavi VAPID: riattiva dal dispositivo. |
| Nessun riepilogo anche con la griglia compilata | Niente di nuovo dall'ultimo (la frequenza è un massimo), o nessun dispositivo attivato. |
| L'app installata su iPhone ha ancora il nome vecchio | iOS fissa nome e icona all'installazione: va tolta e rimessa. Android li aggiorna entro circa un giorno. |
