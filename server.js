/*
 * PWA di prova per le notifiche push — server.
 *
 *   Browser ──HTTPS──> Caddy ──> qui (solo loopback) ──web-push──> FCM / APNs
 *                                                                     │
 *                        notifica sul telefono <───────────────────────┘
 *
 * Il server fa tre cose e nient'altro:
 *   1. serve la pagina, il manifest e il service worker;
 *   2. tiene l'elenco dei dispositivi iscritti;
 *   3. quando glielo si chiede, spedisce una notifica a tutti.
 *
 * Non c'e' login: e' un banco di prova pubblico e non custodisce nulla di
 * personale oltre agli endpoint push di chi ha scelto di iscriversi.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const webpush = require('web-push');

const iscrizioni = require('./lib/iscrizioni');
const registro = require('./lib/registro');
const utenti = require('./lib/utenti');
const sessione = require('./lib/sessione');
const notizie = require('./lib/notizie');
const pianificatore = require('./lib/pianificatore');

/* --------------------------------------------------------- configurazione -- */

// Un .env minimale letto a mano: aggiungere "dotenv" per venti righe di parsing
// non vale una dipendenza in piu' in un progetto che ne ha due.
(function caricaEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const riga of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = riga.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
})();

const PORT = Number(process.env.PORT) || 3020;
// Dietro Caddy il processo NON deve essere raggiungibile da fuori: si lega solo
// al loopback. HOST=0.0.0.0 serve per provarlo da un telefono in rete locale.
const HOST = process.env.HOST || '127.0.0.1';
const CHIAVE_PUBBLICA = process.env.VAPID_PUBLIC_KEY || '';
const CHIAVE_PRIVATA = process.env.VAPID_PRIVATE_KEY || '';
// Il soggetto VAPID identifica chi gestisce il sito verso Google e Apple. Va
// messo nel .env: il valore qui sotto e' solo un segnaposto, e Apple puo'
// rifiutare un soggetto che non porta a nessuno (avviso all'avvio).
const SOGGETTO = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const TOKEN_INVIO = process.env.TOKEN_INVIO || '';

const pushAttivo = Boolean(CHIAVE_PUBBLICA && CHIAVE_PRIVATA);
if (pushAttivo) {
  webpush.setVapidDetails(SOGGETTO, CHIAVE_PUBBLICA, CHIAVE_PRIVATA);
} else {
  // Il sito resta in piedi lo stesso: la pagina diagnostica deve poter dire
  // "mancano le chiavi", che e' molto piu' utile di un server che non parte.
  console.error('ATTENZIONE: chiavi VAPID assenti. Le push sono disattivate.');
  console.error('Genera le chiavi con:  node strumenti/genera-vapid.js');
}

/* ------------------------------------------------------------------ app --- */

const app = express();
app.disable('x-powered-by');
// I payload sono minuscoli: il tetto basso e' la difesa piu' semplice contro
// qualcuno che prova a riempire il disco con iscrizioni gonfiate.
app.use(express.json({ limit: '32kb' }));

/*
 * Difesa dalle richieste incrociate (CSRF) sulle rotte che cambiano qualcosa.
 * Il cookie e' gia' SameSite=Lax, che da solo blocca le POST da altri siti;
 * questo e' il secondo strato, perche' sulla sicurezza un solo strato e' una
 * scommessa:
 *  - se il browser dichiara un'origine, dev'essere la nostra;
 *  - il corpo dev'essere JSON: un modulo HTML di un altro sito non puo'
 *    mandarlo senza passare dal preflight CORS, che qui non e' mai concesso.
 * Gli strumenti da terminale (banco.js) non mandano Origin e passano: sono
 * comunque fermati dal token o dalla sessione.
 */
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origine = req.get('origin');
  if (origine) {
    let ospite = null;
    try { ospite = new URL(origine).host; } catch (e) { /* origine malformata */ }
    if (ospite !== req.get('host')) return res.status(403).json({ errore: 'origine non ammessa' });
  }
  if (!req.is('application/json')) return res.status(415).json({ errore: 'serve un corpo JSON' });
  next();
});

/*
 * Il service worker DEVE essere servito dalla radice.
 * Lo scope di un service worker non puo' risalire sopra la cartella da cui e'
 * stato scaricato: da /js/sw.js controllerebbe solo /js/. Si serve quindi qui,
 * esplicitamente, e non tramite express.static.
 */
