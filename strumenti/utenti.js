#!/usr/bin/env node
/*
 * Gestione utenti del sito notizie. Non esiste registrazione pubblica: gli
 * utenti nascono solo da qui.
 *
 *   node strumenti/utenti.js crea <nome> [password]   (senza password: generata)
 *   node strumenti/utenti.js reimposta <nome> [password]
 *   node strumenti/utenti.js elenca
 *   node strumenti/utenti.js elimina <nome>
 *   node strumenti/utenti.js ruolo <nome> admin|utente
 *
 * Il ruolo admin si assegna SOLO da qui: dal browser un amministratore puo'
 * creare utenti, non altri amministratori. Chi rubasse una sessione admin non
 * potrebbe cosi' moltiplicare i propri accessi.
 *
 * La password iniziale si comunica in chat e vale UNA volta: al primo accesso
 * il sito obbliga a cambiarla, e da quel momento quella passata dalla chat non
 * vale piu'. Reimpostare fa lo stesso, e chiude le sessioni aperte altrove.
 *
 * In produzione: sudo -u pwanotifiche FILE_UTENTI=/opt/pwa-notifiche/data/utenti.json \
 *                  node /opt/pwa-notifiche/strumenti/utenti.js elenca
 */
const crypto = require('crypto');
const path = require('path');
const utenti = require(path.join(__dirname, '..', 'lib', 'utenti'));
const iscrizioni = require(path.join(__dirname, '..', 'lib', 'iscrizioni'));

const generaPassword = utenti.generaPassword;

const [comando, nome, pw] = process.argv.slice(2);
try {
  switch (comando) {
    case 'crea': {
      const password = pw || generaPassword();
      const u = utenti.crea(nome, password);
      console.log(`creato ${u.nome}  password iniziale: ${password}  (da cambiare al primo accesso)`);
      break;
    }
    case 'reimposta': {
      const password = pw || generaPassword();
      utenti.reimpostaPassword(nome, password);
      console.log(`${nome}: nuova password iniziale ${password} — sessioni aperte chiuse, da cambiare al primo accesso`);
      break;
    }
    case 'ruolo': {
      utenti.impostaRuolo(nome, pw);
      console.log(`${nome}: ruolo ${pw}`);
      break;
    }
    case 'elenca':
      for (const u of utenti.leggi()) {
        const accese = Object.entries(u.griglia || {}).filter(([, f]) => f).map(([c, f]) => `${c}:${f}`);
        console.log(`${u.nome.padEnd(16)} ${(u.ruolo || 'utente').padEnd(7)} ${u.deveCambiare ? 'PASSWORD DA CAMBIARE' : 'attivo'.padEnd(20)}  ` +
          `dispositivi:${iscrizioni.perUtente(u.id).length}  ${accese.join(' ') || '(nessuna iscrizione)'}`);
      }
      break;
    case 'elimina': {
      const id = utenti.elimina(nome);
      if (!id) throw new Error('utente inesistente');
      // Le sue caselle sono dati personali quanto la password: vanno con lui.
      const tolte = iscrizioni.rimuoviPerUtente(id);
      console.log(`eliminato ${nome} e ${tolte} dispositivi`);
      break;
    }
    default:
      console.log('uso: utenti.js crea|reimposta|elenca|elimina|ruolo <nome> [password|admin|utente]');
      process.exit(1);
  }
} catch (e) {
  console.error('errore:', e.message);
  process.exit(1);
}
