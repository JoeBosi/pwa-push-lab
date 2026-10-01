/*
 * Test del sito notizie: accesso, griglia, pianificatore e — soprattutto — le
 * difese. Ogni test di sicurezza dice nel nome quale attacco ferma.
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'notizie-test-'));
process.env.FILE_ISCRIZIONI = path.join(TMP, 'iscrizioni.json');
process.env.FILE_REGISTRO = path.join(TMP, 'registro.jsonl');
process.env.FILE_UTENTI = path.join(TMP, 'utenti.json');
process.env.FILE_NOTIZIE = path.join(TMP, 'notizie.json');
process.env.SESSIONE_SEGRETO = 'segreto-di-prova-lungo-almeno-trentadue-caratteri-ok';
process.env.TOKEN_INVIO = 'token-prova';
const k = require('web-push').generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = k.publicKey;
process.env.VAPID_PRIVATE_KEY = k.privateKey;

let passed = 0, failed = 0;
const coda = [];
const test = (nome, fn) => coda.push({ nome, fn });

const utenti = require('../lib/utenti');
const iscrizioni = require('../lib/iscrizioni');
const notizie = require('../lib/notizie');
const pianificatore = require('../lib/pianificatore');
const app = require('../server');
let server;

const finta = (n) => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/x' + n, keys: { p256dh: 'p', auth: 'a' } });

async function chiama(metodo, percorso, { corpo, cookie, origine, tipo } = {}) {
  const h = {};
  if (corpo !== undefined) h['Content-Type'] = tipo || 'application/json';
  if (cookie) h.Cookie = cookie;
  if (origine) h.Origin = origine;
  const r = await fetch(`http://127.0.0.1:${server.address().port}${percorso}`, {
    method: metodo, headers: h, redirect: 'manual',
    body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
  });
  const testo = await r.text();
  let json = null; try { json = JSON.parse(testo); } catch (e) { /* — */ }
  const sc = r.headers.get('set-cookie');
  return { stato: r.status, json, testo, cookie: sc ? sc.split(';')[0] : null, dove: r.headers.get('location') };
}

/** Crea un utente gia' attivo (password cambiata) e restituisce il suo cookie. */
async function utenteAttivo(nome) {
  utenti.crea(nome, 'iniziale-123');
  const a = await chiama('POST', '/api/accesso', { corpo: { nome, password: 'iniziale-123' } });
  const b = await chiama('POST', '/api/password', { cookie: a.cookie, corpo: { attuale: 'iniziale-123', nuova: 'definitiva-456' } });
  return b.cookie;
}

/* ═══════════════════════════════════════════════════════════════ accesso ═══ */

test('la home senza accesso porta alla pagina di accesso', async () => {
  const r = await chiama('GET', '/');
  assert.strictEqual(r.stato, 302);
  assert.strictEqual(r.dove, '/accesso');
});

test('/index.html non scavalca il controllo d\'accesso', async () => {
  const r = await chiama('GET', '/index.html');
  assert.strictEqual(r.stato, 302, 'il file statico e\' stato servito senza accesso');
});

test('stesso messaggio per utente inesistente e password sbagliata (niente elenco dei nomi)', async () => {
  utenti.crea('mario', 'giusta-123');
  const a = await chiama('POST', '/api/accesso', { corpo: { nome: 'mario', password: 'sbagliata' } });
  const b = await chiama('POST', '/api/accesso', { corpo: { nome: 'nessuno', password: 'sbagliata' } });
  assert.strictEqual(a.stato, 401); assert.strictEqual(b.stato, 401);
  assert.strictEqual(a.json.errore, b.json.errore, 'i messaggi diversi rivelano quali nomi esistono');
});

test('dopo 5 tentativi sbagliati si ferma (forza bruta)', async () => {
  utenti.crea('bersaglio', 'giusta-123');
  for (let i = 0; i < 5; i++) await chiama('POST', '/api/accesso', { corpo: { nome: 'bersaglio', password: 'x' + i } });
  const r = await chiama('POST', '/api/accesso', { corpo: { nome: 'bersaglio', password: 'giusta-123' } });
  assert.strictEqual(r.stato, 429, 'anche con la password giusta deve restare bloccato per la finestra');
});