app.get('/sw.js', (req, res) => {
  res.set({
    'Content-Type': 'application/javascript; charset=utf-8',
    // Senza questo il browser puo' servire per ore un service worker vecchio, e
    // una correzione al gestore push sembrerebbe non avere alcun effetto.
    'Cache-Control': 'no-cache, max-age=0',
    'Service-Worker-Allowed': '/',
  });
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// Indirizzo comodo per lo strumento: /laboratorio invece di /laboratorio.html.
// Non va in cache: uno strumento di misura che mostra dati vecchi e' peggio di
// uno strumento assente, perche' non si sa che sta mentendo.
app.get('/laboratorio', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'laboratorio.html'));
});

/*
 * Il manifest viene servito da qui, non da express.static, per una sola riga:
 * `related_applications`, che abilita getInstalledRelatedApps() a riconoscere
 * questa stessa app fra quelle installate — ed e' cosi' che si smette di
 * riproporre l'installazione a chi ha gia' installato.
 *
 * Quella riga vuole un URL ASSOLUTO. Scritto a mano nel file, copiando il
 * progetto su un altro dominio smetterebbe di funzionare **in silenzio**: nessun
 * errore, solo la rilevazione che non riconosce piu' niente. Generarlo
 * dall'origine della richiesta e' cio' che rende il modello davvero portabile.
 */
app.get('/manifest.webmanifest', (req, res) => {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'manifest.webmanifest'), 'utf8'));
  } catch (e) {
    return res.status(500).json({ errore: 'manifest illeggibile' });
  }

  // Dietro Caddy la richiesta arriva in chiaro sul loopback: l'origine vera la
  // dice X-Forwarded-Proto, non req.protocol.
  const schema = req.get('x-forwarded-proto') || req.protocol;
  const origine = `${schema}://${req.get('host')}`;
  manifest.related_applications = [
    { platform: 'webapp', url: `${origine}/manifest.webmanifest` },
  ];

  res.set({
    'Content-Type': 'application/manifest+json; charset=utf-8',
    // Un manifest vecchio in cache significa un'installazione sbagliata, e su
    // Android il WebAPK ci costruisce sopra fino al prossimo aggiornamento.
    'Cache-Control': 'no-cache',
  });
  res.send(JSON.stringify(manifest, null, 2));
});

/*
 * Il documento di architettura. Indirizzo pulito e niente cache: descrive limiti
 * di piattaforma che invecchiano — su iOS cambiano a ogni major — e un documento
 * tecnico servito in una versione vecchia e' peggio di uno assente, perche' non
 * dichiara di essere vecchio.
 */
app.get('/architettura', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'architettura.html'));
});

/*
 * Le istruzioni per il sistema di comunicazione app <-> server. Estensione .htm
 * come richiesta; niente cache per lo stesso motivo del documento
 * di architettura: descrive comportamenti di piattaforma che cambiano.
 */
app.get('/comunicazione', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'comunicazione.htm'));
});

/* ═════════════════════════════════════════════════════ il sito notizie ═══ */

/**
 * L'utente della richiesta, o null. Il cookie dice chi DICE di essere; qui si
 * verifica che esista ancora e che la sua versione di sessione coincida —
 * cambiata la password, i cookie emessi prima smettono di valere ovunque.
 */
function utenteCorrente(req) {
  let s = null;
  try { s = sessione.leggi(req); } catch (e) { return null; }
  if (!s) return null;
  const u = utenti.trova(s.utenteId);
  if (!u || (u.versioneSessione || 1) !== s.versione) return null;
  return u;
}

/**
 * Guardia delle rotte riservate. Un utente con la password iniziale (passata
 * dalla chat) puo' solo cambiarla: finche' non lo fa, nient'altro e' suo.
 */
function soloUtenti(opz) {
  return (req, res, next) => {
    const u = utenteCorrente(req);
    if (!u) return res.status(401).json({ errore: 'accesso richiesto' });
    if (u.deveCambiare && !(opz && opz.ancheDaCambiare)) {
      return res.status(403).json({ errore: 'devi prima cambiare la password' });
    }
    req.utente = u;
    next();
  };
}

const pagina = (nome) => (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', nome));
};

// La home e' il sito notizie, riservato: senza accesso si va alla pagina di
// accesso, e con la password ancora da cambiare si va a cambiarla.
app.get(['/', '/index.html'], (req, res) => {
  const u = utenteCorrente(req);
  if (!u) return res.redirect(302, '/accesso');
  if (u.deveCambiare) return res.redirect(302, '/accesso?cambia=1');
  pagina('index.html')(req, res);
});
app.get('/accesso', pagina('accesso.html'));
app.get('/banco', pagina('banco.html'));

/* — accesso, con freno ai tentativi — */

