/*
 * Il pianificatore: ogni minuto guarda la griglia di ogni utente e, per ogni
 * casella il cui intervallo e' trascorso, manda un riepilogo delle notizie
 * nuove di quella categoria.
 *
 * La frequenza e' un MASSIMO, non un appuntamento: "ogni ora" vuol dire al
 * piu' una notifica all'ora per quella categoria. Se nell'ora non e' uscito
 * niente, non parte niente — una notifica vuota insegna a ignorarle tutte.
 */
const utenti = require('./utenti');
const notizie = require('./notizie');
const registro = require('./registro');

const LETTURA_FEED_MS = 5 * 60e3; // la frequenza minima offerta agli utenti
const GIRO_MS = 60e3;

/** Il testo della notifica: corto, perche' compare sullo schermo bloccato. */
function componi(categoria, voci) {
  const n = voci.length;
  return {
    titolo: `${notizie.ETICHETTE[categoria]} · ${n === 1 ? '1 notizia' : n + ' notizie'}`,
    testo: voci.slice(0, 2).map((v) => '• ' + v.titolo).join('\n').slice(0, 280),
    url: `/?categoria=${encodeURIComponent(categoria)}`,
  };
}

/**
 * Il riepilogo di PIU' categorie in una notifica sola.
 * Con quattro caselle a "5 minuti" si arriverebbe a quattro notifiche ogni
 * cinque minuti: e' il modo piu' rapido per far spegnere tutto. Una per giro.
 */
function componiGruppo(gruppi) {
  if (gruppi.length === 1) return componi(gruppi[0].categoria, gruppi[0].voci);
  const totale = gruppi.reduce((t, g) => t + g.voci.length, 0);
  return {
    titolo: `${totale} notizie per te`,
    // Una riga per categoria, col primo titolo: sullo schermo bloccato si vede
    // subito di cosa si tratta senza aprire nulla.
    testo: gruppi.map((g) => `${notizie.ETICHETTE[g.categoria]} (${g.voci.length}): ${g.voci[0].titolo}`)
      .join('\n').slice(0, 300),
    url: '/',
  };
}

/**
 * Un giro: per ogni utente, raccoglie le categorie il cui intervallo e'
 * trascorso E che hanno notizie nuove, e manda UNA notifica con tutte.
 * `spedisciAUtente(utenteId, messaggio, contesto)` la fornisce il server, che e'
 * l'unico a conoscere iscrizioni e chiavi VAPID.
 */
async function giro(spedisciAUtente) {
  const adesso = Date.now();
  for (const u of utenti.leggi()) {
    if (u.deveCambiare) continue; // account non ancora attivato davvero
    const gruppi = [];
    for (const [categoria, freq] of Object.entries(u.griglia || {})) {
      if (!freq) continue;
      const ultimo = (u.ultimoInvio || {})[categoria];
      if (ultimo && adesso - Date.parse(ultimo) < utenti.FREQUENZE[freq]) continue;
      const voci = notizie.nuoveDal(categoria, ultimo);
      if (voci.length) gruppi.push({ categoria, freq, voci });
    }
    if (!gruppi.length) continue; // niente di nuovo: niente notifica

    const esito = await spedisciAUtente(u.id, componiGruppo(gruppi), 'riepilogo');
    // Si segna l'invio solo se c'era almeno un dispositivo: un utente senza
    // dispositivi non deve "consumare" notizie che non ha mai ricevuto.
    if (esito.dispositivi > 0) {
      for (const g of gruppi) utenti.segnaInvio(u.id, g.categoria, new Date(adesso).toISOString());
    }
    registro.annota('riepilogo', {
      utente: u.nome,
      categoria: gruppi.map((g) => g.categoria).join('+'),
      frequenza: gruppi.map((g) => g.freq).join('+'),
      notizie: gruppi.reduce((t, g) => t + g.voci.length, 0),
      dispositivi: esito.dispositivi, riusciti: esito.riusciti,
    });
  }
}

function avvia(spedisciAUtente) {
  const leggi = () => notizie.aggiorna()
    .then((es) => {
      const ko = es.filter((e) => !e.ok);
      registro.annota('feed-letti', {
        nuove: es.reduce((t, e) => t + (e.nuove || 0), 0),
        falliti: ko.length,
        nota: ko.map((e) => `${e.fonte}/${e.categoria}: ${e.errore}`).join('; ') || undefined,
      });
    })
    .catch((e) => console.error('[notizie]', e.message));

  leggi();
  setInterval(leggi, LETTURA_FEED_MS).unref();
  setInterval(() => giro(spedisciAUtente).catch((e) => console.error('[pianificatore]', e)), GIRO_MS).unref();
}

module.exports = { avvia, giro, componi, componiGruppo };