test('con la password iniziale non si fa altro che cambiarla', async () => {
  utenti.crea('nuovo', 'iniziale-123');
  const a = await chiama('POST', '/api/accesso', { corpo: { nome: 'nuovo', password: 'iniziale-123' } });
  assert.strictEqual(a.json.deveCambiare, true);
  const g = await chiama('PUT', '/api/griglia', { cookie: a.cookie, corpo: { griglia: { sport: '1h' } } });
  assert.strictEqual(g.stato, 403);
  const home = await chiama('GET', '/', { cookie: a.cookie });
  assert.strictEqual(home.dove, '/accesso?cambia=1');
});

test('cambiata la password, i cookie emessi prima non valgono piu\'', async () => {
  utenti.crea('revoca', 'iniziale-123');
  const vecchio = (await chiama('POST', '/api/accesso', { corpo: { nome: 'revoca', password: 'iniziale-123' } })).cookie;
  const nuovo = (await chiama('POST', '/api/password', { cookie: vecchio, corpo: { attuale: 'iniziale-123', nuova: 'definitiva-456' } })).cookie;
  assert.strictEqual((await chiama('GET', '/api/io', { cookie: vecchio })).stato, 401,
    'una sessione aperta altrove sopravvive al cambio password');
  assert.strictEqual((await chiama('GET', '/api/io', { cookie: nuovo })).stato, 200);
});

test('un cookie modificato a mano viene rifiutato (firma)', async () => {
  const c = await utenteAttivo('firmato');
  const [nome, valore] = c.split('=');
  const [corpo, firma] = valore.split('.');
  const dati = JSON.parse(Buffer.from(corpo, 'base64url').toString());
  dati.u = 'id-di-un-altro';
  const falso = `${nome}=${Buffer.from(JSON.stringify(dati)).toString('base64url')}.${firma}`;
  assert.strictEqual((await chiama('GET', '/api/io', { cookie: falso })).stato, 401);
});

test('la nuova password deve avere almeno 8 caratteri ed essere diversa', async () => {
  utenti.crea('corta', 'iniziale-123');
  const a = await chiama('POST', '/api/accesso', { corpo: { nome: 'corta', password: 'iniziale-123' } });
  assert.strictEqual((await chiama('POST', '/api/password', { cookie: a.cookie, corpo: { attuale: 'iniziale-123', nuova: 'corta' } })).stato, 400);
  assert.strictEqual((await chiama('POST', '/api/password', { cookie: a.cookie, corpo: { attuale: 'iniziale-123', nuova: 'iniziale-123' } })).stato, 400);
});

/* ═════════════════════════════════════════════════════ richieste incrociate ═══ */

test('POST da un\'altra origine e\' rifiutata (CSRF)', async () => {
  const c = await utenteAttivo('csrf');
  const r = await chiama('PUT', '/api/griglia', { cookie: c, origine: 'https://sito-cattivo.example', corpo: { griglia: { sport: '5m' } } });
  assert.strictEqual(r.stato, 403);
});

test('un modulo HTML (non JSON) e\' rifiutato (CSRF senza preflight)', async () => {
  const r = await chiama('POST', '/api/accesso', { corpo: 'nome=a&password=b', tipo: 'application/x-www-form-urlencoded' });
  assert.strictEqual(r.stato, 415);
});

/* ═══════════════════════════════════════════════════════════════ griglia ═══ */

test('la griglia accetta solo categorie e frequenze conosciute', async () => {
  const c = await utenteAttivo('griglia');
  const ko = await chiama('PUT', '/api/griglia', { cookie: c, corpo: { griglia: { sport: '1ms' } } });
  assert.strictEqual(ko.stato, 400);
  const ok = await chiama('PUT', '/api/griglia', { cookie: c, corpo: { griglia: { sport: '5m', '<script>': '1h' } } });
  assert.strictEqual(ok.json.griglia.sport, '5m');
  assert.ok(!('<script>' in ok.json.griglia), 'una categoria inventata e\' finita nell\'archivio');
});