// Per nome utente E per indirizzo: solo per indirizzo, chi prova da molti IP
// avrebbe tentativi infiniti su un nome; solo per nome, un estraneo potrebbe
// bloccare l'accesso a chiunque sbagliando apposta.
const tentativi = new Map();
const FINESTRA_MS = 15 * 60e3;
const MAX_TENTATIVI = 5;

function chiaveTentativi(req, nome) {
  return (req.get('x-real-ip') || req.ip) + '|' + String(nome || '').toLowerCase();
}
function bloccato(chiave) {
  const t = tentativi.get(chiave);
  if (!t) return false;
  if (Date.now() - t.dal > FINESTRA_MS) { tentativi.delete(chiave); return false; }
  return t.n >= MAX_TENTATIVI;
}
function fallito(chiave) {
  const t = tentativi.get(chiave);
  if (!t || Date.now() - t.dal > FINESTRA_MS) tentativi.set(chiave, { n: 1, dal: Date.now() });
  else t.n++;
}
setInterval(() => {
  for (const [k, t] of tentativi) if (Date.now() - t.dal > FINESTRA_MS) tentativi.delete(k);
}, FINESTRA_MS).unref();

app.post('/api/accesso', (req, res) => {
  const { nome, password } = req.body || {};
  const chiave = chiaveTentativi(req, nome);
  if (bloccato(chiave)) {
    return res.status(429).json({ errore: 'troppi tentativi: riprova fra 15 minuti' });
  }
  const u = utenti.verifica(nome, password);
  if (!u) {
    fallito(chiave);
    registro.annota('accesso-fallito', { nota: String(nome || '').slice(0, 40) });
    // Un solo messaggio per "utente inesistente" e "password sbagliata": due
    // messaggi diversi direbbero a un estraneo quali nomi esistono.
    return res.status(401).json({ errore: 'nome o password non corretti' });
  }
  tentativi.delete(chiave);
  sessione.crea(res, u.id, utenti.versioneSessione(u.id), req);
  registro.annota('accesso', { utente: u.nome, nota: u.deveCambiare ? 'password da cambiare' : undefined });
  res.json({ ok: true, deveCambiare: u.deveCambiare });
});

app.post('/api/password', soloUtenti({ ancheDaCambiare: true }), (req, res) => {
  const { attuale, nuova } = req.body || {};
  if (!utenti.verifica(req.utente.nome, attuale)) {
    return res.status(401).json({ errore: 'la password attuale non e\' corretta' });
  }
  if (String(nuova || '') === String(attuale || '')) {
    return res.status(400).json({ errore: 'la nuova password dev\'essere diversa' });
  }
  try {
    utenti.cambiaPassword(req.utente.id, nuova);
  } catch (e) {
    return res.status(400).json({ errore: e.message });
  }
  // La versione e' appena cambiata: si riemette il cookie per QUESTO
  // dispositivo, tutti gli altri restano fuori.
  sessione.crea(res, req.utente.id, utenti.versioneSessione(req.utente.id), req);
  registro.annota('password-cambiata', { utente: req.utente.nome });
  res.json({ ok: true });
});

app.post('/api/esci', (req, res) => {
  const u = utenteCorrente(req);
  if (u) {
    // Anche se la pagina non ha fatto in tempo a disiscriversi, il server toglie
    // le caselle dell'utente: meglio una notizia non recapitata che recapitata
    // sullo schermo di chi ha il telefono in mano dopo di lui.
    const tolte = iscrizioni.rimuoviPerUtente(u.id);
    registro.annota('uscita', { utente: u.nome, nota: `${tolte} dispositivi disiscritti` });
  }
  sessione.chiudi(res);
  res.json({ ok: true });
});

app.get('/api/io', soloUtenti({ ancheDaCambiare: true }), (req, res) => {
  const u = utenti.pubblico(req.utente);
  res.json({
    ...u,
    dispositivi: iscrizioni.perUtente(req.utente.id).length,
    categorie: utenti.CATEGORIE.map((c) => ({ id: c, etichetta: notizie.ETICHETTE[c] })),
    frequenze: Object.keys(utenti.FREQUENZE),
  });
});

app.put('/api/griglia', soloUtenti(), (req, res) => {
  try {
    const u = utenti.aggiornaGriglia(req.utente.id, req.body && req.body.griglia);
    registro.annota('griglia', {
      utente: u.nome,
      nota: Object.entries(u.griglia).filter(([, f]) => f).map(([c, f]) => `${c}:${f}`).join(' ') || 'tutto spento',
    });
    res.json({ ok: true, griglia: u.griglia });
  } catch (e) {
    res.status(400).json({ errore: e.message });
  }
});

