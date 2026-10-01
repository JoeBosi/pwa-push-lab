/*
 * Test di quello che si puo' verificare senza un telefono.
 *
 * Attenzione a cosa NON dimostrano: che il server risponda correttamente non
 * dice nulla sul fatto che una notifica arrivi su un iPhone. Vedi Regola 4 in
 * CLAUDE.md. Questi test servono a impedire le rotture stupide — un manifest
 * senza display, un service worker fuori posto, un ramo del gestore push che
 * non mostra niente — che sono la causa piu' frequente dei fallimenti muti.
 *
 * Nessun framework: node:assert e dieci righe di impalcatura.
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');

// L'archivio dei test va in una cartella usa e getta: mai toccare le iscrizioni
// vere, che sono endpoint di dispositivi reali.
const CARTELLA_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-test-'));
process.env.FILE_ISCRIZIONI = path.join(CARTELLA_TMP, 'iscrizioni.json');
process.env.FILE_REGISTRO = path.join(CARTELLA_TMP, 'registro.jsonl');
process.env.TOKEN_INVIO = 'token-di-prova-non-segreto';
// Chiavi USA E GETTA generate qui: i test non spediscono niente a nessuno, e
// impostarle prima di require('../server') impedisce che venga letto il .env
// vero, la cui chiave privata non deve mai entrare in un processo di test.
const chiaviFinte = require('web-push').generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = chiaviFinte.publicKey;
process.env.VAPID_PRIVATE_KEY = chiaviFinte.privateKey;
process.env.FILE_REGISTRO = path.join(CARTELLA_TMP, 'registro.jsonl');
process.env.TOKEN_INVIO = 'token-di-prova-non-segreto';
process.env.PORT = '0';

let passed = 0, failed = 0;
const attesi = [];
// I test sincroni girano subito; quelli che restituiscono una promessa — il
// service worker eseguito per davvero — finiscono nella coda degli altri async.
function test(nome, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') { attesi.push({ nome, fn }); return; }
    passed++; console.log(`  \x1b[32m✓\x1b[0m ${nome}`);
  } catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${nome}\n      ${e.message}`); }
}
function testAsync(nome, fn) { attesi.push({ nome, fn }); }

const leggi = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ═════════════════════════════════════════════════════════ manifest ═══ */
console.log('\nManifest — senza questi campi l\'app non e\' installabile');

const manifest = JSON.parse(leggi('public/manifest.webmanifest'));

test('ha nome, short_name e start_url', () => {
  assert.ok(manifest.name, 'manca name');
  assert.ok(manifest.short_name, 'manca short_name');
  assert.ok(manifest.start_url, 'manca start_url');
});

test('display e\' standalone o fullscreen (su iOS e\' obbligatorio)', () => {
  assert.ok(['standalone', 'fullscreen'].includes(manifest.display),
    `display = "${manifest.display}": con browser o minimal-ui iOS non la installa come web app`);
});

test('dichiara le icone 192 e 512, che sono il minimo per l\'installabilita\'', () => {
  const misure = manifest.icons.map((i) => i.sizes);
  assert.ok(misure.includes('192x192'), 'manca l\'icona 192x192');
  assert.ok(misure.includes('512x512'), 'manca l\'icona 512x512');
});

test('ha almeno un\'icona maskable (Android ritaglia a piacere)', () => {
  assert.ok(manifest.icons.some((i) => (i.purpose || '').includes('maskable')),
    'senza maskable Android incornicia l\'icona in un quadrato bianco');
});

test('dichiara handle_links: i link dentro lo scope vanno nell\'app installata', () => {
  assert.strictEqual(manifest.handle_links, 'preferred',
    'senza questo i link restano nel browser anche ad app installata (dove la cattura esiste)');
});

test('launch_handler porta la finestra esistente all\'indirizzo, non ne apre una seconda', () => {
  assert.ok(manifest.launch_handler, 'manca launch_handler');
  assert.strictEqual(manifest.launch_handler.client_mode, 'navigate-existing');
});

test('scope copre start_url', () => {
  assert.ok(manifest.start_url.startsWith(manifest.scope),
    'start_url fuori dallo scope: l\'app si aprirebbe nel browser, non come app');
});

/* ═════════════════════════════════════════════════════════════ icone ═══ */
console.log('\nIcone — devono esistere davvero ed essere PNG della misura giusta');

/** Legge larghezza e altezza dall'header IHDR, senza librerie. */
function misuraPNG(file) {
  const buf = fs.readFileSync(file);
  const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(buf.subarray(0, 8).equals(firma), `${path.basename(file)} non e' un PNG`);
  assert.strictEqual(buf.subarray(12, 16).toString('ascii'), 'IHDR',
    `${path.basename(file)}: IHDR non e' il primo blocco`);
  return { larghezza: buf.readUInt32BE(16), altezza: buf.readUInt32BE(20) };
}

for (const icona of manifest.icons) {
  test(`${icona.src} esiste ed e\' ${icona.sizes}`, () => {
    const file = path.join(ROOT, 'public', icona.src);
    assert.ok(fs.existsSync(file), `manca ${icona.src} — esegui: npm run icone`);
    const { larghezza, altezza } = misuraPNG(file);
    const [ln, al] = icona.sizes.split('x').map(Number);
    assert.strictEqual(larghezza, ln, `larghezza ${larghezza}, dichiarata ${ln}`);
    assert.strictEqual(altezza, al, `altezza ${altezza}, dichiarata ${al}`);
  });
}