/* ═════════════════════════════════════════════════════ dispositivi e utenti ═══ */

test('il dispositivo e\' di chi ha la sessione, non di chi lo dichiara nel corpo', async () => {
  const c = await utenteAttivo('proprietario');
  const vittima = utenti.trovaPerNome('mario');
  await chiama('POST', '/api/iscrivi', { cookie: c, corpo: { iscrizione: finta(1), utenteId: vittima.id } });
  const io = utenti.trovaPerNome('proprietario');
  assert.strictEqual(iscrizioni.perUtente(io.id).length, 1);
  assert.strictEqual(iscrizioni.perUtente(vittima.id).length, 0,
    'chi dichiara un utenteId nel corpo riceverebbe le notifiche di un altro');
});

test('senza accesso il dispositivo resta anonimo e non ricevera\' notizie', async () => {
  await chiama('POST', '/api/iscrivi', { corpo: { iscrizione: finta(2) } });
  const v = iscrizioni.leggi().find((x) => x.endpoint === finta(2).endpoint);
  assert.strictEqual(v.utenteId, null);
});

test('stesso telefono, utente diverso: il dispositivo cambia proprietario', async () => {
  const a = await utenteAttivo('primo');
  const b = await utenteAttivo('secondo');
  await chiama('POST', '/api/iscrivi', { cookie: a, corpo: { iscrizione: finta(3) } });
  await chiama('POST', '/api/iscrivi', { cookie: b, corpo: { iscrizione: finta(3) } });
  assert.strictEqual(iscrizioni.perUtente(utenti.trovaPerNome('primo').id).length, 0);
  assert.strictEqual(iscrizioni.perUtente(utenti.trovaPerNome('secondo').id).length, 1);
});

test('uscendo, il server toglie TUTTI i dispositivi dell\'utente', async () => {
  const c = await utenteAttivo('esce');
  await chiama('POST', '/api/iscrivi', { cookie: c, corpo: { iscrizione: finta(4) } });
  await chiama('POST', '/api/iscrivi', { cookie: c, corpo: { iscrizione: finta(5) } });
  await chiama('POST', '/api/esci', { cookie: c, corpo: {} });
  assert.strictEqual(iscrizioni.perUtente(utenti.trovaPerNome('esce').id).length, 0,
    'il telefono continuerebbe a ricevere le notizie di chi se n\'e\' andato');
});

/* ═══════════════════════════════════════════════════════════════ notizie ═══ */

test('i titoli perdono l\'HTML e i link "javascript:" vengono scartati', () => {
  assert.strictEqual(notizie.pulisci('<b>Ciao</b> &amp; <img src=x onerror=alert(1)>mondo'), 'Ciao & mondo');
  assert.strictEqual(notizie.linkSicuro('javascript:alert(1)'), null);
  assert.strictEqual(notizie.linkSicuro('https://www.ansa.it/x'), 'https://www.ansa.it/x');
});

test('la pagina inserisce i titoli come testo, mai come HTML', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'notizie.js'), 'utf8');
  assert.ok(!/\.innerHTML\s*=/.test(js), 'innerHTML in una pagina che mostra titoli di feed esterni');
});

/* ══════════════════════════════════════════════════════════ pianificatore ═══ */

function archivioNotizie(voci) {
  fs.writeFileSync(process.env.FILE_NOTIZIE, JSON.stringify({ voci: Object.fromEntries(voci.map((v) => [v.link, v])), letture: {} }));
}