app.get('/api/notizie', soloUtenti(), (req, res) => {
  const c = String(req.query.categoria || '');
  // Si mostrano le categorie scelte; se non ne ha scelta nessuna, tutte —
  // una pagina vuota non aiuta a decidere a cosa iscriversi.
  const scelte = Object.entries(req.utente.griglia || {}).filter(([, f]) => f).map(([k]) => k);
  const categorie = utenti.CATEGORIE.includes(c) ? [c] : (scelte.length ? scelte : utenti.CATEGORIE);
  res.json({
    categorie,
    voci: notizie.ultime(categorie, 60).map((v) => ({ ...v, etichetta: notizie.ETICHETTE[v.categoria] })),
    feed: notizie.statoFeed(),
  });
});

// "Mandamene uno adesso": per provare la griglia senza aspettare un'ora.
// Solo ai dispositivi di chi lo chiede, e con un freno.
const ultimoSubito = new Map();
app.post('/api/riepilogo-ora', soloUtenti(), async (req, res) => {
  const u = req.utente;
  if (Date.now() - (ultimoSubito.get(u.id) || 0) < 20e3) {
    return res.status(429).json({ errore: 'aspetta qualche secondo' });
  }
  ultimoSubito.set(u.id, Date.now());
  const c = String((req.body && req.body.categoria) || '');
  if (!utenti.CATEGORIE.includes(c)) return res.status(400).json({ errore: 'categoria non valida' });
  const voci = notizie.ultime([c], 3);
  if (!voci.length) return res.status(409).json({ errore: 'nessuna notizia in archivio per questa categoria' });
  const esito = await spedisciAUtente(u.id, pianificatore.componi(c, voci), 'riepilogo-subito');
  if (!esito.dispositivi) {
    return res.status(409).json({ errore: 'nessun dispositivo iscritto: attiva prima le notifiche' });
  }
  res.json({ ok: esito.riusciti > 0, ...esito });
});

/* ═══════════════════════════════════════════════════════ amministrazione ═══ */

/** Guardia: solo admin con la password gia' cambiata. */
function soloAdmin(req, res, next) {
  soloUtenti()(req, res, () => {
    if (req.utente.ruolo !== 'admin') {
      registro.annota('admin-negato', { utente: req.utente.nome, nota: req.method + ' ' + req.path });
      return res.status(403).json({ errore: 'riservato agli amministratori' });
    }
    next();
  });
}

app.get('/admin', (req, res) => {
  const u = utenteCorrente(req);
  if (!u) return res.redirect(302, '/accesso');
  if (u.deveCambiare) return res.redirect(302, '/accesso?cambia=1');
  // Non si dice che la pagina esiste a chi non e' admin: lo si rimanda a casa.
  if (u.ruolo !== 'admin') return res.redirect(302, '/');
  pagina('admin.html')(req, res);
});

app.get('/api/admin/utenti', soloAdmin, (req, res) => {
  res.json(utenti.leggi().map((u) => ({
    ...utenti.pubblico(u),
    dispositivi: iscrizioni.perUtente(u.id).length,
  })));
});

/*
 * Creare e reimpostare restituiscono la password iniziale UNA volta, in questa
 * risposta: non viene salvata in chiaro da nessuna parte e non si puo'
 * rileggere. L'amministratore la comunica, e al primo accesso l'utente e'
 * obbligato a cambiarla — da quel momento quella passata di mano non vale piu'.
 */
app.post('/api/admin/utenti', soloAdmin, (req, res) => {
  try {
    const password = utenti.generaPassword();
    const u = utenti.crea(req.body && req.body.nome, password);
    registro.annota('admin-crea', { utente: req.utente.nome, nota: u.nome });
    res.status(201).json({ nome: u.nome, password });
  } catch (e) {
    res.status(400).json({ errore: e.message });
  }
});

app.post('/api/admin/utenti/:nome/reimposta', soloAdmin, (req, res) => {
  try {
    const password = utenti.generaPassword();
    utenti.reimpostaPassword(req.params.nome, password);
    registro.annota('admin-reimposta', { utente: req.utente.nome, nota: req.params.nome });
    res.json({ nome: req.params.nome, password });
  } catch (e) {
    res.status(404).json({ errore: e.message });
  }
});