test('apple-touch-icon esiste: iOS ignora il manifest per l\'icona di Home', () => {
  const file = path.join(ROOT, 'public/icone/apple-touch-icon.png');
  assert.ok(fs.existsSync(file), 'manca apple-touch-icon.png — esegui: npm run icone');
  assert.strictEqual(misuraPNG(file).larghezza, 180);
});

/* ═════════════════════════════════════════════════════════════ HTML ════ */
console.log('\nPagina — i collegamenti senza i quali il resto non serve');

const html = leggi('public/index.html');

test('collega il manifest', () => {
  assert.match(html, /<link[^>]+rel="manifest"[^>]+href="\/manifest\.webmanifest"/);
});

test('dichiara apple-touch-icon', () => {
  assert.match(html, /rel="apple-touch-icon"/);
});

test('il viewport ha viewport-fit=cover (notch e barra gesti su iPhone)', () => {
  assert.match(html, /name="viewport"[^>]*viewport-fit=cover/);
});

test('carica il componente dell\'invito', () => {
  assert.match(html, /<script[^>]+type="module"[^>]+\/componente\/pwa-invito\.js/,
    'il componente e\' un ES module: senza type="module" non si carica');
  assert.match(html, /<pwa-invito[\s>]/, 'il componente non e\' usato nella pagina');
});

test('la diagnostica a semafori NON e\' piu\' nella pagina dell\'utente', () => {
  // Vive solo in /laboratorio: era uno strumento di misura piazzato dentro
  // l'app, prezioso per chi la costruisce e rumore per chiunque altro.
  assert.ok(!/id="diagnostica"/.test(html), 'la tabella diagnostica e\' ancora qui');
});

test('la pagina offre come riaccendere un invito spento', () => {
  // Una scelta definitiva senza modo di tornare indietro non e' rispetto,
  // e' un vicolo cieco.
  assert.match(html, /id="btn-riaccendi"/);
});

/* ═══════════════════════════════ il componente riusabile ═══════════════ */
console.log('\nComponente <pwa-invito> — il modello da copiare altrove');

const componente = leggi('componente/pwa-invito.js');

test('non ha dipendenze: si copia in un altro progetto e basta', () => {
  const importazioni = componente.match(/^\s*import\s/gm) || [];
  assert.strictEqual(importazioni.length, 0,
    'un import esterno rompe la portabilita\': il file deve bastare a se stesso');
});

test('riconosce i browser in-app, che sono il caso piu\' frequente', () => {
  // Da Instagram, Facebook, WhatsApp l'aggiunta a Home NON esiste come voce di
  // menu: e' li' che l'invito serve di piu', e dove quasi nessuno lo gestisce.
  for (const app of ['Instagram', 'FBAN', 'WhatsApp', 'TikTok', 'LinkedInApp']) {
    assert.ok(componente.includes(app), `browser in-app non riconosciuto: ${app}`);
  }
});

test('distingue Safari dagli altri browser iOS, e li sa nominare', () => {
  // Su iOS sono tutti WebKit. La distinzione non serve piu' a dire "da qui non
  // si installa" — da iOS 16.4 e' falso — ma a dare le istruzioni giuste per
  // quel browser, e a chiamarlo per nome invece di dire "questo browser".
  for (const b of ['CriOS', 'FxiOS', 'EdgiOS']) {
    assert.ok(componente.includes(b), `browser iOS non distinto: ${b}`);
  }
  assert.ok(componente.includes('nomeBrowserIOS'), 'non sa come si chiama il browser');
});

test('NON afferma che su iPhone si installi solo da Safari', () => {
  // Lo diceva, ed era falso da iOS 16.4. L'errore non era innocuo: mandava a
  // fare un giro inutile chi era gia' nel posto giusto. Questo test esiste
  // perche' l'affermazione non rientri dalla finestra.
  const testoMostrato = componente.match(/e\.testo\.(?:innerHTML|textContent)\s*=[\s\S]{0,400}?;/g) || [];
  for (const t of testoMostrato) {
    assert.ok(!/solo Safari|soltanto Safari/i.test(t),
      `un testo mostrato all'utente afferma ancora "solo Safari": ${t.slice(0, 120)}`);
  }
});

test('nel browser iOS non-Safari mostra le istruzioni, e Safari solo come ripiego', () => {
  // Si ritaglia la DEFINIZIONE del metodo, non la prima occorrenza del nome:
  // quella sta nel dispatcher, piu' su, e la fetta verrebbe vuota.
  const inizio = componente.indexOf('  _scenarioIOSAltroBrowser() {');
  assert.ok(inizio > -1, 'metodo _scenarioIOSAltroBrowser non trovato');
  const dopo = componente.indexOf('\n  _scenario', inizio + 10);
  const blocco = componente.slice(inizio, dopo > -1 ? dopo : undefined);
  assert.ok(blocco.includes('_elencoPassi'), 'non da\' le istruzioni per quel browser');
  assert.ok(blocco.includes('e.secondario'),
    'il salto a Safari deve stare sul pulsante SECONDARIO: e\' un ripiego, non la strada');
  assert.ok(!blocco.includes('e.principale.onclick'),
    'il pulsante principale non deve portare fuori: si installa da qui');
});

