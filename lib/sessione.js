/*
 * Sessione in un cookie firmato con HMAC. Niente archivio delle sessioni, niente
 * libreria: il cookie contiene id utente e scadenza, e la firma garantisce che
 * nessuno l'abbia scritto a mano. Senza la firma, chiunque potrebbe mettere
 * l'id di un altro nel cookie e diventare lui.
 */
const crypto = require('crypto');

const NOME = 'sessione';
const DURATA_MS = 30 * 86400e3; // 30 giorni: un'app installata non deve chiedere l'accesso ogni giorno

function segreto() {
  const s = process.env.SESSIONE_SEGRETO;
  if (!s || s.length < 32) throw new Error('SESSIONE_SEGRETO assente o troppo corto');
  return s;
}

function firma(dati) {
  return crypto.createHmac('sha256', segreto()).update(dati).digest('base64url');
}

function crea(res, utenteId, versione, req) {
  const corpo = Buffer.from(JSON.stringify({ u: utenteId, v: versione, s: Date.now() + DURATA_MS })).toString('base64url');
  const valore = corpo + '.' + firma(corpo);
  const sicura = (req.get('x-forwarded-proto') || req.protocol) === 'https';
  res.cookie(NOME, valore, {
    httpOnly: true,        // il JavaScript della pagina non puo' leggerlo
    sameSite: 'lax',       // non parte da richieste POST di altri siti
    secure: sicura,
    maxAge: DURATA_MS,
    path: '/',
  });
}

function leggi(req) {
  const grezzo = (req.headers.cookie || '').split(';').map((x) => x.trim())
    .find((x) => x.startsWith(NOME + '='));
  if (!grezzo) return null;
  const [corpo, f] = grezzo.slice(NOME.length + 1).split('.');
  if (!corpo || !f) return null;
  const atteso = firma(corpo);
  if (f.length !== atteso.length ||
      !crypto.timingSafeEqual(Buffer.from(f), Buffer.from(atteso))) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    // Restituisce anche la versione: e' chi chiama a confrontarla con quella
    // dell'utente, perche' qui non si sa nulla degli utenti.
    return d.s > Date.now() ? { utenteId: d.u, versione: d.v } : null;
  } catch (e) { return null; }
}

function chiudi(res) { res.clearCookie(NOME, { path: '/' }); }

module.exports = { crea, leggi, chiudi };
