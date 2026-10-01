# Deployment · Messa in opera

[English](#english) · [Italiano](#italiano)

---

<a id="english"></a>

## English — deploying it

Target: a Linux server with **Node 22**, **Caddy** (owning ports 80/443) and `rsync`.
The process listens on `127.0.0.1:3020` only; Caddy terminates TLS in front of it.

### 1. DNS first — it is not optional

Create an `A` record for your subdomain pointing at the server (`curl -4 ifconfig.me`
prints its IP) and wait until `dig +short your.domain` answers. Without DNS, Caddy
gets no certificate; without a valid certificate, iOS will not install the web app
and no notification will ever arrive. This is the foundation, not a finishing touch.

### 2. Run the tests

```bash
npm install && npm test
```

They prove the manifest is installable, the service worker is served from the right
place and the routes behave. They do **not** prove that a phone rings.

### 3. Install

```bash
sudo DOMINIO=your.domain VAPID_SUBJECT=mailto:you@your.domain bash deploy/deploy.sh
```

The script is idempotent — re-run it after every code change (plain
`sudo bash deploy/deploy.sh` is enough after the first time). In order it:

1. creates the system user `pwanotifiche` (no home, no shell);
2. copies the code to `/opt/pwa-notifiche` (`rsync --delete`, excluding `.env` and `data/`);
3. runs `npm ci --omit=dev` and generates the icons;
4. generates the VAPID keys **only if `.env` does not exist**, plus `TOKEN_INVIO` and
   `SESSIONE_SEGRETO` if missing — production secrets are born on the server and never
   travel through the repository;
5. installs and starts the hardened systemd unit (`ProtectSystem=strict`,
   `NoNewPrivileges`, write access to `data/` only);
6. appends the vhost to `/etc/caddy/Caddyfile` with a dated backup, `caddy validate`,
   then `reload`.

> **`.env` and `data/` are never overwritten by a deploy.** Regenerating the VAPID keys
> would invalidate *every* existing subscription (each send would fail with `403`).

### 4. The first administrator

There is no public sign-up, and the admin role can only be granted from the terminal:

```bash
cd /opt/pwa-notifiche
sudo -u pwanotifiche FILE_UTENTI=/opt/pwa-notifiche/data/utenti.json \
  FILE_ISCRIZIONI=/opt/pwa-notifiche/data/iscrizioni.json \
  node strumenti/utenti.js crea <name>           # prints the one-time password
sudo -u pwanotifiche FILE_UTENTI=/opt/pwa-notifiche/data/utenti.json \
  FILE_ISCRIZIONI=/opt/pwa-notifiche/data/iscrizioni.json \
  node strumenti/utenti.js ruolo <name> admin
```

The site forces a password change at first login; after that, users are created from
the browser at `/admin`.

### 5. Check from the server

```bash
systemctl is-active pwa-notifiche                 # active
node strumenti/banco.js verifica                  # infrastructure checklist
curl -sI https://your.domain/sw.js | grep -i service-worker-allowed   # "/"
```

### 6. Check on real phones — the only check that counts

Open `https://your.domain/laboratorio` on a laptop (token:
`sudo grep TOKEN_INVIO /opt/pwa-notifiche/.env`) and keep it open: every step on the
phone appears there within two seconds.

- **Android**: open the site → *Installa ora* → enable notifications → on `/banco`
  tap *Fra 10 secondi*, close the app and lock the screen → it must arrive.
- **iPhone**: open in Safari (or Chrome, iOS 16.4+) → Share → *Add to Home Screen* →
  **close the browser and open the app from its icon** → enable → same 10-second test.
- In the log you must see **COMPARSA SUL DISPOSITIVO** — reported by the phone. "Delivered
  to the push service" alone is not a success.

### Maintenance

| Task | Command |
|---|---|
| Update the code | `sudo bash deploy/deploy.sh` |
| Follow the logs | `journalctl -u pwa-notifiche -f` · `journalctl -u caddy -n 50` |
| Users and devices | `node strumenti/utenti.js elenca` (with the `FILE_*` variables above) |
| Rotate the broadcast token | edit `TOKEN_INVIO` in `/opt/pwa-notifiche/.env`, restart |
| VAPID key leaked | `genera-vapid.js --forza`, empty `data/iscrizioni.json`, restart — every device must re-enable |
| Remove everything | `systemctl disable --now pwa-notifiche`, delete the unit and `/opt/pwa-notifiche`, remove the vhost, then the DNS record |

Remove the DNS record too when you take it down: a subdomain pointing at a dead service
stays in the public Certificate Transparency logs and keeps attracting scanners.

---

<a id="italiano"></a>

## Italiano — messa in opera

Server `<IP-DEL-SERVER>` (lo stampa `curl -4 ifconfig.me`) · cartella di lavoro
la cartella del progetto · destinazione `/opt/pwa-notifiche`
· dominio `pwa.example.com`

Dieci minuti, di cui otto di attesa del DNS.

---

### 0. Prima di cominciare

Serve accesso `root` sul server. Sono gia' presenti e non vanno installati:
`node` (v22), `npm`, `caddy` (che possiede le porte 80 e 443 — `nginx` resta
spento), `rsync`.

La porta interna e' la **3020**. Se un domani risultasse occupata, si cambia in
tre punti coerenti: `deploy/pwa-notifiche.service`, `deploy/caddy-vhost.conf` e
il valore di riserva in `server.js`.

---

### 1. Il record DNS — si fa per primo, e non e' facoltativo

Il dominio `example.com` sta su IONOS (`ns1125.ui-dns.com` e compagni) e
**non ha un record jolly**: ogni sottodominio esiste solo se qualcuno lo crea.

Nel pannello IONOS, sezione DNS di `example.com`, si aggiunge:

| Tipo | Nome | Valore | TTL |
|---|---|---|---|
| `A` | `pwa` | `<IP-DEL-SERVER>` | 3600 (o il minimo offerto) |

Si verifica dal server, e si aspetta finche' non risponde:

```bash
dig +short pwa.example.com
# deve stampare <IP-DEL-SERVER>
```

> **Perche' e' il passo 1 e non l'ultimo.** Senza DNS, Caddy non ottiene il
> certificato da Let's Encrypt. Senza un certificato valido: iOS non permette di
> aggiungere l'app alla schermata Home, il service worker non viene nemmeno
> registrato, e il pulsante delle notifiche resta spento. Non e' un dettaglio di
> rifinitura — e' la fondazione su cui poggia tutto il resto.

---

### 2. Le prove che si possono fare prima

Dalla cartella di lavoro, senza toccare la produzione:

```bash
npm install
npm test          # devono passare tutti
```

I test non dimostrano che una notifica arrivi su un telefono. Dimostrano che il
manifest e' installabile, che il service worker e' servito dal posto giusto e
che le rotte fanno quello che dicono.

---

### 3. Installazione

```bash
cd pwa-push-lab          # la cartella del progetto
sudo DOMINIO=pwa.example.com VAPID_SUBJECT=mailto:tu@tuodominio.it bash deploy/deploy.sh
```

`DOMINIO` e `VAPID_SUBJECT` servono solo al primo deploy (il dominio va nel vhost di
Caddy, il soggetto nelle chiavi VAPID); dopo, `sudo bash deploy/deploy.sh` basta.

Lo script, in ordine: crea l'utente di sistema `pwanotifiche` → copia il codice
in `/opt/pwa-notifiche` → `npm ci --omit=dev` → genera le icone → **genera le
chiavi VAPID solo se `.env` non esiste** → genera `TOKEN_INVIO` e `SESSIONE_SEGRETO`
se mancano → installa e avvia il servizio systemd
→ aggiunge il blocco a `/etc/caddy/Caddyfile` (con backup datato e `caddy
validate` prima del `reload`).

E' idempotente: si rilancia a ogni modifica del codice.

> **`.env` e `data/` non vengono mai sovrascritti da un deploy.** Le chiavi di
> produzione nascono sul server e restano li'; rigenerarle invaliderebbe *tutte*
> le iscrizioni gia' raccolte, perche' i dispositivi sono legati alla vecchia
> chiave pubblica e ogni invio fallirebbe con `403`.

#### Il primo amministratore

Il sito notizie non ha registrazione pubblica, e il ruolo di amministratore si
assegna solo da qui:

```bash
cd /opt/pwa-notifiche
sudo -u pwanotifiche FILE_UTENTI=/opt/pwa-notifiche/data/utenti.json \
  FILE_ISCRIZIONI=/opt/pwa-notifiche/data/iscrizioni.json \
  node strumenti/utenti.js crea <nome>          # stampa la password iniziale
sudo -u pwanotifiche FILE_UTENTI=/opt/pwa-notifiche/data/utenti.json \
  FILE_ISCRIZIONI=/opt/pwa-notifiche/data/iscrizioni.json \
  node strumenti/utenti.js ruolo <nome> admin
```

Al primo accesso il sito obbliga a cambiare la password; da lì gli altri utenti si
creano dal browser, su `/admin`.

---

### 4. Verifica dal server

```bash
systemctl is-active pwa-notifiche          # atteso: active
curl -s localhost:3020/api/stato           # atteso: {"pushAttivo":true,...}
curl -sI https://pwa.example.com/sw.js | grep -i service-worker-allowed
# atteso: Service-Worker-Allowed: /
```

Se il certificato non c'e' ancora, si guarda Caddy: `journalctl -u caddy -n 30`.
Quasi sempre il motivo e' il passo 1.

---

### 5. Prepara lo strumento — prima di toccare i telefoni

Il verbale delle prove si guarda da un altro schermo. Prendi il token:

```bash
sudo grep TOKEN_INVIO /opt/pwa-notifiche/.env
```

Poi, su un portatile, apri **<https://pwa.example.com/laboratorio>** e
incollalo. Oppure dal terminale del server:

```bash
node strumenti/banco.js segui     # il verbale in tempo reale
```

Da qui in poi ogni cosa che succede sui telefoni compare lì entro due secondi.
Senza, l'unica fonte sarebbe il racconto di chi tiene in mano il telefono.

---

### 6. Verifica su Android

1. Apri `https://pwa.example.com` in Chrome ed entra con il tuo utente.
2. Deve comparire il foglio **«Aggiungi Notizie alla schermata Home»** con un pulsante.
3. Un tocco su *Installa ora* → l'icona compare sulla schermata Home.
4. Apri l'app **dall'icona**, tocca *Attiva le notifiche*, concedi il permesso.
5. Su `/banco` tocca **«Fra 10 secondi»**, poi chiudi l'app e blocca lo schermo.
   (Oppure, sul sito notizie, *Mandamene una adesso* su una categoria accesa.)
6. La notifica deve arrivare **a schermo spento**. Nel verbale compare
   `🎉 COMPARSA SUL DISPOSITIVO` con il ritardo misurato.

---

### 7. Verifica su iPhone — e' questa che conta

1. Apri `https://pwa.example.com` in Safari — o, da iOS 16.4, anche in Chrome, Edge o Firefox.
2. Il riquadro deve dire *«Aggiungila alla schermata Home»* con i tre passaggi,
   e il pulsante delle notifiche deve essere **spento con la spiegazione**.
   Questa e' la controprova: se il pulsante fosse acceso, non funzionerebbe.
3. Condividi (⤴) → *Aggiungi a Home* → *Aggiungi*.
4. **Chiudi il browser** e apri l'app dalla nuova icona.
5. Ora il riquadro di installazione e' sparito e *Attiva le notifiche* e' acceso.
   Toccalo, concedi il permesso.
6. Su `/banco`: *«Fra 10 secondi»* → chiudi l'app → la notifica deve arrivare a schermo spento.
   Il verbale lo conferma da solo: non serve fidarsi dell'impressione.

Se al passo 5 il pulsante e' ancora spento: l'app non e' stata aperta dall'icona
ma da Safari, oppure il sistema e' precedente a iOS 16.4.

---

### 8. Verifica finale

- [ ] `dig +short pwa.example.com` → `<IP-DEL-SERVER>`
- [ ] `systemctl is-active pwa-notifiche` → `active`
- [ ] `https://pwa.example.com` si apre con il lucchetto
- [ ] Android: installata in un tocco, notifica ricevuta ad app chiusa
- [ ] iPhone in Safari: pulsante notifiche **spento**, con la spiegazione
- [ ] iPhone installata: notifica ricevuta ad app chiusa
- [ ] `node strumenti/banco.js verifica` → tutti i controlli verdi
- [ ] nel verbale c'e' almeno una riga `notifica-mostrata` per ciascun telefono
- [ ] Gli esiti reali — **compresi i fallimenti** — annotati nel verbale delle prove

---

### Manutenzione

**Aggiornare il codice**

```bash
sudo bash deploy/deploy.sh
```

**Vedere cosa succede**

```bash
journalctl -u pwa-notifiche -f
journalctl -u caddy -n 50            # per i problemi di certificato
```

**Chi e' iscritto, e cosa e' successo**

```bash
node strumenti/banco.js stato
node strumenti/banco.js registro
sudo cat /opt/pwa-notifiche/data/iscrizioni.json   # contiene endpoint reali
sudo tail -f /opt/pwa-notifiche/data/registro.jsonl
```

**Cambiare il token dell'invio collettivo.** Il `deploy.sh` ne genera uno da se';
si cambia se e' trapelato. `/api/invia` e `/api/registro` restano chiusi anche se
il token e' vuoto: non c'e' configurazione che li apra per errore.

```bash
sudo sed -i "s|^TOKEN_INVIO=.*|TOKEN_INVIO=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)|" /opt/pwa-notifiche/.env
sudo systemctl restart pwa-notifiche
sudo grep TOKEN_INVIO /opt/pwa-notifiche/.env
```

Il pulsante di prova dentro la PWA continua a funzionare: usa `/api/prova`, che
spedisce solo al dispositivo che lo chiede e non ha mai avuto bisogno del token.

**Svuotare il verbale fra due sessioni di prova**

```bash
sudo -u pwanotifiche rm -f /opt/pwa-notifiche/data/registro.jsonl
```

Le iscrizioni dei dispositivi non vengono toccate.

**Rigenerare le chiavi VAPID** (solo se la privata e' trapelata):

```bash
cd /opt/pwa-notifiche
sudo -u pwanotifiche node strumenti/genera-vapid.js --forza
sudo -u pwanotifiche bash -c 'echo "[]" > data/iscrizioni.json'   # obbligatorio
sudo systemctl restart pwa-notifiche
```

Tutti i dispositivi dovranno riattivare le notifiche dall'app.

**Smontare tutto**

```bash
sudo systemctl disable --now pwa-notifiche
sudo rm /etc/systemd/system/pwa-notifiche.service && sudo systemctl daemon-reload
sudo rm -rf /opt/pwa-notifiche
# togliere a mano il blocco pwa.example.com da /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

Conviene togliere anche il record DNS su IONOS: un sottodominio che punta a un
servizio spento resta comunque nei log pubblici di Certificate Transparency e
continua ad attirare scanner.