test('offre il salto a Safari con un ripiego, non da solo', () => {
  // x-safari-https non da' alcun riscontro se fallisce: senza alternativa
  // visibile l'utente resta fermo davanti a un pulsante che non ha fatto nulla.
  assert.ok(componente.includes('x-safari-https'), 'manca il salto a Safari');
  assert.ok(componente.includes('_copiaIndirizzo'), 'manca il ripiego');
});

test('la freccia si ferma con prefers-reduced-motion ma non sparisce', () => {
  // Il movimento qui non e' decorazione: e' l'indicazione. Nasconderla
  // toglierebbe l'istruzione a chi ha chiesto meno movimento.
  const blocco = componente.slice(componente.indexOf('prefers-reduced-motion'));
  assert.match(blocco, /\.freccia[^}]*animation:\s*none/,
    'la freccia deve fermarsi sotto prefers-reduced-motion');
  assert.ok(!/\.freccia[^}]*display:\s*none/.test(blocco.slice(0, 400)),
    'la freccia non deve sparire: e\' l\'istruzione, non un ornamento');
});

test('le variabili interne del componente non si chiamano come quelle della pagina', () => {
  // Con nomi uguali, "--pwa-bordo: var(--bordo)" nella pagina e "--bordo:
  // var(--pwa-bordo)" nel componente si richiamano a vicenda sullo stesso
  // elemento: il browser le scarta e i colori tornano neri. Successo davvero.
  const stile = componente.slice(componente.indexOf('<style>'), componente.indexOf('</style>'));
  const definite = [...stile.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]);
  for (const v of definite) {
    assert.ok(v.startsWith('--i-') || v.startsWith('--pwa-'), `variabile interna senza prefisso --i-: ${v}`);
  }
});

test('il tema si cambia dall\'esterno con proprieta\' CSS', () => {
  // Il difetto che ha fatto scartare khmyznikov/pwa-install era proprio questo:
  // personalizzabile solo con --tint-color.
  for (const v of ['--pwa-accento', '--pwa-fondo', '--pwa-testo', '--pwa-carattere']) {
    assert.ok(componente.includes(v), `manca la variabile di tema ${v}`);
  }
});

test('non chiede il permesso da solo: sempre da un tocco', () => {
  const i = componente.indexOf('Notification.requestPermission');
  assert.ok(i > -1, 'non chiede mai il permesso');
  const prima = componente.slice(Math.max(0, i - 900), i);
  assert.ok(prima.includes('_chiediPermesso'),
    'la richiesta deve stare dentro il gestore del tocco');
});

test('sa riconoscere di essere gia\' installata, e non ripropone l\'installazione', () => {
  assert.ok(componente.includes('getInstalledRelatedApps'), 'nessuna rilevazione');
  assert.ok(componente.includes('_scenarioGiaInstallata'),
    'riproporre l\'installazione a chi ha gia\' installato e\' il modo piu\' rapido di sembrare rotti');
});

test('distingue «non installata» da «non lo so»', () => {
  // Su iOS la rilevazione non esiste: rispondere false invece di null vorrebbe
  // dire affermare che l'app non c'e', quando non se ne sa nulla.
  assert.match(componente, /giaInstallataAltrove[\s\S]{0,900}?return null/,
    'la funzione deve poter rispondere «non lo so»');
  assert.match(componente, /giaInstallata === true/,
    'lo scenario deve scattare solo su un sì certo, mai su un «non lo so»');
});

test('sa che su iOS la cattura dei link non esiste', () => {
  assert.match(componente, /catturaLink:\s*!iOS/,
    'su iOS ogni link va al browser, che la PWA sia installata o no');
});