test('il pianificatore rispetta la frequenza e manda solo le notizie nuove', async () => {
  await utenteAttivo('lettore');
  const u = utenti.trovaPerNome('lettore');
  utenti.aggiornaGriglia(u.id, { sport: '1h', politica: null });
  const ora = Date.now();
  // ultimoInvio di sport = adesso (appena acceso): dentro l'ora non parte niente
  archivioNotizie([{ titolo: 'Gol', link: 'https://x/1', categoria: 'sport', fonte: 'T', vista: new Date(ora + 1000).toISOString() }]);
  const spediti = [];
  const spedisci = async (id, m) => { spediti.push({ id, m }); return { dispositivi: 1, riusciti: 1 }; };
  await pianificatore.giro(spedisci);
  assert.strictEqual(spediti.filter((s) => s.id === u.id).length, 0, 'e\' partita prima che l\'ora fosse passata');

  // L'ora e' passata: parte, e solo per sport
  utenti.segnaInvio(u.id, 'sport', new Date(ora - 3601e3).toISOString());
  await pianificatore.giro(spedisci);
  const miei = spediti.filter((s) => s.id === u.id);
  assert.strictEqual(miei.length, 1);
  assert.match(miei[0].m.titolo, /^Sport/);

  // Subito dopo: l'intervallo riparte, niente doppioni
  await pianificatore.giro(spedisci);
  assert.strictEqual(spediti.filter((s) => s.id === u.id).length, 1, 'doppio invio nello stesso intervallo');
});

test('piu\' categorie in scadenza nello stesso giro: UNA notifica sola', async () => {
  await utenteAttivo('raggruppa');
  const u = utenti.trovaPerNome('raggruppa');
  utenti.aggiornaGriglia(u.id, { sport: '5m', mercati: '5m', politica: '5m' });
  const prima = new Date(Date.now() - 600e3).toISOString();
  for (const c of ['sport', 'mercati', 'politica']) utenti.segnaInvio(u.id, c, prima);
  const ora = new Date().toISOString();
  archivioNotizie([
    { titolo: 'Gol', link: 'https://x/a', categoria: 'sport', fonte: 'T', vista: ora },
    { titolo: 'Borsa su', link: 'https://x/b', categoria: 'mercati', fonte: 'T', vista: ora },
    { titolo: 'Borsa giu', link: 'https://x/c', categoria: 'mercati', fonte: 'T', vista: ora },
    { titolo: 'Voto', link: 'https://x/d', categoria: 'politica', fonte: 'T', vista: ora },
  ]);
  const spediti = [];
  await pianificatore.giro(async (id, m) => { spediti.push({ id, m }); return { dispositivi: 1, riusciti: 1 }; });
  const miei = spediti.filter((x) => x.id === u.id);
  assert.strictEqual(miei.length, 1, `${miei.length} notifiche: con tutto a 5 minuti diventerebbero una raffica`);
  assert.match(miei[0].m.titolo, /^4 notizie/);
  for (const e of ['Sport', 'Mercati', 'Politica']) assert.ok(miei[0].m.testo.includes(e), `manca ${e} nel testo`);
});

test('nessuna notizia nuova, nessuna notifica (una notifica vuota insegna a ignorarle)', async () => {
  const u = utenti.trovaPerNome('lettore');
  utenti.segnaInvio(u.id, 'sport', new Date(Date.now() - 7200e3).toISOString());
  archivioNotizie([]);
  const spediti = [];
  await pianificatore.giro(async (id) => { spediti.push(id); return { dispositivi: 1, riusciti: 1 }; });
  assert.ok(!spediti.includes(u.id));
});

test('il pianificatore ignora chi ha ancora la password iniziale', async () => {
  const u = utenti.crea('inattivo', 'iniziale-123');
  // forzata a mano: in produzione non puo' accadere senza cambio password
  const tutti = utenti.leggi(); const x = tutti.find((y) => y.id === u.id);
  x.griglia.sport = '5m'; x.ultimoInvio.sport = new Date(0).toISOString();
  fs.writeFileSync(process.env.FILE_UTENTI, JSON.stringify(tutti));
  archivioNotizie([{ titolo: 'Gol', link: 'https://x/2', categoria: 'sport', fonte: 'T', vista: new Date().toISOString() }]);
  const spediti = [];
  await pianificatore.giro(async (id) => { spediti.push(id); return { dispositivi: 1, riusciti: 1 }; });
  assert.ok(!spediti.includes(u.id));
});

/* ══════════════════════════════════════════════════════════ amministrazione ═══ */

