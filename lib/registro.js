/*
 * Registro degli eventi del banco di prova.
 *
 * E' lo strumento di misura dell'esperimento. Senza, quando su un telefono non
 * arriva niente l'unico modo di sapere il perche' e' chiederlo a chi teneva in
 * mano il telefono — e la sua risposta sara' "non e' arrivata", che e'
 * esattamente l'informazione che gia' si aveva.
 *
 * Con il registro si legge invece la sequenza: iscrizione accettata alle
 * 14:02:11 da iOS 17.4, invio partito alle 14:03:40, il servizio push ha
 * risposto 201, oppure 410, oppure non ha risposto. Sono cose diverse, e
 * portano a rimedi diversi.
 *
 * Formato JSONL (un oggetto JSON per riga): si aggiunge in coda senza rileggere
 * il file, sopravvive a una scrittura interrotta perdendo al massimo una riga,
 * e si legge con head/tail/grep senza strumenti.
 */
const fs = require('fs');
const path = require('path');

const FILE = process.env.FILE_REGISTRO ||
  path.join(__dirname, '..', 'data', 'registro.jsonl');

// Oltre questa soglia il file viene ruotato. Un banco di prova non deve poter
// riempire il disco di una macchina che ospita anche altro.
const LIMITE_BYTE = 2 * 1024 * 1024;
const DA_TENERE = 400; // righe conservate alla rotazione

/**
 * L'endpoint push non finisce MAI nel registro per intero: e' la credenziale
 * con cui si spedisce a quel dispositivo. Ne bastano le ultime cifre per
 * riconoscere "lo stesso telefono di prima".
 */
function siglaEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length < 8) return '????';
  return '…' + endpoint.slice(-8);
}

function ruotaSeServe() {
  try {
    if (fs.statSync(FILE).size < LIMITE_BYTE) return;
    const righe = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean);
    fs.writeFileSync(FILE, righe.slice(-DA_TENERE).join('\n') + '\n', { mode: 0o600 });
  } catch (e) { /* file assente: niente da ruotare */ }
}

/**
 * Annota un evento. Non lancia mai: un registro che rompe l'applicazione che
 * dovrebbe osservare e' peggio di nessun registro.
 */
function annota(tipo, dettagli) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    ruotaSeServe();
    const voce = Object.assign({ quando: new Date().toISOString(), tipo }, dettagli || {});
    fs.appendFileSync(FILE, JSON.stringify(voce) + '\n', { mode: 0o600 });
    return voce;
  } catch (e) {
    console.error('[registro] non scritto:', e.message);
    return null;
  }
}

/** Le ultime `quante` voci, dalla piu' recente. */
function ultime(quante) {
  try {
    const righe = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean);
    return righe.slice(-(quante || 100)).map(function (r) {
      try { return JSON.parse(r); } catch (e) { return { tipo: 'riga-illeggibile', grezzo: r }; }
    }).reverse();
  } catch (e) {
    return [];
  }
}

/**
 * Conteggi per tipo di evento e per esito. E' il riassunto che dice, in tre
 * righe, se l'esperimento sta funzionando: quante iscrizioni, quanti invii
 * riusciti, quanti falliti e con che codice.
 */
function riepilogo() {
  const voci = ultime(5000);
  const perTipo = {};
  const erroriPerCodice = {};
  const piattaforme = {};
  let inviateOk = 0, inviateKo = 0;

  for (const v of voci) {
    perTipo[v.tipo] = (perTipo[v.tipo] || 0) + 1;
    if (v.piattaforma) piattaforme[v.piattaforma] = (piattaforme[v.piattaforma] || 0) + 1;
    if (v.tipo === 'invio-esito') {
      if (v.ok) inviateOk++;
      else {
        inviateKo++;
        const c = String(v.stato || 'ignoto');
        erroriPerCodice[c] = (erroriPerCodice[c] || 0) + 1;
      }
    }
  }
  return {
    voci: voci.length,
    perTipo,
    piattaforme,
    invii: { riusciti: inviateOk, falliti: inviateKo },
    erroriPerCodice,
    dal: voci.length ? voci[voci.length - 1].quando : null,
    al: voci.length ? voci[0].quando : null,
  };
}

function svuota() {
  try { fs.unlinkSync(FILE); } catch (e) { /* gia' assente */ }
}

module.exports = { annota, ultime, riepilogo, svuota, siglaEndpoint, FILE };