test('due livelli di rifiuto, e un modo per tornare indietro', () => {
  assert.match(componente, /rinvia\(/, 'manca il rinvio temporaneo');
  assert.match(componente, /spegni\(/, 'manca lo spegnimento definitivo');
  assert.match(componente, /riaccendi\(/, 'manca il modo di riaccenderlo');
});

testAsync('/componente/pwa-invito.js e\' servito come JavaScript', async () => {
  const r = await chiama('GET', '/componente/pwa-invito.js');
  assert.strictEqual(r.stato, 200);
  assert.match(r.headers.get('content-type') || '', /javascript/);
});

/* ══════════════════════ accessibilita' (audit 2026-10-01) ══════════════ */
console.log('\nAccessibilita\' — i difetti trovati dall\'audit non devono tornare');

test('il foglio modale porta dentro il focus e si chiude con Esc', () => {
  // Dichiara aria-modal: per un lettore di schermo il resto della pagina non
  // esiste piu'. Se il focus restasse fuori, chi usa la tastiera sarebbe bloccato.
  assert.match(componente, /aria-modal="true"/);
  assert.match(componente, /ev\.key === 'Escape'/, 'Esc non chiude il foglio');
  assert.match(componente, /\.focus\(\{ preventScroll: true \}\)/, 'il focus non entra nel foglio');
  assert.match(componente, /_focusPrima/, 'alla chiusura il focus non torna dov\'era');
});

const PAGINE = ['index.html', 'accesso.html', 'admin.html', 'banco.html', 'laboratorio.html',
  'architettura.html', 'comunicazione.htm'];
for (const pg of PAGINE) {
  test(`${pg}: «salta al contenuto», e ogni campo ha un'etichetta`, () => {
    const h = leggi('public/' + pg);
    assert.match(h, /class="salta" href="#principale"/, 'manca il collegamento «salta al contenuto»');
    assert.match(h, /<main id="principale"/, 'la destinazione del salto non esiste');
    for (const m of h.matchAll(/<input[^>]*>/g)) {
      const id = (m[0].match(/id="([^"]+)"/) || [])[1];
      const prima = h.slice(Math.max(0, m.index - 200), m.index);
      const ok = /<label[^>]*>[^<]*$/.test(prima) || /<label[\s>][\s\S]*$/.test(prima.slice(prima.lastIndexOf('</label>') + 1))
        || (id && new RegExp(`for="${id}"`).test(h)) || /aria-label=/.test(m[0]);
      assert.ok(ok, `campo senza etichetta: ${m[0].slice(0, 80)}`);
    }
  });
}

test('ogni classe usata da una pagina e\' definita nei fogli che quella pagina carica', () => {
  // Rinominando una classe nei CSS (riquadro → carta) la pagina che usa ancora
  // il nome vecchio perde la grafica senza alcun errore. E' successo al
  // laboratorio, ed e' rimasto cosi' per settimane: lo ha trovato una foto.
  const fogli = {
    'index.html': ['stile.css', 'notizie.css'], 'accesso.html': ['stile.css', 'notizie.css'],
    'admin.html': ['stile.css', 'notizie.css'], 'banco.html': ['stile.css'],
    'laboratorio.html': ['stile.css', 'laboratorio.css'],
  };
  const ganci = new Set(['lab']); // classi usate solo come appiglio, senza stile voluto
  for (const [pg, css] of Object.entries(fogli)) {
    const definite = new Set(css.flatMap((f) => [...leggi('public/' + f).matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1])));
    const usate = [...leggi('public/' + pg).matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/));
    const senza = [...new Set(usate)].filter((c) => !definite.has(c) && !ganci.has(c));
    assert.deepStrictEqual(senza, [], `${pg}: classi senza stile ${senza.join(', ')}`);
  }
});

test('i fogli di stile dichiarano color-scheme e lo stato :focus-visible', () => {
  for (const f of ['public/stile.css', 'public/architettura.css']) {
    const c = leggi(f);
    assert.match(c, /color-scheme:\s*light dark/, `${f}: in tema scuro i campi resterebbero chiari`);
    assert.match(c, /:focus-visible/, `${f}: il focus da tastiera non si vede`);
  }
});

/* ══════════════════════════════════════════════════ service worker ═════ */
console.log('\nService worker — la regola che costa l\'iscrizione se violata');

const sw = leggi('sw.js');

test('sta nella radice del progetto, non in public/', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'sw.js')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'public/sw.js')),
    'una seconda copia in public/ verrebbe servita da express.static e sovrascriverebbe quella buona');
});

