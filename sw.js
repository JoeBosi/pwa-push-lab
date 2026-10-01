/*
 * Service worker — il pezzo che riceve le notifiche.
 *
 * Deve stare nella RADICE del sito: lo scope di un service worker non puo'
 * risalire sopra la cartella da cui e' stato scaricato. Il server lo espone su
 * /sw.js con l'header Service-Worker-Allowed: / (vedi server.js).
 *
 * REGOLA CHE NON SI PUO' VIOLARE
 * Ogni evento `push` deve concludersi con una notifica visibile.
 * Se il gestore non chiama showNotification(), Safari REVOCA l'iscrizione e
 * Chrome mostra al posto tuo "questo sito e' stato aggiornato in background".
 * Per questo qui sotto non esiste un solo ramo che esca senza mostrare qualcosa:
 * anche il payload illeggibile produce una notifica.
 */

const CACHE = 'pwa-notifiche-v2';

// Solo il guscio dell'interfaccia. Niente API, niente risposte dinamiche.
const STATICI = [
  '/stile.css',
  '/notizie.css',
  '/js/notizie.js',
  '/componente/pwa-invito.js',
  '/manifest.webmanifest',
  '/icone/icona-192.png',
  '/icone/icona-512.png',
];

self.addEventListener('install', (event) => {
  // Il precaricamento non deve poter bloccare l'installazione: se una risorsa
  // non si scarica, il service worker deve comunque attivarsi, altrimenti si
  // resta senza gestore push per colpa di un'icona.
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(STATICI))
      .catch((e) => console.warn('[sw] precaricamento parziale:', e))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(
        chiavi.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      // clients.claim: la pagina gia' aperta passa subito sotto questo service
      // worker, senza aspettare un ricaricamento. Serve perche' l'utente possa
      // iscriversi nella stessa visita in cui ha installato l'app.
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Le PAGINE non si mettono mai in cache: ora sono personali. Una home in
  // cache mostrerebbe le notizie e il nome di un utente a chi e' entrato dopo
  // di lui sullo stesso telefono, o a chi ha appena fatto logout.
  if (req.mode === 'navigate' || req.destination === 'document') return;
  // Le API non si mettono MAI in cache: una risposta vecchia di /api/stato
  // farebbe mentire il pannello diagnostico, che e' l'unica cosa che qui deve
  // dire la verita'.
  if (url.pathname.startsWith('/api/')) return;
  // Nemmeno lo strumento di misura ne' il documento di architettura: devono
  // arrivare dal server ogni volta, e non hanno niente a che fare con l'app
  // installata. Un documento tecnico servito dalla cache non dichiara di essere
  // vecchio, e qui descrive limiti di piattaforma che cambiano.
  if (url.pathname.startsWith('/laboratorio')) return;
  if (url.pathname.startsWith('/architettura')) return;
  if (url.pathname.startsWith('/comunicazione')) return;

  event.respondWith(
    caches.match(req).then((salvata) => {
      const dalla_rete = fetch(req).then((risposta) => {
        if (risposta && risposta.status === 200 && risposta.type === 'basic') {
          const copia = risposta.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return risposta;
      }).catch(() => salvata);

      // Prima la cache (l'app si apre anche offline), la rete aggiorna dietro.
      return salvata || dalla_rete;
    })
  );
});

/* ------------------------------------------------------------- notifiche -- */

self.addEventListener('push', (event) => {
  let dati = {};
  try {
    // event.data e' null se il push arriva senza payload: succede, ed e' uno dei
    // casi in cui una notifica va mostrata lo stesso.
    dati = event.data ? event.data.json() : {};
  } catch (e) {
    // Payload non JSON: si prova come testo semplice. Non si esce di qui senza
    // aver mostrato niente, vedi la regola in cima al file.
    try { dati = { testo: event.data.text() }; } catch (e2) { dati = {}; }
  }

  const titolo = dati.titolo || 'Notifica';
  const opzioni = {
    body: dati.testo || 'Notifica ricevuta senza contenuto.',
    icon: '/icone/icona-192.png',
    badge: '/icone/icona-192.png',
    // tag + renotify: piu' prove di fila sostituiscono la notifica precedente
    // invece di impilarne dieci, ma il telefono avvisa comunque ogni volta.
    tag: 'prova-push',
    renotify: true,
    data: { url: dati.url || '/', inviata: dati.inviata || null },
  };

  // Il ritardo fra la partenza dal server e la comparsa sullo schermo: e' la
  // misura che questo banco di prova esiste per raccogliere. Il server sa di
  // aver consegnato al servizio push; solo il dispositivo sa se e' arrivata.
  var ritardoMs = dati.inviata ? (Date.now() - new Date(dati.inviata).getTime()) : null;

  // waitUntil e' obbligatorio: senza, il browser puo' terminare il service
  // worker prima che showNotification() abbia finito, e la notifica sparisce.
  // L'annotazione viene DOPO ed e' agganciata alla stessa attesa, ma un suo
  // fallimento non deve impedire la notifica: e' lo strumento di misura a
  // dipendere dall'esperimento, mai il contrario.
  event.waitUntil(
    self.registration.showNotification(titolo, opzioni)
      .then(function () {
        // Due destinatari, due scopi diversi. Al SERVER per il verbale, che deve
        // registrare la comparsa anche se nessuna pagina e' aperta. Alle PAGINE
        // aperte perche' possano confermarlo a schermo senza ricaricare: se
        // l'utente riapre l'app dopo la prova, trova la conferma gia' li'.
        avvisaLePagine(ritardoMs);
        return annota('notifica-mostrata', { ritardoMs: ritardoMs });
      })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destinazione = (event.notification.data && event.notification.data.url) || '/';

  annota('notifica-toccata', {});

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((finestre) => {
      // Se l'app e' gia' aperta si riporta in primo piano quella: aprire una
      // seconda copia della stessa web app confonde e su iOS non e' possibile.
      for (const f of finestre) {
        if (new URL(f.url).origin === self.location.origin && 'focus' in f) {
          f.navigate && f.navigate(destinazione);
          return f.focus();
        }
      }
      return self.clients.openWindow(destinazione);
    })
  );
});

// L'iscrizione puo' essere invalidata dal browser (rotazione delle chiavi lato
// servizio push). Qui si rifa' da soli, altrimenti il dispositivo smette di
// ricevere notifiche senza che nessuno se ne accorga.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    fetch('/api/chiave-pubblica')
      .then((r) => r.json())
      .then(({ chiave }) => self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(chiave),
      }))
      .then((nuova) => fetch('/api/iscrivi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iscrizione: nuova.toJSON() }),
      }))
      .catch((e) => console.error('[sw] reiscrizione fallita:', e))
  );
});

/* Avvisa le pagine aperte di questa app. Se non ce ne sono — il caso normale
   quando la notifica arriva ad app chiusa — non fa nulla e va benissimo. */
function avvisaLePagine(ritardoMs) {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(function (finestre) {
      finestre.forEach(function (f) {
        f.postMessage({ tipo: 'notifica-mostrata', ritardoMs: ritardoMs });
      });
    })
    .catch(function () { /* non e' un motivo per far fallire la notifica */ });
}

/*
 * Riferisce al registro del server cosa e' successo su questo dispositivo.
 * Non solleva mai eccezioni: uno strumento di misura che rompe l'apparecchio
 * che deve misurare e' peggio di nessuno strumento.
 */
function annota(evento, dettagli) {
  return fetch('/api/annota', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evento: evento, dettagli: dettagli || {} }),
  }).catch(function () { /* offline: la notifica e' comunque comparsa */ });
}

/* La chiave VAPID viaggia in base64url; subscribe() vuole un Uint8Array. */
function base64UrlToUint8Array(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const grezzo = atob(base64);
  const out = new Uint8Array(grezzo.length);
  for (let i = 0; i < grezzo.length; i++) out[i] = grezzo.charCodeAt(i);
  return out;
}
