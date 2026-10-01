#!/usr/bin/env node
/*
 * Genera la coppia di chiavi VAPID e scrive .env.
 *
 * Si esegue UNA volta. Rigenerarla invalida tutte le iscrizioni gia' raccolte:
 * i dispositivi restano iscritti con la vecchia chiave pubblica e ogni invio
 * fallirebbe con 403. Per questo lo script si rifiuta di sovrascrivere un .env
 * esistente senza --forza.
 */
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const ROOT = path.join(__dirname, '..');
const ENV = path.join(ROOT, '.env');
const forza = process.argv.includes('--forza');

if (fs.existsSync(ENV) && !forza) {
  console.error('.env esiste gia\'.');
  console.error('Rigenerare le chiavi invalida TUTTE le iscrizioni push esistenti.');
  console.error('Se e\' davvero quello che vuoi:  node strumenti/genera-vapid.js --forza');
  console.error('e subito dopo svuota data/iscrizioni.json, che non e\' piu\' utilizzabile.');
  process.exit(1);
}

const chiavi = webpush.generateVAPIDKeys();
// Va passato un recapito vero: VAPID_SUBJECT=mailto:tu@dominio.it node strumenti/genera-vapid.js
// Senza, si scrive un segnaposto da correggere a mano nel .env.
const soggetto = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
if (!process.env.VAPID_SUBJECT) {
  console.error('Nota: VAPID_SUBJECT non indicato, scritto un segnaposto. Correggilo nel .env.');
}

const contenuto = `# Generato da strumenti/genera-vapid.js il ${new Date().toISOString()}
# La chiave privata firma le notifiche: non versionare, non incollare altrove.
VAPID_PUBLIC_KEY=${chiavi.publicKey}
VAPID_PRIVATE_KEY=${chiavi.privateKey}
VAPID_SUBJECT=${soggetto}

# Se valorizzato, l'invio richiede questo token.
TOKEN_INVIO=

# Firma i cookie di sessione del sito notizie. Chi lo conosce puo' fabbricarsi
# il cookie di qualunque utente: stesso trattamento della chiave privata.
SESSIONE_SEGRETO=${require('crypto').randomBytes(48).toString('base64url')}

HOST=127.0.0.1
PORT=3020
`;

// 0600: la chiave privata non e' leggibile dagli altri utenti della macchina.
fs.writeFileSync(ENV, contenuto, { mode: 0o600 });
fs.chmodSync(ENV, 0o600);

console.log('Scritto .env (permessi 0600).');
console.log('Chiave pubblica: ' + chiavi.publicKey);
console.log('La privata e\' nel file: non stamparla in console ne\' nei log.');