test('gestisce push e notificationclick', () => {
  assert.match(sw, /addEventListener\(\s*['"]push['"]/);
  assert.match(sw, /addEventListener\(\s*['"]notificationclick['"]/);
});

test('showNotification e\' dentro waitUntil (o il worker muore prima)', () => {
  assert.match(sw, /event\.waitUntil\(\s*self\.registration\.showNotification/);
});

/*
 * Qui il service worker viene ESEGUITO davvero, in un ambiente finto, e
 * bombardato con i payload che il mondo reale gli manderà. Leggere il sorgente
 * cercando la parola `return` era una supposizione; questo è un esperimento:
 * per ogni forma di payload si guarda se la notifica è comparsa.
 *
 * Non è pignoleria. Un solo evento push che non produce una notifica visibile
 * fa revocare l'iscrizione da Safari, e il guasto salterebbe fuori giorni dopo
 * su un telefono, dove nessun test arriva.
 */
function eseguiServiceWorker() {
  const vm = require('node:vm');
  const ascoltatori = {};
  const mostrate = [];

  const finto = {
    addEventListener: (nome, fn) => { ascoltatori[nome] = fn; },
    registration: {
      showNotification: (titolo, opzioni) => { mostrate.push({ titolo, opzioni }); return Promise.resolve(); },
      pushManager: { subscribe: () => Promise.resolve({ toJSON: () => ({}) }) },
    },
    clients: {
      matchAll: () => Promise.resolve([]),
      openWindow: () => Promise.resolve(),
      claim: () => Promise.resolve(),
    },
    skipWaiting: () => Promise.resolve(),
    location: { origin: 'https://esempio.invalid' },
  };

  const contesto = {
    self: finto,
    caches: {
      open: () => Promise.resolve({ addAll: () => Promise.resolve(), put: () => {} }),
      keys: () => Promise.resolve([]), match: () => Promise.resolve(null), delete: () => Promise.resolve(),
    },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ chiave: 'x' }) }),
    console, URL, Date, Promise, JSON, Uint8Array, setTimeout,
    atob: (x) => Buffer.from(x, 'base64').toString('binary'),
  };
  vm.createContext(contesto);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'), contesto);
  return { ascoltatori, mostrate };
}

// I casi che il gestore deve reggere. Gli ultimi due sono i piu' insidiosi:
// un push senza corpo e' legittimo e capita davvero.
const CASI_PUSH = [
  { nome: 'payload JSON completo', data: { json: () => ({ titolo: 'Ciao', testo: 'prova', inviata: new Date().toISOString() }) } },
  { nome: 'payload JSON senza campi', data: { json: () => ({}) } },
  { nome: 'payload di testo, non JSON', data: { json: () => { throw new Error('non e\' JSON'); }, text: () => 'ciao' } },
  { nome: 'payload illeggibile del tutto', data: { json: () => { throw new Error('rotto'); }, text: () => { throw new Error('rotto'); } } },
  { nome: 'push SENZA payload', data: null },
];

for (const caso of CASI_PUSH) {
  test(`push con ${caso.nome} → la notifica compare comunque`, async () => {
    const { ascoltatori, mostrate } = eseguiServiceWorker();
    assert.ok(ascoltatori.push, 'nessun gestore push registrato');

    let attesa = null;
    ascoltatori.push({ data: caso.data, waitUntil: (p) => { attesa = p; } });
    assert.ok(attesa, 'il gestore non ha usato waitUntil: il worker puo\' morire prima');
    await attesa;

    assert.strictEqual(mostrate.length, 1,
      `mostrate ${mostrate.length} notifiche invece di 1: con ${caso.nome} Safari revocherebbe l\'iscrizione`);
    assert.ok(mostrate[0].titolo, 'notifica senza titolo');
    assert.ok(mostrate[0].opzioni.body, 'notifica senza testo');
  });
}

test('il guscio precaricato elenca solo file che esistono davvero', () => {
  // Un file mancante qui non rompe l'installazione (c'e' il catch), ma lascia
  // il guscio incompleto e l'app non si apre offline.
  const lista = sw.match(/const STATICI = \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g)
    .map((x) => x.slice(1, -1));
  for (const r of lista) {
    if (r === '/') continue;
    const dentroPublic = fs.existsSync(path.join(ROOT, 'public', r));
    const allaRadice = fs.existsSync(path.join(ROOT, r.replace(/^\//, '')));
    assert.ok(dentroPublic || allaRadice, `il guscio elenca ${r}, che non esiste`);
  }
});

test('il service worker riferisce al registro quando MOSTRA la notifica', () => {
  // E' l'unica prova che la notifica sia arrivata: il server sa solo di averla
  // consegnata al servizio push, che e' un fatto diverso.
  assert.match(sw, /annota\(\s*['"]notifica-mostrata['"]/,
    'senza questa annotazione un fallimento sul telefono resta invisibile');
  assert.match(sw, /annota\(\s*['"]notifica-toccata['"]/);
});

test('l\'annotazione non puo\' impedire la notifica', () => {
  // showNotification() deve venire PRIMA: se l'annotazione fallisse per prima e
  // interrompesse la catena, lo strumento di misura impedirebbe l'esperimento,
  // e su Safari costerebbe l'iscrizione.
  const i = sw.indexOf('showNotification(titolo');
  const a = sw.indexOf("annota('notifica-mostrata'");
  assert.ok(i > -1 && a > i, 'l\'annotazione precede showNotification()');
  assert.match(sw, /function annota[\s\S]*?\.catch\(/, 'annota() deve assorbire i propri errori');
});

test('non mette in cache le risposte delle API', () => {
  assert.match(sw, /\/api\//,
    'il gestore fetch deve escludere esplicitamente /api/: una diagnostica in cache mentirebbe');
});

/* ═══════════════════════════════════════════════════════ iscrizioni ════ */
console.log('\nArchivio delle iscrizioni');

const iscrizioni = require('../lib/iscrizioni');
const registro = require('../lib/registro');

const finta = (n) => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/finta-' + n,
  keys: { p256dh: 'chiave-p256dh-finta', auth: 'chiave-auth-finta' },
});

test('rifiuta iscrizioni senza chiavi o con endpoint non https', () => {
  assert.ok(!iscrizioni.valida(null));
  assert.ok(!iscrizioni.valida({ endpoint: 'https://x/y' }), 'accettata senza keys');
  assert.ok(!iscrizioni.valida({ endpoint: 'http://x/y', keys: { p256dh: 'a', auth: 'b' } }),
    'accettato un endpoint in chiaro');
  assert.ok(iscrizioni.valida(finta(1)));
});

test('lo stesso endpoint aggiorna, non duplica', () => {
  iscrizioni.scrivi([]);
  const a = iscrizioni.aggiungi(finta(1), 'Mozilla/5.0 (iPhone)');
  assert.strictEqual(a.nuova, true);
  const b = iscrizioni.aggiungi(finta(1), 'Mozilla/5.0 (iPhone)');
  assert.strictEqual(b.nuova, false, 'un secondo invio ha creato un doppione');
  assert.strictEqual(b.totale, 1);
});

test('riconosce la piattaforma dallo user agent', () => {
  assert.strictEqual(iscrizioni.piattaforma('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)'), 'iOS');
  assert.strictEqual(iscrizioni.piattaforma('Mozilla/5.0 (Linux; Android 14)'), 'Android');
  assert.strictEqual(iscrizioni.piattaforma(''), 'sconosciuta');
});

test('rimuovi cancella solo l\'endpoint indicato', () => {
  iscrizioni.scrivi([]);
  iscrizioni.aggiungi(finta(1), 'iPhone');
  iscrizioni.aggiungi(finta(2), 'Android');
  const r = iscrizioni.rimuovi(finta(1).endpoint);
  assert.strictEqual(r.rimosse, 1);
  assert.strictEqual(r.totale, 1);
  assert.strictEqual(iscrizioni.leggi()[0].endpoint, finta(2).endpoint);
});

test('un file corrotto non impedisce l\'avvio', () => {
  fs.writeFileSync(process.env.FILE_ISCRIZIONI, 'non e\' JSON {{{');
  assert.deepStrictEqual(iscrizioni.leggi(), []);
});

/* ═══════════════════════════════════════════════════════════ rotte ═════ */
console.log('\nRotte HTTP');

const app = require('../server');
let server;

async function chiama(metodo, percorso, corpo) {
  const porta = server.address().port;
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (iPhone)' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const testo = await r.text();
  let json = null;
  try { json = JSON.parse(testo); } catch (e) { /* non JSON: va bene per i file */ }
  return { stato: r.status, headers: r.headers, testo, json };
}

async function chiamaConToken(metodo, percorso) {
  const porta = server.address().port;
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, {
    method: metodo,
    headers: { 'X-Token-Invio': process.env.TOKEN_INVIO },
  });
  const testo = await r.text();
  let json = null;
  try { json = JSON.parse(testo); } catch (e) { /* non JSON */ }
  return { stato: r.status, testo, json };
}

testAsync('/sw.js e\' servito dalla radice con Service-Worker-Allowed', async () => {
  const r = await chiama('GET', '/sw.js');
  assert.strictEqual(r.stato, 200);
  assert.strictEqual(r.headers.get('service-worker-allowed'), '/',
    'senza questo header lo scope del worker non copre tutto il sito');
  assert.match(r.headers.get('content-type') || '', /javascript/);
  assert.match(r.headers.get('cache-control') || '', /no-cache/,
    'un service worker in cache rende invisibile ogni correzione');
});

testAsync('/manifest.webmanifest e\' servito e non va in cache', async () => {
  const r = await chiama('GET', '/manifest.webmanifest');
  assert.strictEqual(r.stato, 200);
  assert.match(r.headers.get('cache-control') || '', /no-cache/);
  assert.match(r.headers.get('content-type') || '', /manifest\+json/);
});

testAsync('il manifest servito dichiara related_applications con l\'origine VERA', async () => {
  // Scritto a mano nel file, copiando il progetto su un altro dominio la
  // rilevazione "sono gia' installata" smetterebbe di funzionare in silenzio.
  const r = await chiama('GET', '/manifest.webmanifest');
  const rel = r.json.related_applications;
  assert.ok(Array.isArray(rel) && rel.length, 'manca related_applications');
  assert.strictEqual(rel[0].platform, 'webapp');
  const porta = server.address().port;
  assert.strictEqual(rel[0].url, `http://127.0.0.1:${porta}/manifest.webmanifest`,
    'l\'URL non corrisponde all\'origine da cui e\' stato chiesto');
});

testAsync('/api/chiave-pubblica restituisce la chiave, non la privata', async () => {
  const r = await chiama('GET', '/api/chiave-pubblica');
  assert.strictEqual(r.stato, 200);
  assert.ok(r.json.chiave, 'nessuna chiave');
  assert.ok(!r.testo.includes(process.env.VAPID_PRIVATE_KEY),
    'la chiave PRIVATA e\' finita nella risposta');
});

testAsync('ciclo completo: iscrivi → stato → disiscrivi', async () => {
  iscrizioni.scrivi([]);
  const a = await chiama('POST', '/api/iscrivi', { iscrizione: finta(9) });
  assert.strictEqual(a.stato, 201);
  assert.strictEqual(a.json.piattaforma, 'iOS');

  const s = await chiama('GET', '/api/stato');
  assert.strictEqual(s.json.totale, 1);
  assert.strictEqual(s.json.pushAttivo, true);

  const d = await chiama('POST', '/api/disiscrivi', { endpoint: finta(9).endpoint });
  assert.strictEqual(d.json.rimosse, 1);
});

testAsync('/api/iscrivi rifiuta un corpo incompleto', async () => {
  const r = await chiama('POST', '/api/iscrivi', { iscrizione: { endpoint: 'https://x' } });
  assert.strictEqual(r.stato, 400);
});

testAsync('/api/stato non espone endpoint ne\' chiavi dei dispositivi', async () => {
  iscrizioni.scrivi([]);
  await chiama('POST', '/api/iscrivi', { iscrizione: finta(7) });
  const r = await chiama('GET', '/api/stato');
  assert.ok(!r.testo.includes('fcm.googleapis.com'), 'endpoint esposto in chiaro');
  assert.ok(!r.testo.includes('chiave-auth-finta'), 'chiave di cifratura esposta');
});

/* ══════════════════════════════ i due invii, e perche' sono due ════════ */

testAsync('/api/invia SENZA token e\' rifiutato: nessuno puo\' far squillare i dispositivi altrui', async () => {
  iscrizioni.scrivi([]);
  iscrizioni.aggiungi(finta(5), 'Android');
  const r = await chiama('POST', '/api/invia', { titolo: 'x' });
  assert.strictEqual(r.stato, 401, 'l\'invio collettivo era raggiungibile senza credenziali');
});

testAsync('/api/invia con token sbagliato e\' rifiutato', async () => {
  const r = await chiama('POST', '/api/invia', { titolo: 'x', token: 'sbagliato' });
  assert.strictEqual(r.stato, 401);
});

testAsync('/api/invia senza iscritti spiega cosa fare invece di dire "errore"', async () => {
  iscrizioni.scrivi([]);
  const r = await chiama('POST', '/api/invia', { titolo: 'x', token: process.env.TOKEN_INVIO });
  assert.strictEqual(r.stato, 409);
  assert.ok(r.json.rimedio, 'nessun rimedio suggerito');
});

testAsync('/api/prova esige l\'endpoint: senza, non si sa a chi spedire', async () => {
  const r = await chiama('POST', '/api/prova', { ritardo: 0 });
  assert.strictEqual(r.stato, 400);
});

testAsync('/api/prova rifiuta un endpoint non iscritto', async () => {
  iscrizioni.scrivi([]);
  const r = await chiama('POST', '/api/prova', { endpoint: 'https://fcm.googleapis.com/fcm/send/mai-visto' });
  assert.strictEqual(r.stato, 404, 'ha accettato di spedire a un dispositivo sconosciuto');
  assert.ok(r.json.rimedio);
});

testAsync('/api/prova con ritardo risponde SUBITO 202, non dopo il ritardo', async () => {
  iscrizioni.scrivi([]);
  iscrizioni.aggiungi(finta(3), 'Mozilla/5.0 (iPhone)');
  const partito = Date.now();
  const r = await chiama('POST', '/api/prova', { endpoint: finta(3).endpoint, ritardo: 10 });
  const trascorso = Date.now() - partito;
  assert.strictEqual(r.stato, 202);
  assert.strictEqual(r.json.ritardo, 10);
  // Se la risposta arrivasse dopo il ritardo, l'utente vedrebbe un errore di
  // rete proprio nel momento in cui sta chiudendo l'app, come gli e' stato detto.
  assert.ok(trascorso < 2000, `la risposta ha impiegato ${trascorso}ms: deve essere immediata`);
});

testAsync('/api/prova limita il ritardo a 60 secondi', async () => {
  iscrizioni.scrivi([]);
  iscrizioni.aggiungi(finta(4), 'Android');
  const r = await chiama('POST', '/api/prova', { endpoint: finta(4).endpoint, ritardo: 99999 });
  assert.strictEqual(r.json.ritardo, 60);
});

/* ═══════════════════════════════ l'apparato di misura ══════════════════ */

testAsync('/api/registro senza token e\' chiuso: contiene modelli e orari delle prove', async () => {
  const r = await chiama('GET', '/api/registro');
  assert.strictEqual(r.stato, 401);
});

testAsync('/api/registro col token restituisce verbale e riepilogo', async () => {
  const r = await chiamaConToken('GET', '/api/registro?quante=50');
  assert.strictEqual(r.stato, 200);
  assert.ok(Array.isArray(r.json.voci), 'nessun elenco di eventi');
  assert.ok(r.json.riepilogo, 'nessun riepilogo');
});

testAsync('il registro annota l\'iscrizione, e senza l\'endpoint per intero', async () => {
  registro.svuota();
  await chiama('POST', '/api/iscrivi', { iscrizione: finta(11) });
  const r = await chiamaConToken('GET', '/api/registro?quante=10');
  const voce = r.json.voci.find((v) => v.tipo === 'iscrizione');
  assert.ok(voce, 'l\'iscrizione non e\' finita nel registro');
  assert.strictEqual(voce.piattaforma, 'iOS');
  assert.ok(!r.testo.includes(finta(11).endpoint),
    'l\'endpoint per intero e\' finito nel registro: e\' la credenziale di quel dispositivo');
  assert.ok(voce.dispositivo.startsWith('…'), 'manca la sigla del dispositivo');
});

testAsync('/api/annota accetta solo eventi di un elenco chiuso', async () => {
  const buono = await chiama('POST', '/api/annota', { evento: 'app-aperta', dettagli: {} });
  assert.strictEqual(buono.stato, 204);
  const cattivo = await chiama('POST', '/api/annota', { evento: '<script>qualunque cosa</script>' });
  assert.strictEqual(cattivo.stato, 400, 'una rotta aperta ha accettato testo arbitrario');
});

testAsync('/laboratorio serve lo strumento e non lo lascia mettere in cache', async () => {
  const r = await chiama('GET', '/laboratorio');
  assert.strictEqual(r.stato, 200);
  assert.match(r.headers.get('cache-control') || '', /no-store/,
    'uno strumento di misura che mostra dati vecchi mente senza dirlo');
  assert.match(r.testo, /Banco di prova/);
});

testAsync('/architettura e\' servito e non va in cache', async () => {
  // Descrive limiti di piattaforma che invecchiano: un documento tecnico
  // servito in una versione vecchia non dichiara di essere vecchio.
  const r = await chiama('GET', '/architettura');
  assert.strictEqual(r.stato, 200);
  assert.match(r.headers.get('cache-control') || '', /no-store/);
  assert.match(r.testo, /architettura e istruzioni/i);
});

test('il documento di architettura non ha stili in linea (li vieta la CSP)', () => {
  // default-src 'none'; style-src 'self': uno style="" o un <style> verrebbero
  // bloccati, e la pagina arriverebbe senza grafica senza un errore evidente.
  const doc = leggi('public/architettura.html');
  assert.ok(!/ style="/.test(doc), 'c\'e\' uno style in linea');
  assert.ok(!/<style[\s>]/.test(doc), 'c\'e\' un blocco <style>');
  assert.match(doc, /<link[^>]+href="\/architettura\.css"/, 'manca il foglio esterno');
});

testAsync('/comunicazione serve le istruzioni app-server', async () => {
  const r = await chiama('GET', '/comunicazione');
  assert.strictEqual(r.stato, 200);
  assert.match(r.headers.get('cache-control') || '', /no-store/);
  assert.match(r.testo, /sistema di comunicazione/i);
});

test('le istruzioni non insegnano a fidarsi dell\'utenteId del client', () => {
  // E' la trappola che fa ricevere a uno le notifiche di un altro: basta
  // cambiare una riga nella console. Se questa avvertenza sparisce, la guida
  // insegna un buco di sicurezza.
  const g = leggi('public/comunicazione.htm');
  assert.match(g, /MAI da req\.body\.utenteId/,
    'manca l\'avvertenza sull\'utenteId che arriva dal browser');
  assert.match(g, /req\.session\?\.utenteId/, 'non mostra da dove leggere l\'utente');
});

test('le istruzioni dicono che il logout deve disiscrivere', () => {
  // Senza, il dispositivo continua a ricevere le notifiche di chi se n'e'
  // andato: su un computer d'ufficio e' una fuga di dati vera.
  const g = leggi('public/comunicazione.htm');
  assert.match(g, /logout deve disiscrivere/i);
  assert.match(g, /unsubscribe/, 'non mostra come disdire la casella');
});

for (const doc of ['public/architettura.html', 'public/comunicazione.htm']) {
  test(`${doc}: nessun elemento dei diagrammi esce dal disegno`, () => {
    // Un riquadro oltre l'altezza del viewBox viene tagliato senza errori: e'
    // successo con l'albero di decisione, e si vedeva solo guardando.
    const h = leggi(doc);
    const svg = [...h.matchAll(/<svg viewBox="0 0 (\d+) (\d+)"[\s\S]*?<\/svg>/g)];
    assert.ok(svg.length > 0, 'nessun diagramma trovato');
    for (const [blocco, larg, alt] of svg) {
      for (const r of blocco.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g)) {
        const [, x, y, w, hh] = r.map(Number);
        assert.ok(x + w <= Number(larg) && y + hh <= Number(alt),
          `riquadro a (${x},${y}) ${w}x${hh} fuori da viewBox ${larg}x${alt}`);
      }
      for (const t of blocco.matchAll(/<text x="(\d+)" y="(\d+)"/g)) {
        assert.ok(Number(t[2]) <= Number(alt), `testo a y=${t[2]} sotto il fondo (${alt})`);
      }
    }
  });
}

test('il documento di architettura non promette cio\' che iOS non permette', () => {
  const doc = leggi('public/architettura.html');
  // Le tre impossibilita' su iOS sono il cuore del documento: se sparissero,
  // resterebbe una guida che fa perdere giorni a chi la segue.
  assert.match(doc, /navigator\.install/, 'non cita il limite dell\'API di installazione');
  assert.match(doc, /getInstalledRelatedApps/, 'non cita il limite della rilevazione');
  assert.match(doc, /showNotification/, 'non cita la regola del push visibile');
});

testAsync('la pagina dello strumento non contiene il token', async () => {
  const r = await chiama('GET', '/laboratorio');
  assert.ok(!r.testo.includes(process.env.TOKEN_INVIO),
    'il token e\' incorporato nella pagina: sarebbe pubblico');
});

test('il service worker avvisa anche le pagine aperte, non solo il server', () => {
  // Il verbale sul server serve a chi costruisce; il messaggio alla pagina serve
  // all'utente, che riaprendo l'app deve trovare la conferma gia' li'.
  assert.match(sw, /postMessage\(\s*\{\s*tipo:\s*['"]notifica-mostrata['"]/);
});

test('il service worker NON mette in cache lo strumento di misura', () => {
  assert.match(sw, /\/laboratorio/,
    'senza esclusione il verbale verrebbe servito dalla cache dell\'app');
});

testAsync('la notifica mostrata dal dispositivo finisce nel verbale col suo ritardo', async () => {
  registro.svuota();
  await chiama('POST', '/api/annota', { evento: 'notifica-mostrata', dettagli: { ritardoMs: 2400 } });
  const r = await chiamaConToken('GET', '/api/registro?quante=10');
  const voce = r.json.voci.find((v) => v.tipo === 'notifica-mostrata');
  assert.ok(voce, 'il dispositivo ha riferito ma il registro non l\'ha annotato');
  assert.strictEqual(voce.ritardoMs, 2400);
  assert.strictEqual(voce.origine, 'dispositivo');
});

/* ═════════════════════════════════════════════════════════════ fine ════ */

(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));

  for (const { nome, fn } of attesi) {
    try { await fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${nome}`); }
    catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${nome}\n      ${e.message}`); }
  }

  server.close();
  fs.rmSync(CARTELLA_TMP, { recursive: true, force: true });

  console.log(`\n${passed} superati, ${failed} falliti\n`);
  if (failed === 0) {
    console.log('Nota: questi test NON dimostrano che una notifica arrivi su un telefono.');
    console.log('Quella verifica si fa solo su un dispositivo reale — vedi Regola 4 in CLAUDE.md.\n');
  }
  process.exit(failed ? 1 : 0);
})();