app.delete('/api/admin/utenti/:nome', soloAdmin, (req, res) => {
  // Eliminare se stessi da qui chiuderebbe fuori l'unico che puo' rimediare.
  if (String(req.params.nome).toLowerCase() === req.utente.nome) {
    return res.status(400).json({ errore: 'non puoi eliminare il tuo stesso account da qui' });
  }
  const id = utenti.elimina(req.params.nome);
  if (!id) return res.status(404).json({ errore: 'utente inesistente' });
  // Le sue caselle push sono dati personali quanto la password: vanno con lui.
  const tolte = iscrizioni.rimuoviPerUtente(id);
  registro.annota('admin-elimina', { utente: req.utente.nome, nota: `${req.params.nome}, ${tolte} dispositivi` });
  res.json({ ok: true, dispositivi: tolte });
});

/** A tutti i dispositivi di un utente, e solo a quelli. */
async function spedisciAUtente(utenteId, messaggio, contesto) {
  const dispositivi = iscrizioni.perUtente(utenteId);
  const carico = JSON.stringify({ ...messaggio, inviata: new Date().toISOString() });
  const esiti = await Promise.all(dispositivi.map((v) => spedisci(v, carico, contesto)));
  return { dispositivi: dispositivi.length, riusciti: esiti.filter((e) => e.ok).length };
}

/*
 * Il componente riusabile vive FUORI da public/, in componente/, perche' non e'
 * parte di questa applicazione: e' il pezzo pensato per essere copiato altrove.
 * Tenerlo separato e' cio' che impedisce che si intrecci con il resto senza che
 * nessuno se ne accorga.
 */
app.use('/componente', express.static(path.join(__dirname, 'componente'), {
  setHeaders(res) { res.set('Cache-Control', 'no-cache'); },
}));

app.use(express.static(path.join(__dirname, 'public'), {
  // index:false — la home la decide la rotta qui sopra, che controlla l'accesso.
  // Con l'indice automatico, /index.html scavalcherebbe il controllo.
  index: false,
  setHeaders(res, file) {
    // Il manifest cambia raramente ma quando cambia deve essere visto subito:
    // un manifest vecchio in cache significa un'installazione sbagliata.
    if (file.endsWith('.webmanifest')) res.set('Cache-Control', 'no-cache');
  },
}));

/* ------------------------------------------------------------------ API --- */

// La chiave PUBBLICA e' fatta per essere distribuita: serve al browser per
// legare l'iscrizione a questo mittente. Nessun segreto passa di qui.
app.get('/api/chiave-pubblica', (req, res) => {
  if (!pushAttivo) {
    return res.status(503).json({
      errore: 'chiavi VAPID non configurate sul server',
      rimedio: 'node strumenti/genera-vapid.js, poi riavvia il servizio',
    });
  }
  res.json({ chiave: CHIAVE_PUBBLICA });
});

app.post('/api/iscrivi', (req, res) => {
  const sub = req.body && req.body.iscrizione;
  if (!iscrizioni.valida(sub)) {
    return res.status(400).json({ errore: 'iscrizione non valida o incompleta' });
  }
  // L'utente dalla SESSIONE, mai dal corpo. Senza accesso l'iscrizione e'
  // anonima: serve al banco di prova, e non ricevera' mai notizie.
  const u = utenteCorrente(req);
  const esito = iscrizioni.aggiungi(sub, req.get('user-agent'), u && !u.deveCambiare ? u.id : null);
  registro.annota('iscrizione', {
    utente: u ? u.nome : undefined,
    dispositivo: registro.siglaEndpoint(sub.endpoint),
    piattaforma: iscrizioni.piattaforma(req.get('user-agent')),
    nuova: esito.nuova,
    userAgent: (req.get('user-agent') || '').slice(0, 200),
    // Il servizio push a cui e' agganciato: distingue Apple da Google, ed e'
    // la prima cosa da guardare quando funziona su un sistema e non sull'altro.
    servizio: servizioPush(sub.endpoint),
  });
  res.status(esito.nuova ? 201 : 200).json({
    ok: true,
    nuova: esito.nuova,
    totale: esito.totale,
    piattaforma: iscrizioni.piattaforma(req.get('user-agent')),
  });
});

app.post('/api/disiscrivi', (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) {
    return res.status(400).json({ errore: 'endpoint mancante' });
  }
  const esito = iscrizioni.rimuovi(endpoint);
  registro.annota('disiscrizione', {
    dispositivo: registro.siglaEndpoint(endpoint),
    rimosse: esito.rimosse,
  });
  res.json({ ok: true, ...esito });
});

app.get('/api/stato', (req, res) => {
  res.json({
    pushAttivo,
    ...iscrizioni.riepilogo(),
    protetto: Boolean(TOKEN_INVIO),
    ora: new Date().toISOString(),
  });
});

