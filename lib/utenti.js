/*
 * Utenti del sito notizie. Li crea solo l'amministratore (strumenti/utenti.js):
 * non esiste registrazione pubblica.
 *
 * Password con scrypt di Node, nessuna libreria: e' una funzione di
 * derivazione pensata apposta per rendere costoso il tentativo a forza bruta.
 * Ogni utente nasce con deveCambiare = true: la password iniziale passa dalla
 * chat, e deve smettere di valere al primo accesso.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = process.env.FILE_UTENTI || path.join(__dirname, '..', 'data', 'utenti.json');

const CATEGORIE = ['politica', 'mercati', 'sport', 'guerre-macro'];
// Millisecondi. Le chiavi sono quelle che arrivano dall'interfaccia.
const FREQUENZE = { '5m': 5 * 60e3, '1h': 3600e3, '1g': 86400e3, '1s': 7 * 86400e3 };

function leggi() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { return []; }
}

function scrivi(elenco) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(elenco, null, 2), { mode: 0o600 });
  fs.renameSync(FILE + '.tmp', FILE);
}

/**
 * Password iniziale. Senza caratteri ambigui (0/O, 1/l/I): passa dalla chat o
 * da uno schermo all'altro, e non deve poter essere ricopiata male.
 */
function generaPassword() {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(14), (x) => alfabeto[x % alfabeto.length]).join('');
}

function hashPassword(password) {
  const sale = crypto.randomBytes(16);
  const h = crypto.scryptSync(password, sale, 64);
  return sale.toString('hex') + ':' + h.toString('hex');
}

function passwordGiusta(password, memorizzato) {
  const [sale, h] = String(memorizzato).split(':');
  if (!sale || !h) return false;
  const prova = crypto.scryptSync(password, Buffer.from(sale, 'hex'), 64);
  // timingSafeEqual: il confronto non deve durare di piu' quando i primi byte
  // coincidono, o il tempo di risposta diventa un indizio.
  return crypto.timingSafeEqual(prova, Buffer.from(h, 'hex'));
}

function pubblico(u) {
  if (!u) return null;
  return {
    id: u.id, nome: u.nome, deveCambiare: u.deveCambiare, ruolo: u.ruolo || 'utente',
    creato: u.creato,
    griglia: u.griglia, ultimoInvio: u.ultimoInvio,
  };
}

function trova(id) { return leggi().find((u) => u.id === id) || null; }
function trovaPerNome(nome) {
  const n = String(nome || '').trim().toLowerCase();
  return leggi().find((u) => u.nome === n) || null;
}

function crea(nome, password) {
  const n = String(nome || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(n)) throw new Error('nome non valido (3-32 caratteri: lettere, cifre, . _ -)');
  const elenco = leggi();
  if (elenco.some((u) => u.nome === n)) throw new Error('esiste gia\' un utente con questo nome');
  const u = {
    id: crypto.randomUUID(),
    nome: n,
    hash: hashPassword(password),
    deveCambiare: true,
    /* La griglia: per ogni categoria una frequenza, oppure null = non iscritto.
       Si parte tutto spento: l'utente sceglie, non subisce. */
    griglia: Object.fromEntries(CATEGORIE.map((c) => [c, null])),
    // Quando e' partito l'ultimo riepilogo PER CATEGORIA: ognuna ha il suo ritmo.
    ultimoInvio: Object.fromEntries(CATEGORIE.map((c) => [c, null])),
    // Si incrementa a ogni cambio di password: il cookie la porta con se', e un
    // cookie con la versione vecchia non vale piu'. E' cio' che fa morire le
    // sessioni aperte altrove quando la password cambia.
    versioneSessione: 1,
    // 'admin' crea, reimposta ed elimina gli altri. Si nasce 'utente': admin
    // lo si diventa solo da terminale, mai dal browser.
    ruolo: 'utente',
    creato: new Date().toISOString(),
  };
  elenco.push(u);
  scrivi(elenco);
  return pubblico(u);
}

function verifica(nome, password) {
  const u = trovaPerNome(nome);
  if (!u) {
    // Si spende lo stesso tempo anche per un nome inesistente: altrimenti la
    // velocita' della risposta direbbe quali nomi esistono.
    hashPassword(String(password || ''));
    return null;
  }
  return passwordGiusta(String(password || ''), u.hash) ? pubblico(u) : null;
}

function modifica(id, fn) {
  const elenco = leggi();
  const u = elenco.find((x) => x.id === id);
  if (!u) return null;
  fn(u);
  scrivi(elenco);
  return pubblico(u);
}

function cambiaPassword(id, nuova) {
  if (String(nuova || '').length < 8) throw new Error('la password deve avere almeno 8 caratteri');
  return modifica(id, (u) => {
    u.hash = hashPassword(nuova);
    u.deveCambiare = false;
    u.versioneSessione = (u.versioneSessione || 1) + 1;
  });
}

function reimpostaPassword(nome, nuova) {
  const u = trovaPerNome(nome);
  if (!u) throw new Error('utente inesistente');
  return modifica(u.id, (x) => {
    x.hash = hashPassword(nuova);
    x.deveCambiare = true;
    x.versioneSessione = (x.versioneSessione || 1) + 1;
  });
}

/**
 * Aggiorna la griglia. Accetta solo categorie e frequenze conosciute: tutto il
 * resto viene scartato, non salvato. Un campo arbitrario nell'archivio e' il
 * primo passo per un campo arbitrario in una notifica.
 */
function aggiornaGriglia(id, griglia) {
  const pulita = {};
  for (const c of CATEGORIE) {
    const f = griglia ? griglia[c] : null;
    if (f !== null && f !== undefined && !FREQUENZE[f]) throw new Error(`frequenza non valida per ${c}`);
    pulita[c] = f || null;
  }
  return modifica(id, (u) => {
    const adesso = new Date().toISOString();
    u.ultimoInvio = u.ultimoInvio || {};
    for (const c of CATEGORIE) {
      // Si parte da adesso per ogni casella accesa o cambiata: senza, passare
      // da "settimana" a "5 minuti" scaricherebbe subito una settimana di
      // arretrati sul telefono.
      if (pulita[c] && pulita[c] !== (u.griglia || {})[c]) u.ultimoInvio[c] = adesso;
    }
    u.griglia = pulita;
  });
}

function segnaInvio(id, categoria, quando) {
  return modifica(id, (u) => {
    u.ultimoInvio = u.ultimoInvio || {};
    u.ultimoInvio[categoria] = quando || new Date().toISOString();
  });
}

function versioneSessione(id) {
  const u = trova(id);
  return u ? (u.versioneSessione || 1) : null;
}

function impostaRuolo(nome, ruolo) {
  if (!['admin', 'utente'].includes(ruolo)) throw new Error('ruolo non valido');
  const u = trovaPerNome(nome);
  if (!u) throw new Error('utente inesistente');
  if (ruolo === 'utente' && u.ruolo === 'admin' && leggi().filter((x) => x.ruolo === 'admin').length === 1) {
    throw new Error('e\' l\'unico amministratore: togliergli il ruolo lascerebbe il sito senza');
  }
  return modifica(u.id, (x) => { x.ruolo = ruolo; });
}

function elimina(nome) {
  const u = trovaPerNome(nome);
  if (!u) return false;
  scrivi(leggi().filter((x) => x.id !== u.id));
  return u.id;
}

module.exports = {
  CATEGORIE, FREQUENZE, leggi, trova, trovaPerNome, crea, verifica,
  cambiaPassword, reimpostaPassword, impostaRuolo, generaPassword, aggiornaGriglia, segnaInvio, versioneSessione,
  elimina, pubblico,
};
