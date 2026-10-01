#!/usr/bin/env node
/*
 * Il banco di prova: lo strumento da cui si osserva l'esperimento.
 *
 *   node strumenti/banco.js stato        quanti dispositivi, quali sistemi
 *   node strumenti/banco.js registro     il verbale, dal piu' recente
 *   node strumenti/banco.js segui        il verbale in tempo reale
 *   node strumenti/banco.js invia [testo]  notifica a TUTTI (richiede il token)
 *   node strumenti/banco.js verifica     la lista di controllo del deploy
 *   node strumenti/banco.js azzera       svuota il registro (non le iscrizioni)
 *
 * Legge il .env locale per il token e l'indirizzo. Su un'altra macchina:
 *   BANCO_URL=https://pwa.example.com BANCO_TOKEN=… node strumenti/banco.js registro
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/*
 * Legge il .env di sviluppo E quello di produzione, in quest'ordine, e per ogni
 * variabile tiene il primo valore NON VUOTO.
 *
 * Non si ferma al primo file trovato, e un valore vuoto non conta come trovato:
 * il .env di sviluppo esiste ma ha TOKEN_INVIO vuoto, e fermarsi li' lasciava
 * lo strumento senza token pur essendocene uno a due righe di distanza — con lo
 * strumento che dichiarava guasto il server invece che se stesso.
 */
