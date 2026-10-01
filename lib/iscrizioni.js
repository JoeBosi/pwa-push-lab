/*
 * Archivio delle iscrizioni push su file JSON.
 *
 * Un file basta: le iscrizioni di un banco di prova sono decine, non milioni, e
 * un database qui aggiungerebbe una dipendenza e un servizio da tenere vivo
 * senza risolvere nessun problema che abbiamo davvero.
 *
 * L'endpoint e' la chiave: e' l'URL che il server push assegna a quel
 * dispositivo per quel sito, ed e' unico. Riaprendo la stessa app lo stesso
 * telefono ripresenta lo stesso endpoint, quindi va aggiornato, non duplicato.
 */
const fs = require('fs');
const path = require('path');

const FILE = process.env.FILE_ISCRIZIONI ||
  path.join(__dirname, '..', 'data', 'iscrizioni.json');

function leggi() {
  try {
    const dati = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(dati) ? dati : [];
  } catch (e) {
    // File assente al primo avvio: e' la normalita', non un errore.
    if (e.code === 'ENOENT') return [];
    // File corrotto: meglio ripartire da zero che rifiutarsi di avviarsi. Le
    // iscrizioni si ricreano da sole alla prossima apertura dell'app.
    console.error('iscrizioni.json illeggibile, riparto vuoto:', e.message);
    return [];
  }
}

function scrivi(elenco) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  // Scrittura atomica: un'interruzione a meta' lascerebbe un JSON troncato, e
  // al riavvio si perderebbero tutte le iscrizioni invece di una.
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(elenco, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FILE);
}

/** Riconosce la piattaforma dallo user agent. Serve solo alla diagnostica. */
function piattaforma(ua = '') {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'sconosciuta';
}

/** Una subscription valida ha endpoint https e le due chiavi di cifratura. */
function valida(s) {
  return !!(s && typeof s.endpoint === 'string' &&
    s.endpoint.startsWith('https://') &&
    s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string');
}

/**
 * `utenteId` arriva SEMPRE dalla sessione verificata dal server, mai dal corpo
 * della richiesta: chi potesse sceglierlo riceverebbe le notifiche di un altro.
 * null = dispositivo anonimo (il banco di prova): non ricevera' mai notizie,
 * perche' il pianificatore spedisce solo per utente.
 */
function aggiungi(iscrizione, ua, utenteId) {
  const elenco = leggi();
  const esistente = elenco.findIndex((x) => x.endpoint === iscrizione.endpoint);
  const voce = {
    endpoint: iscrizione.endpoint,
    keys: iscrizione.keys,
    expirationTime: iscrizione.expirationTime ?? null,
    // Lo stesso dispositivo usato da un altro utente cambia proprietario: chi si
    // iscrive adesso e' chi lo ha in mano adesso.
    utenteId: utenteId || null,
    userAgent: (ua || '').slice(0, 300),
    piattaforma: piattaforma(ua),
    creata: esistente >= 0 ? elenco[esistente].creata : new Date().toISOString(),
    aggiornata: new Date().toISOString(),
  };
  if (esistente >= 0) elenco[esistente] = voce; else elenco.push(voce);
  scrivi(elenco);
  return { nuova: esistente < 0, totale: elenco.length };
}

function rimuovi(endpoint) {
  const elenco = leggi();
  const restanti = elenco.filter((x) => x.endpoint !== endpoint);
  if (restanti.length !== elenco.length) scrivi(restanti);
  return { rimosse: elenco.length - restanti.length, totale: restanti.length };
}

function perUtente(utenteId) {
  return utenteId ? leggi().filter((x) => x.utenteId === utenteId) : [];
}

/**
 * Al logout si tolgono TUTTE le caselle dell'utente: altrimenti quei
 * dispositivi continuerebbero a ricevere le sue notizie, e sullo schermo
 * bloccato di un telefono prestato comparirebbe roba sua.
 */
function rimuoviPerUtente(utenteId) {
  const elenco = leggi();
  const restanti = elenco.filter((x) => x.utenteId !== utenteId);
  if (restanti.length !== elenco.length) scrivi(restanti);
  return elenco.length - restanti.length;
}

/** Riepilogo per il pannello diagnostico: nessun endpoint, nessuna chiave. */
function riepilogo() {
  const elenco = leggi();
  const per = {};
  for (const v of elenco) per[v.piattaforma] = (per[v.piattaforma] || 0) + 1;
  return {
    totale: elenco.length,
    perPiattaforma: per,
    ultima: elenco.length ? elenco[elenco.length - 1].aggiornata : null,
  };
}

module.exports = { leggi, scrivi, aggiungi, rimuovi, perUtente, rimuoviPerUtente, riepilogo, piattaforma, valida, FILE };