/*
 * ── I due invii, e perche' sono due ──────────────────────────────────────────
 *
 * /api/prova  spedisce SOLO al dispositivo che lo chiede. Chi chiama deve
 *             presentare il proprio endpoint push, che e' una stringa lunga e
 *             non indovinabile che il servizio push (Google, Apple) ha
 *             assegnato a quel dispositivo per questo sito: solo quel telefono
 *             ce l'ha. E' la prova di possesso che rende sicuro tenerlo aperto,
 *             perche' al massimo uno fa squillare se stesso.
 *
 * /api/invia  spedisce a TUTTI. Questo richiede sempre il token, senza
 *             eccezioni: e' l'unica rotta con cui un estraneo potrebbe far
 *             squillare i dispositivi altrui.
 *
 * Tenerle separate e' cio' che permette di avere insieme un pulsante di prova
 * funzionante sul telefono e un endpoint che nessuno puo' usare contro di te.
 */

function componiMessaggio(corpo) {
  return JSON.stringify({
    titolo: String(corpo.titolo || 'Prova riuscita').slice(0, 100),
    testo: String(corpo.testo || 'Se leggi questo, le push funzionano su questo dispositivo.').slice(0, 300),
    url: '/',
    inviata: new Date().toISOString(),
  });
}

/** Spedisce a una voce dell'archivio e riferisce cosa e' successo. */
async function spedisci(voce, carico, contesto) {
  const partita = Date.now();
  try {
    // TTL 24h: una notifica di prova piu' vecchia di un giorno non interessa
    // piu' a nessuno, e il server push puo' smettere di riprovare.
    await webpush.sendNotification(
      { endpoint: voce.endpoint, keys: voce.keys },
      carico,
      { TTL: 86400, urgency: 'high' }
    );
    registro.annota('invio-esito', {
      dispositivo: registro.siglaEndpoint(voce.endpoint),
      piattaforma: voce.piattaforma,
      servizio: servizioPush(voce.endpoint),
      ok: true,
      stato: 201,
      ms: Date.now() - partita,
      contesto: contesto || 'manuale',
    });
    return { piattaforma: voce.piattaforma, ok: true };
  } catch (e) {
    const stato = e.statusCode || 0;
    // 404/410 = quell'iscrizione non esiste piu' (app disinstallata, permesso
    // revocato). Vanno cancellate: e' l'unico modo che il protocollo offre per
    // sapere che un dispositivo se n'e' andato.
    const morta = stato === 404 || stato === 410;
    if (morta) iscrizioni.rimuovi(voce.endpoint);
    registro.annota('invio-esito', {
      dispositivo: registro.siglaEndpoint(voce.endpoint),
      piattaforma: voce.piattaforma,
      servizio: servizioPush(voce.endpoint),
      ok: false,
      stato,
      rimossa: morta,
      motivo: spiegaErrore(stato, e.message),
      ms: Date.now() - partita,
      contesto: contesto || 'manuale',
    });
    return {
      piattaforma: voce.piattaforma,
      ok: false,
      stato,
      rimossa: morta,
      motivo: spiegaErrore(stato, e.message),
    };
  }
}

// Un invio ogni 3 secondi per dispositivo. Non e' una difesa da attacchi (chi
// ha il proprio endpoint puo' solo disturbare se stesso): serve a non lasciare
// che un pulsante premuto venti volte apra venti connessioni verso Google.
const ultimoInvio = new Map();
const PAUSA_MS = 3000;

/*
 * Invio a se stessi. Aperto, e con un ritardo facoltativo: e' il ritardo che
 * rende la prova significativa: senza, la notifica arriva mentre l'app e'
 * ancora in primo piano e non si e' dimostrato niente. Con dieci secondi si fa
 * in tempo a chiudere l'app e a bloccare lo schermo.
 */