(function caricaEnv() {
  for (const file of [path.join(ROOT, '.env'), '/opt/pwa-notifiche/.env']) {
    if (!fs.existsSync(file)) continue;
    try {
      for (const riga of fs.readFileSync(file, 'utf8').split('\n')) {
        const m = riga.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const valore = m[2].replace(/^["']|["']$/g, '').trim();
        if (valore && !process.env[m[1]]) process.env[m[1]] = valore;
      }
    } catch (e) { /* non leggibile da questo utente: si prova il prossimo */ }
  }
})();

const URL_BASE = (process.env.BANCO_URL || `http://127.0.0.1:${process.env.PORT || 3020}`).replace(/\/$/, '');
const TOKEN = process.env.BANCO_TOKEN || process.env.TOKEN_INVIO || '';

const C = {
  ok: (t) => `\x1b[32m${t}\x1b[0m`,
  ko: (t) => `\x1b[31m${t}\x1b[0m`,
  att: (t) => `\x1b[33m${t}\x1b[0m`,
  tenue: (t) => `\x1b[90m${t}\x1b[0m`,
  forte: (t) => `\x1b[1m${t}\x1b[0m`,
};

async function chiama(percorso, opzioni) {
  const o = Object.assign({ headers: {} }, opzioni);
  if (TOKEN) o.headers['X-Token-Invio'] = TOKEN;
  if (o.body) o.headers['Content-Type'] = 'application/json';
  const r = await fetch(URL_BASE + percorso, o);
  const testo = await r.text();
  let json = null;
  try { json = JSON.parse(testo); } catch (e) { /* non JSON */ }
  return { stato: r.status, json, testo };
}

const ora = (iso) => {
  try { return new Date(iso).toLocaleTimeString('it-IT', { hour12: false }); }
  catch (e) { return '--:--:--'; }
};

/** Una riga di verbale, leggibile a colpo d'occhio. */
function riga(v) {
  const etichette = {
    'app-aperta': ['📱', 'app aperta'],
    'sw-registrato': ['⚙️ ', 'service worker pronto'],
    'sw-errore': ['💥', 'service worker in errore'],
    'permesso-concesso': ['✅', 'permesso CONCESSO'],
    'permesso-negato': ['⛔', 'permesso NEGATO'],
    'permesso-ignorato': ['🤷', 'permesso non deciso'],
    'iscrizione': ['📝', 'iscritto al server'],
    'iscrizione-creata': ['🔔', 'iscrizione push creata'],
    'iscrizione-fallita': ['💥', 'iscrizione FALLITA'],
    'disiscrizione': ['🗑 ', 'disiscritto'],
    'invio-richiesto': ['📤', 'invio richiesto'],
    'invio-esito': ['📡', 'consegnata al servizio push'],
    'notifica-mostrata': ['🎉', 'NOTIFICA COMPARSA SUL DISPOSITIVO'],
    'notifica-toccata': ['👆', 'notifica toccata'],
  };
  const [icona, testo] = etichette[v.tipo] || ['·', v.tipo];

  let esito = '';
  if (v.tipo === 'invio-esito') {
    esito = v.ok ? C.ok(`ok in ${v.ms}ms`) : C.ko(`${v.stato} — ${v.motivo}`);
  } else if (v.tipo === 'notifica-mostrata' && v.ritardoMs != null) {
    esito = C.ok(`${(v.ritardoMs / 1000).toFixed(1)}s dopo l'invio`);
  }

  const chi = [v.piattaforma, v.servizio, v.dispositivo].filter(Boolean).join(' ');
  const extra = [
    v.installata === true ? 'installata' : v.installata === false ? 'nel browser' : '',
    v.ritardo ? `ritardo ${v.ritardo}s` : '',
    v.contesto && v.contesto !== 'manuale' ? v.contesto : '',
    v.nota || '',
  ].filter(Boolean).join(' · ');

  const evidenzia = v.tipo === 'notifica-mostrata' ? C.forte : (t) => t;
  return `  ${C.tenue(ora(v.quando))}  ${icona} ${evidenzia(testo.padEnd(34))} ` +
    `${C.tenue(chi.padEnd(22))} ${esito} ${extra ? C.tenue(extra) : ''}`.trimEnd();
}

/* ------------------------------------------------------------- comandi --- */

async function stato() {
  const r = await chiama('/api/stato');
  if (!r.json) return console.error(C.ko(`Il server non risponde su ${URL_BASE}`));
  const s = r.json;
  console.log(`\n  ${C.forte('Banco di prova')} — ${URL_BASE}\n`);
  console.log(`  chiavi VAPID       ${s.pushAttivo ? C.ok('configurate') : C.ko('MANCANTI')}`);
  console.log(`  invio collettivo   ${s.protetto ? C.ok('chiuso col token') : C.ko('APERTO A CHIUNQUE')}`);
  console.log(`  dispositivi        ${s.totale === 0 ? C.att('nessuno ancora') : C.forte(String(s.totale))}`);
  for (const [p, n] of Object.entries(s.perPiattaforma || {})) console.log(`                     ${p}: ${n}`);
  if (s.ultima) console.log(`  ultima iscrizione  ${new Date(s.ultima).toLocaleString('it-IT')}`);
  console.log('');
}

async function mostraRegistro(quante) {
  const r = await chiama(`/api/registro?quante=${quante || 60}`);
  if (r.stato === 401) return console.error(C.ko('Token non valido. Serve TOKEN_INVIO o BANCO_TOKEN.'));
  if (r.stato === 503) return console.error(C.ko(r.json.errore + '\n  ' + r.json.rimedio));
  if (!r.json) return console.error(C.ko(`Il server non risponde su ${URL_BASE}`));

  const { riepilogo, voci } = r.json;
  if (voci.length === 0) {
    console.log(C.att('\n  Registro vuoto: nessuna prova ancora eseguita.\n'));
    return;
  }

  console.log(`\n  ${C.forte('Verbale')} — ${voci.length} eventi, dal piu' recente\n`);
  // In ordine cronologico: un verbale si legge dall'inizio.
  voci.slice().reverse().forEach((v) => console.log(riga(v)));

  console.log(`\n  ${C.forte('Riepilogo')}`);
  console.log(`  invii riusciti     ${C.ok(String(riepilogo.invii.riusciti))}`);
  console.log(`  invii falliti      ${riepilogo.invii.falliti ? C.ko(String(riepilogo.invii.falliti)) : '0'}`);
  for (const [codice, n] of Object.entries(riepilogo.erroriPerCodice || {})) {
    console.log(`      codice ${codice}: ${n}`);
  }
  const comparse = riepilogo.perTipo['notifica-mostrata'] || 0;
  console.log(`  ${C.forte('notifiche comparse sui dispositivi')}  ` +
    (comparse ? C.ok(String(comparse)) : C.ko('NESSUNA')));
  if (!comparse && riepilogo.invii.riusciti) {
    console.log(C.att('\n  Il servizio push le ha accettate ma nessun dispositivo le ha mostrate.'));
    console.log(C.att('  Il telefono era offline, oppure il sistema ha silenziato le notifiche.'));
  }
  console.log('');
}

async function segui() {
  console.log(C.tenue(`  In ascolto su ${URL_BASE} — Ctrl+C per uscire\n`));
  let viste = new Set();
  let primaVolta = true;
  for (;;) {
    const r = await chiama('/api/registro?quante=40');
    if (r.json && r.json.voci) {
      const nuove = r.json.voci.slice().reverse().filter((v) => !viste.has(v.quando + v.tipo));
      for (const v of nuove) {
        viste.add(v.quando + v.tipo);
        if (!primaVolta) console.log(riga(v));
      }
      if (primaVolta) { primaVolta = false; console.log(C.tenue('  (in attesa di nuovi eventi…)')); }
    }
    await new Promise((r2) => setTimeout(r2, 2000));
  }
}

async function invia(testo) {
  if (!TOKEN) return console.error(C.ko('Serve il token: TOKEN_INVIO nel .env o BANCO_TOKEN.'));
  const r = await chiama('/api/invia', {
    method: 'POST',
    body: JSON.stringify({ titolo: 'Dal banco di prova', testo: testo || 'Invio collettivo di controllo.' }),
  });
  if (r.stato === 409) return console.error(C.att('  ' + r.json.errore + ' — ' + r.json.rimedio));
  if (!r.json || !r.json.esiti) return console.error(C.ko(`  ${r.stato}: ${r.testo}`));
  console.log(`\n  Inviata a ${r.json.inviate}/${r.json.totale} dispositivi\n`);
  r.json.esiti.forEach((e) => console.log(
    `  ${e.ok ? C.ok('✓') : C.ko('✗')} ${(e.piattaforma || '?').padEnd(10)} ${e.ok ? '' : C.ko(e.motivo)}`));
  console.log(C.tenue('\n  «Consegnata al servizio push» non e\' «comparsa sul telefono».'));
  console.log(C.tenue('  Quella la conferma il registro:  node strumenti/banco.js registro\n'));
}

async function verifica() {
  console.log(`\n  ${C.forte('Lista di controllo')} — ${URL_BASE}\n`);
  const prove = [
    ['la pagina risponde', async () => (await chiama('/')).stato === 200],
    ['il manifest e\' servito', async () => (await chiama('/manifest.webmanifest')).stato === 200],
    ['il service worker e\' sulla radice', async () => (await chiama('/sw.js')).stato === 200],
    ['le chiavi VAPID sono configurate', async () => (await chiama('/api/stato')).json?.pushAttivo === true],
    ['l\'invio collettivo NON e\' aperto', async () => (await chiama('/api/stato')).json?.protetto === true],
    ['il registro e\' consultabile col token', async () => (await chiama('/api/registro?quante=1')).stato === 200],
  ];
  if (!TOKEN) {
    console.log(C.att('  Nessun token trovato: gli ultimi controlli falliranno per colpa'));
    console.log(C.att('  dello strumento, non del server. Passa BANCO_TOKEN=…\n'));
  }
  let falliti = 0;
  for (const [nome, fn] of prove) {
    let esito = false;
    try { esito = await fn(); } catch (e) { esito = false; }
    if (!esito) falliti++;
    console.log(`  ${esito ? C.ok('✓') : C.ko('✗')} ${nome}`);
  }
  console.log(`\n  ${falliti ? C.ko(falliti + ' controlli falliti') : C.ok('Infrastruttura a posto.')}`);
  console.log(C.tenue('  Restano le prove sui dispositivi: nessuna di queste dimostra'));
  console.log(C.tenue('  che una notifica arrivi su un telefono.\n'));
  process.exitCode = falliti ? 1 : 0;
}

function azzera() {
  require('../lib/registro').svuota();
  console.log(C.ok('  Registro svuotato. Le iscrizioni dei dispositivi restano.'));
  console.log(C.tenue('  In produzione il registro sta in /opt/pwa-notifiche/data/registro.jsonl\n'));
}

/* ---------------------------------------------------------------- main --- */

const [comando, ...resto] = process.argv.slice(2);
const azioni = {
  stato,
  registro: () => mostraRegistro(Number(resto[0])),
  segui,
  invia: () => invia(resto.join(' ')),
  verifica,
  azzera: async () => azzera(),
};

if (!comando || !azioni[comando]) {
  console.log(`
  ${C.forte('Banco di prova — notifiche push')}

    stato          quanti dispositivi, quali sistemi, invio protetto o no
    registro [n]   il verbale delle prove, in ordine cronologico
    segui          il verbale in tempo reale, mentre provi dal telefono
    invia [testo]  notifica a TUTTI i dispositivi (richiede il token)
    verifica       lista di controllo dell'infrastruttura
    azzera         svuota il registro (le iscrizioni restano)

  ${C.tenue('Server: ' + URL_BASE)}
  ${C.tenue('Token:  ' + (TOKEN ? 'trovato' : 'ASSENTE — registro e invio collettivo non accessibili'))}
`);
  process.exit(comando ? 1 : 0);
}

azioni[comando]().catch((e) => { console.error(C.ko('  ' + e.message)); process.exit(1); });
