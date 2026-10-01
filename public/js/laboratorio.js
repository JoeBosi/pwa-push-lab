/*
 * La pagina dello strumento: il verbale dell'esperimento, in tempo reale.
 *
 * Si tiene aperta su un altro schermo mentre si prova dal telefono. Ogni passo
 * che avviene sul dispositivo compare qui entro due secondi, e quando qualcosa
 * non funziona si vede DOVE la sequenza si e' interrotta — che e' l'unica
 * informazione utile, e l'unica che senza questa pagina bisognerebbe indovinare.
 *
 * Non registra alcun service worker: uno strumento di misura non deve avere
 * niente in comune con l'apparecchio che misura.
 */
(function () {
  'use strict';

  var CHIAVE_TOKEN = 'banco-token';
  var PAUSA_MS = 2000;

  var token = '';
  var visti = new Set();
  var inPausa = false;
  // Il filtro vive anche nell'URL: ricaricando, o condividendo il collegamento,
  // si ritrova la stessa vista.
  var filtroAttivo = new URLSearchParams(location.search).get('filtro') || 'tutti';
  var ultimeVoci = [];
  var timer = null;

  var el = function (id) { return document.getElementById(id); };

  /* ---------------------------------------------------- vocabolario ------ */

  // tipo evento → [icona, testo, classe]. Il testo e' scritto per essere letto
  // da chi non ricorda come si chiamano le rotte.
  var VOCI = {
    'app-aperta': ['📱', 'app aperta', ''],
    'sw-registrato': ['⚙️', 'service worker pronto', ''],
    'sw-errore': ['💥', 'service worker in errore', 'errore'],
    'permesso-concesso': ['✅', 'permesso concesso', ''],
    'permesso-negato': ['⛔', 'permesso NEGATO', 'errore'],
    'permesso-ignorato': ['🤷', 'permesso non deciso', ''],
    'iscrizione': ['📝', 'registrato sul server', ''],
    'iscrizione-creata': ['🔔', 'iscrizione push creata', ''],
    'iscrizione-fallita': ['💥', 'iscrizione fallita', 'errore'],
    'disiscrizione': ['🗑️', 'disiscritto', ''],
    'invio-richiesto': ['📤', 'invio richiesto', ''],
    'invio-esito': ['📡', 'consegnata al servizio push', ''],
    'notifica-mostrata': ['🎉', 'COMPARSA SUL DISPOSITIVO', 'comparsa'],
    'notifica-toccata': ['👆', 'notifica toccata', ''],
    // il sito notizie
    'accesso': ['🔑', 'accesso', ''],
    'accesso-fallito': ['🚫', 'accesso fallito', 'errore'],
    'password-cambiata': ['🔐', 'password cambiata', ''],
    'uscita': ['🚪', 'uscito', ''],
    'griglia': ['🗂️', 'griglia aggiornata', ''],
    'feed-letti': ['📰', 'feed letti', ''],
    'riepilogo': ['🗞️', 'riepilogo notizie', ''],
  };

  var GRUPPI = {
    tutti: null,
    dispositivo: ['app-aperta', 'sw-registrato', 'sw-errore', 'permesso-concesso',
      'permesso-negato', 'permesso-ignorato', 'notifica-mostrata', 'notifica-toccata'],
    invii: ['invio-richiesto', 'invio-esito', 'notifica-mostrata'],
    problemi: ['sw-errore', 'permesso-negato', 'iscrizione-fallita', 'accesso-fallito'],
    notizie: ['accesso', 'griglia', 'riepilogo', 'feed-letti', 'uscita', 'password-cambiata'],
  };

  /* --------------------------------------------------------- accesso ----- */

  function entra() {
    var valore = el('campo-token').value.trim();
    if (!valore) return;
    verifica(valore);
  }

  function verifica(valore) {
    el('esito-accesso').textContent = 'Verifico…';
    el('esito-accesso').className = 'esito';

    fetch('/api/registro?quante=1', { headers: { 'X-Token-Invio': valore } })
      .then(function (r) {
        if (r.status === 401) throw new Error('Token non valido.');
        if (r.status === 503) return r.json().then(function (j) { throw new Error(j.errore); });
        if (!r.ok) throw new Error('Il server ha risposto ' + r.status + '.');

        token = valore;
        // sessionStorage e non localStorage: il token sparisce quando si chiude
        // la scheda. Un segreto che sopravvive alla sessione va custodito, non
        // parcheggiato nel browser.
        try { sessionStorage.setItem(CHIAVE_TOKEN, valore); } catch (e) { /* privata */ }
        el('riquadro-accesso').classList.add('nascosto');
        el('pannello').classList.remove('nascosto');
        avvia();
      })
      .catch(function (e) {
        el('esito-accesso').textContent = e.message;
        el('esito-accesso').className = 'esito guasto';
      });
  }

  /* ----------------------------------------------------- aggiornamento --- */

  function connessione(classe, testo) {
    var box = el('lab-connessione');
    box.className = 'lab-stato ' + classe;
    box.lastElementChild.textContent = testo;
  }

  function aggiorna() {
    if (inPausa) return Promise.resolve();

    return Promise.all([
      fetch('/api/registro?quante=300', { headers: { 'X-Token-Invio': token } }).then(function (r) { return r.json(); }),
      fetch('/api/stato').then(function (r) { return r.json(); }),
    ]).then(function (risposte) {
      var reg = risposte[0], stato = risposte[1];
      connessione('viva', 'in ascolto · ogni 2s');
      // Il server le manda dalla piu' recente; un verbale si legge dall'inizio.
      ultimeVoci = (reg.voci || []).slice().reverse();
      disegnaMattonelle(reg.riepilogo, stato);
      disegnaVerbale();
      valutaAvviso(reg.riepilogo, stato);
    }).catch(function () {
      connessione('persa', 'server non raggiungibile');
    });
  }

  function disegnaMattonelle(r, stato) {
    el('m-dispositivi').textContent = stato.totale;
    el('m-piattaforme').textContent = Object.keys(stato.perPiattaforma || {})
      .map(function (k) { return k + ' ' + stato.perPiattaforma[k]; }).join(' · ');

    el('m-consegnate').textContent = r.invii.riusciti;
    el('m-fallite').textContent = r.invii.falliti
      ? r.invii.falliti + ' fallite (' + Object.keys(r.erroriPerCodice).join(', ') + ')'
      : 'nessuna fallita';

    var comparse = r.perTipo['notifica-mostrata'] || 0;
    var mc = el('m-comparse');
    mc.textContent = comparse;
    mc.className = comparse ? 'bene' : (r.invii.riusciti ? 'nulla' : '');

    // Mediana e non media: un singolo telefono rimasto offline mezz'ora
    // sposterebbe la media e farebbe sembrare lente anche le altre.
    var ritardi = ultimeVoci
      .filter(function (v) { return v.tipo === 'notifica-mostrata' && v.ritardoMs != null; })
      .map(function (v) { return v.ritardoMs; }).sort(function (a, b) { return a - b; });
    el('m-ritardo').textContent = ritardi.length
      ? (ritardi[Math.floor(ritardi.length / 2)] / 1000).toFixed(1) + 's'
      : '—';
  }

  /* Il messaggio che interpreta i numeri, invece di lasciarli interpretare. */
  function valutaAvviso(r, stato) {
    var avviso = el('avviso');
    var comparse = r.perTipo['notifica-mostrata'] || 0;
    var testo = '';

    if (stato.totale === 0) {
      testo = 'Nessun dispositivo iscritto. Apri la PWA dal telefono e attiva le notifiche.';
    } else if (r.perTipo['permesso-negato']) {
      testo = 'Un dispositivo ha NEGATO il permesso. Il browser non lo richiederà più: ' +
        'va riaperto dalle impostazioni di sistema per quell\'app.';
    } else if (r.invii.falliti && r.erroriPerCodice['403']) {
      testo = 'Errori 403: quelle iscrizioni sono state fatte con una coppia di chiavi VAPID ' +
        'diversa da quella attuale. Vanno rifatte dal dispositivo.';
    } else if (r.invii.riusciti && comparse === 0) {
      testo = 'Il servizio push ha accettato ' + r.invii.riusciti + ' invii, ma nessun dispositivo ' +
        'ha riferito di aver mostrato la notifica. Il telefono era offline, oppure le notifiche ' +
        'sono silenziate per quell\'app nelle impostazioni di sistema.';
    } else if (comparse && r.invii.riusciti) {
      avviso.classList.add('nascosto');
      return;
    }

    if (!testo) { avviso.classList.add('nascosto'); return; }
    avviso.textContent = testo;
    avviso.classList.remove('nascosto');
  }

  function disegnaVerbale() {
    var lista = el('verbale');
    var ammessi = GRUPPI[filtroAttivo];
    var voci = ammessi ? ultimeVoci.filter(function (v) { return ammessi.indexOf(v.tipo) > -1; }) : ultimeVoci;

    el('conta-eventi').textContent = voci.length ? '— ' + voci.length + ' eventi' : '';
    el('verbale-vuoto').classList.toggle('nascosto', voci.length > 0);

    lista.innerHTML = '';
    voci.forEach(function (v) {
      var def = VOCI[v.tipo] || ['·', v.tipo, ''];
      var li = document.createElement('li');
      li.className = def[2];

      var id = v.quando + v.tipo + (v.dispositivo || '');
      if (!visti.has(id)) { visti.add(id); li.classList.add('nuova'); }

      li.appendChild(campo('quando', orario(v.quando)));
      li.appendChild(campo('icona', def[0]));

      var cosa = def[1];
      if (v.tipo === 'invio-esito' && !v.ok) { cosa = 'invio fallito — ' + (v.motivo || v.stato); li.classList.add('errore'); }
      if (v.tipo === 'notifica-mostrata' && v.ritardoMs != null) {
        cosa += ' (' + (v.ritardoMs / 1000).toFixed(1) + 's dopo l\'invio)';
      }
      if (v.tipo === 'invio-richiesto' && v.ritardo) cosa += ' — differito di ' + v.ritardo + 's';
      li.appendChild(campo('cosa', cosa));

      if (v.tipo === 'riepilogo') cosa += ' — ' + v.categoria + ' (' + v.frequenza + '): ' + v.notizie + ' notizie, ' + v.riusciti + '/' + v.dispositivi + ' dispositivi';
      if (v.tipo === 'feed-letti') cosa += ' — ' + v.nuove + ' nuove' + (v.falliti ? ', ' + v.falliti + ' feed in errore' : '');
      if (v.falliti) li.classList.add('errore');
      var chi = [
        v.utente, v.piattaforma, v.servizio, v.dispositivo,
        v.installata === true ? 'installata' : v.installata === false ? 'nel browser' : '',
        v.nota,
      ].filter(Boolean).join(' · ');
      li.appendChild(campo('chi', chi));

      lista.appendChild(li);
    });

    // Il fondo e' il presente: mentre si prova col telefono si guarda li'.
    if (!inPausa && voci.length) lista.lastElementChild.scrollIntoView({ block: 'nearest' });
  }

  function campo(classe, testo) {
    var s = document.createElement('span');
    s.className = classe;
    s.textContent = testo;
    return s;
  }

  function orario(iso) {
    try { return new Date(iso).toLocaleTimeString('it-IT', { hour12: false }); }
    catch (e) { return '--:--:--'; }
  }

  /* -------------------------------------------------------- strumenti ---- */

  function inviaATutti() {
    var btn = el('btn-invia-tutti');
    btn.disabled = true;
    el('esito-strumenti').textContent = 'Invio…';
    el('esito-strumenti').className = 'esito';

    fetch('/api/invia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Token-Invio': token },
      body: JSON.stringify({
        titolo: 'Dal banco di prova',
        testo: 'Invio collettivo delle ' + new Date().toLocaleTimeString('it-IT') + '.',
      }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, dati: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.dati.errore + (res.dati.rimedio ? ' — ' + res.dati.rimedio : ''));
        el('esito-strumenti').textContent = 'Consegnata a ' + res.dati.inviate + '/' + res.dati.totale +
          ' dispositivi. Guarda il verbale: la conferma vera è «COMPARSA SUL DISPOSITIVO».';
        el('esito-strumenti').className = 'esito ok';
        aggiorna();
      })
      .catch(function (e) {
        el('esito-strumenti').textContent = e.message;
        el('esito-strumenti').className = 'esito guasto';
      })
      .then(function () { btn.disabled = false; });
  }

  function commutaPausa() {
    inPausa = !inPausa;
    el('btn-pausa').textContent = inPausa ? 'Riprendi' : 'Metti in pausa';
    connessione(inPausa ? 'ferma' : 'viva', inPausa ? 'in pausa' : 'in ascolto · ogni 2s');
    if (!inPausa) aggiorna();
  }

  /* ------------------------------------------------------------ avvio ---- */

  function costruisciFiltri() {
    var etichette = { tutti: 'Tutto', dispositivo: 'Dal dispositivo', invii: 'Invii', notizie: 'Sito notizie', problemi: 'Solo problemi' };
    Object.keys(GRUPPI).forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'filtro' + (k === filtroAttivo ? ' attivo' : '');
      b.textContent = etichette[k];
      b.addEventListener('click', function () {
        filtroAttivo = k;
        history.replaceState(null, '', k === 'tutti' ? location.pathname : '?filtro=' + k);
        Array.prototype.forEach.call(document.querySelectorAll('.filtro'), function (x) {
          x.classList.toggle('attivo', x === b);
        });
        disegnaVerbale();
      });
      el('filtri').appendChild(b);
    });
  }

  function avvia() {
    costruisciFiltri();
    aggiorna();
    timer = setInterval(aggiorna, PAUSA_MS);
  }

  el('lab-server').textContent = location.origin;
  el('btn-entra').addEventListener('click', entra);
  el('campo-token').addEventListener('keydown', function (e) { if (e.key === 'Enter') entra(); });
  el('btn-invia-tutti').addEventListener('click', inviaATutti);
  el('btn-pausa').addEventListener('click', commutaPausa);

  // Ricaricando la pagina durante una prova non si deve reinserire il token.
  var salvato = null;
  try { salvato = sessionStorage.getItem(CHIAVE_TOKEN); } catch (e) { /* privata */ }
  if (salvato) verifica(salvato);
})();