app.post('/api/prova', (req, res) => {
  if (!pushAttivo) return res.status(503).json({ errore: 'chiavi VAPID non configurate' });

  const endpoint = req.body && req.body.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) {
    return res.status(400).json({ errore: 'endpoint mancante' });
  }

  const voce = iscrizioni.leggi().find((v) => v.endpoint === endpoint);
  if (!voce) {
    return res.status(404).json({
      errore: 'questo dispositivo non risulta iscritto',
      rimedio: 'riattiva le notifiche dall\'app',
    });
  }

  const adesso = Date.now();
  const precedente = ultimoInvio.get(endpoint) || 0;
  if (adesso - precedente < PAUSA_MS) {
    return res.status(429).json({ errore: 'aspetta qualche secondo prima di riprovare' });
  }
  ultimoInvio.set(endpoint, adesso);

  const ritardo = Math.min(Math.max(Number(req.body.ritardo) || 0, 0), 60);
  const carico = componiMessaggio(Object.assign({}, req.body, {
    testo: req.body.testo || (ritardo
      ? `Arrivata ${ritardo} secondi dopo, con l'app chiusa. Le push funzionano.`
      : 'Se leggi questo, le push funzionano su questo dispositivo.'),
  }));

  registro.annota('invio-richiesto', {
    dispositivo: registro.siglaEndpoint(endpoint),
    piattaforma: voce.piattaforma,
    ritardo,
    rotta: '/api/prova',
  });

  if (ritardo === 0) {
    return spedisci(voce, carico, 'prova-immediata').then((esito) => {
      res.status(esito.ok ? 200 : 502).json({ ok: esito.ok, ritardo: 0, esito });
    });
  }

  // Si risponde SUBITO e si spedisce dopo: la risposta deve arrivare al
  // telefono prima che l'utente chiuda l'app, altrimenti vedrebbe un errore di
  // rete proprio mentre fa la cosa giusta.
  res.status(202).json({
    ok: true,
    ritardo,
    messaggio: `Invio programmato fra ${ritardo} secondi. Chiudi l'app adesso.`,
  });

  // unref: un invio in attesa non deve tenere in vita il processo durante i test.
  setTimeout(() => {
    spedisci(voce, carico, `prova-differita-${ritardo}s`).then((esito) => {
      console.log(`[prova ritardata] ${voce.piattaforma}: ${esito.ok ? 'inviata' : 'fallita — ' + esito.motivo}`);
    });
  }, ritardo * 1000).unref();
});

/*
 * Invio a tutti. Richiede SEMPRE il token: se non e' configurato la rotta e'
 * chiusa, non aperta. Un endpoint che fa squillare i telefoni altrui non deve
 * poter diventare pubblico per dimenticanza.
 */
app.post('/api/invia', async (req, res) => {
  if (!pushAttivo) return res.status(503).json({ errore: 'chiavi VAPID non configurate' });

  if (!TOKEN_INVIO) {
    return res.status(503).json({
      errore: 'invio collettivo non configurato',
      rimedio: 'imposta TOKEN_INVIO nel file .env e riavvia il servizio',
    });
  }
  const fornito = req.get('x-token-invio') || (req.body && req.body.token) || '';
  if (fornito !== TOKEN_INVIO) return res.status(401).json({ errore: 'token non valido' });

  const elenco = iscrizioni.leggi();
  if (elenco.length === 0) {
    return res.status(409).json({
      errore: 'nessun dispositivo iscritto',
      rimedio: 'apri l\'app installata sul telefono e attiva le notifiche',
    });
  }

  const carico = componiMessaggio(req.body || {});
  registro.annota('invio-richiesto', { rotta: '/api/invia', destinatari: elenco.length });
  const esiti = await Promise.all(elenco.map((v) => spedisci(v, carico, 'collettivo')));
  const riusciti = esiti.filter((e) => e.ok).length;
  res.json({ ok: riusciti > 0, inviate: riusciti, totale: esiti.length, esiti });
});

/*
 * ── L'apparato di misura ─────────────────────────────────────────────────────
 *
 * /api/annota   il DISPOSITIVO riferisce cosa ha visto: permesso concesso o
 *               negato, notifica mostrata, notifica toccata. E' il pezzo che
 *               chiude il cerchio: senza, il server sa solo di aver consegnato
 *               al servizio push, che e' una cosa diversa dall'essere arrivata.
 *               Aperto, perche' deve poter scrivere anche il service worker,
 *               che non ha modo di custodire un segreto.
 *
 * /api/registro il verbale completo. Chiuso col token: contiene modelli di
 *               telefono, versioni di sistema e orari di chi ha fatto le prove.
 */

/** Da quale servizio push dipende un endpoint. Apple o Google si comportano diversamente. */
function servizioPush(endpoint) {
  if (/\.push\.apple\.com/.test(endpoint)) return 'Apple';
  if (/fcm\.googleapis\.com|android\.googleapis\.com/.test(endpoint)) return 'Google';
  if (/mozilla\.com|mozaws\.net/.test(endpoint)) return 'Mozilla';
  if (/windows\.com|microsoft\.com/.test(endpoint)) return 'Microsoft';
  return 'altro';
}