test('un utente normale non entra nell\'amministrazione (ne\' pagina ne\' API)', async () => {
  const c = await utenteAttivo('normale');
  assert.strictEqual((await chiama('GET', '/api/admin/utenti', { cookie: c })).stato, 403);
  assert.strictEqual((await chiama('POST', '/api/admin/utenti', { cookie: c, corpo: { nome: 'intruso' } })).stato, 403);
  assert.strictEqual((await chiama('GET', '/admin', { cookie: c })).dove, '/',
    'la pagina admin non deve nemmeno confermare di esistere a chi non e\' admin');
});

test('l\'admin crea un utente: password mostrata una volta, da cambiare al primo accesso', async () => {
  const c = await utenteAttivo('capo');
  utenti.impostaRuolo('capo', 'admin');
  const r = await chiama('POST', '/api/admin/utenti', { cookie: c, corpo: { nome: 'assunto' } });
  assert.strictEqual(r.stato, 201);
  assert.ok(r.json.password && r.json.password.length >= 12, 'password iniziale assente o corta');
  const a = await chiama('POST', '/api/accesso', { corpo: { nome: 'assunto', password: r.json.password } });
  assert.strictEqual(a.json.deveCambiare, true);
  const lista = await chiama('GET', '/api/admin/utenti', { cookie: c });
  assert.ok(!lista.testo.includes(r.json.password), 'la password e\' rileggibile dall\'elenco');
  assert.ok(!lista.testo.includes('"hash"'), 'l\'elenco espone gli hash delle password');
});

test('dal browser non si creano amministratori (un campo "ruolo" viene ignorato)', async () => {
  const c = (await chiama('POST', '/api/accesso', { corpo: { nome: 'capo', password: 'definitiva-456' } })).cookie;
  await chiama('POST', '/api/admin/utenti', { cookie: c, corpo: { nome: 'scalatore', ruolo: 'admin' } });
  assert.strictEqual(utenti.trovaPerNome('scalatore').ruolo, 'utente');
});

test('reimpostare una password chiude le sessioni di quell\'utente', async () => {
  const vittima = await utenteAttivo('reimpostato');
  const c = (await chiama('POST', '/api/accesso', { corpo: { nome: 'capo', password: 'definitiva-456' } })).cookie;
  await chiama('POST', '/api/admin/utenti/reimpostato/reimposta', { cookie: c, corpo: {} });
  assert.strictEqual((await chiama('GET', '/api/io', { cookie: vittima })).stato, 401);
});

test('l\'admin non puo\' eliminare se stesso, e l\'ultimo admin non perde il ruolo', async () => {
  const c = (await chiama('POST', '/api/accesso', { corpo: { nome: 'capo', password: 'definitiva-456' } })).cookie;
  assert.strictEqual((await chiama('DELETE', '/api/admin/utenti/capo', { cookie: c, corpo: {} })).stato, 400);
  assert.throws(() => utenti.impostaRuolo('capo', 'utente'), /unico amministratore/);
});

test('eliminare un utente toglie anche i suoi dispositivi', async () => {
  const v = await utenteAttivo('licenziato');
  await chiama('POST', '/api/iscrivi', { cookie: v, corpo: { iscrizione: finta(9) } });
  const id = utenti.trovaPerNome('licenziato').id;
  const c = (await chiama('POST', '/api/accesso', { corpo: { nome: 'capo', password: 'definitiva-456' } })).cookie;
  const r = await chiama('DELETE', '/api/admin/utenti/licenziato', { cookie: c, corpo: {} });
  assert.strictEqual(r.json.dispositivi, 1);
  assert.strictEqual(iscrizioni.perUtente(id).length, 0);
});

test('anche la pagina admin inserisce i dati come testo', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
  assert.ok(!/\.innerHTML\s*=/.test(js));
});

/* ═════════════════════════════════════════════════════════════════ fine ═══ */

(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  console.log('\nSito notizie — accesso, griglia, pianificatore, difese');
  for (const { nome, fn } of coda) {
    try { await fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${nome}`); }
    catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${nome}\n      ${e.message}`); }
  }
  server.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${passed} superati, ${failed} falliti\n`);
  process.exit(failed ? 1 : 0);
})();