// Solo questi nomi entrano nel registro: un elenco chiuso impedisce che una
// rotta aperta diventi un posto dove chiunque scrive testo a piacere.
const EVENTI_AMMESSI = new Set([
  'sw-registrato', 'sw-errore',
  'permesso-concesso', 'permesso-negato', 'permesso-ignorato',
  'iscrizione-creata', 'iscrizione-fallita',
  'notifica-mostrata', 'notifica-toccata',
  'app-aperta',
  // Dove la gente si ferma: senza questi il verbale sa dire se l'installazione
  // e' riuscita, ma non quante volte l'invito e' stato chiuso senza guardarlo.
  'invito-mostrato', 'invito-rinviato', 'invito-spento',
]);

const ultimaAnnotazione = new Map();

app.post('/api/annota', (req, res) => {
  const evento = req.body && req.body.evento;
  if (!EVENTI_AMMESSI.has(evento)) {
    return res.status(400).json({ errore: 'evento non riconosciuto' });
  }

  // Un evento uguale ogni mezzo secondo dallo stesso indirizzo e' rumore o
  // abuso: in entrambi i casi non aggiunge nulla al verbale.
  const chiave = (req.get('x-real-ip') || req.ip || '') + '|' + evento;
  const adesso = Date.now();
  if (adesso - (ultimaAnnotazione.get(chiave) || 0) < 500) return res.status(204).end();
  ultimaAnnotazione.set(chiave, adesso);

  const d = req.body.dettagli || {};
  registro.annota(evento, {
    origine: 'dispositivo',
    piattaforma: iscrizioni.piattaforma(req.get('user-agent')),
    dispositivo: d.endpoint ? registro.siglaEndpoint(String(d.endpoint)) : undefined,
    installata: typeof d.installata === 'boolean' ? d.installata : undefined,
    // Quanto tempo e' passato fra l'invio e la comparsa sullo schermo: e' il
    // numero che dice se le push sono immediate o se il sistema le trattiene.
    ritardoMs: Number.isFinite(Number(d.ritardoMs)) ? Number(d.ritardoMs) : undefined,
    nota: d.nota ? String(d.nota).slice(0, 200) : undefined,
    userAgent: (req.get('user-agent') || '').slice(0, 200),
  });
  res.status(204).end();
});

app.get('/api/registro', (req, res) => {
  if (!TOKEN_INVIO) {
    return res.status(503).json({
      errore: 'registro non consultabile: TOKEN_INVIO non configurato',
      rimedio: 'imposta TOKEN_INVIO nel file .env e riavvia il servizio',
    });
  }
  const fornito = req.get('x-token-invio') || req.query.token || '';
  if (fornito !== TOKEN_INVIO) return res.status(401).json({ errore: 'token non valido' });

  const quante = Math.min(Math.max(Number(req.query.quante) || 100, 1), 2000);
  res.json({ riepilogo: registro.riepilogo(), voci: registro.ultime(quante) });
});

/** Traduce i codici del protocollo Web Push in qualcosa di azionabile. */
function spiegaErrore(stato, messaggio) {
  switch (stato) {
    case 400: return 'richiesta malformata verso il servizio push';
    case 401:
    case 403: return 'chiavi VAPID non corrispondenti: l\'iscrizione e\' stata fatta con una coppia diversa. Rigenerare l\'iscrizione dal dispositivo.';
    case 404:
    case 410: return 'iscrizione non piu\' valida (app disinstallata o permesso revocato)';
    case 413: return 'payload troppo grande (il limite pratico e\' circa 4 KB)';
    case 429: return 'troppe richieste al servizio push: riprovare piu\' tardi';
    default: return messaggio || 'errore sconosciuto';
  }
}

/* ----------------------------------------------------------------- avvio -- */

if (require.main === module) {
  // Senza segreto di sessione nessuno potrebbe entrare: meglio fermarsi subito
  // con un messaggio chiaro che partire e rispondere 500 a ogni accesso.
  if (!process.env.SESSIONE_SEGRETO || process.env.SESSIONE_SEGRETO.length < 32) {
    console.error('SESSIONE_SEGRETO mancante o corto nel .env (almeno 32 caratteri).');
    process.exit(1);
  }
  if (!process.env.VAPID_SUBJECT) {
    console.error('ATTENZIONE: VAPID_SUBJECT non impostato nel .env — uso un segnaposto.');
    console.error('Mettici un mailto: o un https: veri, o Apple puo\' rifiutare gli invii.');
  }
  if (pushAttivo) pianificatore.avvia(spedisciAUtente);
  app.listen(PORT, HOST, () => {
    console.log(`PWA notifiche in ascolto su http://${HOST}:${PORT}`);
    console.log(`Push: ${pushAttivo ? 'attive' : 'DISATTIVE (mancano le chiavi VAPID)'}`);
    console.log(`Iscrizioni: ${iscrizioni.riepilogo().totale}`);
  });
}

module.exports = app;
