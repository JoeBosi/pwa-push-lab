/*
 * La pagina: una carta sola che dice sempre cosa succede adesso, la prova, e la
 * conferma quando la notifica arriva davvero.
 *
 * L'installazione e il permesso NON stanno piu' qui: li gestisce il componente
 * <pwa-invito> (componente/pwa-invito.js), che e' scritto per essere copiato in
 * un altro progetto senza portarsi dietro nulla di questo. Qui resta cio' che e'
 * proprio di questa app: il service worker, l'iscrizione push, gli invii di
 * prova e le annotazioni sul verbale.
 */
(function () {
  'use strict';

  var el = function (id) { return document.getElementById(id); };

  var carta = el('carta');
  var pastiglia = el('pastiglia');
  var pastigliaTesto = el('pastiglia-testo');
  var titolo = el('carta-titolo');
  var testo = el('carta-testo');
  var btnAttiva = el('btn-attiva');
  var btnInstalla = el('btn-installa');
  var esito = el('esito');
  var cartaProva = el('carta-prova');
  var btnProva = el('btn-prova');
  var btnDifferita = el('btn-prova-differita');
  var conto = el('conto');
  var contoNumero = el('conto-numero');
  var contoTesto = el('conto-testo');
  var arco = el('arco');
  var festa = el('festa');
  var festaTesto = el('festa-testo');
  var btnAncora = el('btn-ancora');
  var btnRiaccendi = el('btn-riaccendi');

  var invito = document.querySelector('pwa-invito');

  var registrazione = null;
  var iscrizione = null;
  var amb = { iOS: false, installata: false, sicura: window.isSecureContext };

  var supportoSW = 'serviceWorker' in navigator;
  var supportoPush = 'PushManager' in window;
  var supportoNotifiche = 'Notification' in window;

  /* --------------------------------------------------------- il verbale -- */

  function annota(evento, dettagli) {
    var d = dettagli || {};
    d.installata = amb.installata;
    if (iscrizione) d.endpoint = iscrizione.endpoint;
    return fetch('/api/annota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evento: evento, dettagli: d }),
    }).catch(function () { /* il registro non deve poter rompere la pagina */ });
  }

  /* ------------------------------------------------------------- la carta */

  function stato(classe, etichetta) {
    pastiglia.className = 'pastiglia' + (classe ? ' ' + classe : '');
    pastigliaTesto.textContent = etichetta;
  }

  function dici(messaggio, classe) {
    esito.textContent = messaggio || '';
    esito.className = 'esito' + (classe ? ' ' + classe : '');
  }

  /**
   * L'unico punto in cui si decide cosa l'utente puo' fare. Averne uno solo
   * evita che l'interfaccia dica una cosa e il dispositivo ne faccia un'altra —
   * che era il difetto della vecchia pagina a tre riquadri.
   */
  function aggiorna() {
    btnAttiva.classList.add('nascosto');
    btnInstalla.classList.add('nascosto');
    carta.classList.remove('risolta');

    if (!amb.sicura) {
      stato('guasto', 'Connessione non sicura');
      titolo.textContent = 'Serve HTTPS';
      testo.textContent = 'Le notifiche push richiedono una connessione sicura con ' +
        'certificato valido. Apri il sito via https://, non via http:// o indirizzo IP.';
      return;
    }

    if (!supportoSW || !supportoPush || !supportoNotifiche) {
      stato('guasto', 'Non supportate');
      titolo.textContent = 'Questo browser non può ricevere notifiche';
      testo.textContent = amb.iOS
        ? 'Su iPhone servono iOS 16.4 o successivo, e l\'app aggiunta alla schermata Home.'
        : 'Prova con Chrome, Edge o Firefox aggiornati.';
      return;
    }

    // Gia' installata, ma la stiamo guardando nel browser. Le notifiche
    // andranno all'app, non a questa scheda: iscriversi di nuovo da qui
    // creerebbe una seconda iscrizione e una confusione difficile da sbrogliare.
    if (amb.giaInstallata === true && !amb.installata) {
      stato('attesa', 'Aprila dall\'app');
      titolo.textContent = 'Ce l\'hai già installata';
      testo.textContent = amb.catturaLink
        ? 'Stai guardando la versione nel browser. Aprila dalla sua icona: le notifiche ' +
          'arrivano all\'app installata, non a questa scheda.'
        : 'Aprila dalla sua icona sulla schermata Home.';
      btnInstalla.textContent = 'Come faccio?';
      btnInstalla.classList.remove('nascosto');
      btnInstalla.onclick = function () { invito.riaccendi(); };
      return;
    }

    // Il caso che fa fallire tutti: su iOS, prima dell'installazione, le API
    // esistono ma non funzionano. Un pulsante acceso qui insegnerebbe
    // all'utente che l'app e' rotta.
    if (amb.iOS && !amb.installata) {
      stato('attesa', 'Da installare');
      titolo.textContent = 'Prima aggiungila alla Home';
      testo.textContent = 'Su iPhone le notifiche funzionano solo dall\'app installata. ' +
        'Ti mostro come: sono tre tocchi, una volta sola.';
      btnInstalla.textContent = 'Mostrami come';
      btnInstalla.classList.remove('nascosto');
      btnInstalla.onclick = function () { invito.riaccendi(); };
      return;
    }

    var permesso = Notification.permission;

    if (permesso === 'denied') {
      stato('guasto', 'Permesso negato');
      titolo.textContent = 'Le notifiche sono bloccate';
      testo.textContent = amb.iOS
        ? 'Il browser non le richiederà più. Si riaccendono da Impostazioni → Notifiche, ' +
          'cercando questa app nell\'elenco.'
        : 'Il browser non le richiederà più. Tocca il lucchetto accanto all\'indirizzo → ' +
          'Notifiche → Consenti.';
      return;
    }

    if (iscrizione) {
      stato('ok', 'Attive');
      carta.classList.add('risolta');
      titolo.textContent = 'Notifiche attive su questo dispositivo';
      testo.textContent = amb.installata
        ? 'Tutto a posto. Ora la prova vera: chiudi l\'app dopo aver toccato «Fra 10 secondi».'
        : 'Funzionano già così. Installandola arriveranno anche a browser chiuso.';
      cartaProva.classList.remove('nascosto');
      return;
    }

    cartaProva.classList.add('nascosto');
    stato('', 'Pronte da attivare');
    titolo.textContent = 'Attiva le notifiche';
    testo.textContent = amb.installata
      ? 'Un tocco e il telefono chiederà il permesso.'
      : 'Puoi attivarle anche senza installare l\'app; installandola arriveranno ' +
        'anche a browser chiuso.';
    btnAttiva.classList.remove('nascosto');
    btnAttiva.disabled = false;
  }

  /* ---------------------------------------------------- service worker --- */

  function registraSW() {
    if (!supportoSW) return Promise.resolve(null);
    return navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(function () { return navigator.serviceWorker.ready; })
      .then(function (reg) {
        registrazione = reg;
        // Su iPhone in Safari — app NON installata — registration.pushManager
        // non esiste affatto. Non e' un guasto: e' il modello di Apple, ed e' il
        // caso piu' frequente. Chiamarlo lo stesso riempiva il verbale di
        // «service worker in errore» che mandavano a cercare guasti inesistenti.
        if (!reg.pushManager) {
          annota('sw-registrato', { nota: 'push non disponibile finché l\'app non è installata' });
          return null;
        }
        return reg.pushManager.getSubscription();
      })
      .then(function (sub) {
        iscrizione = sub;
        if (registrazione && registrazione.pushManager) {
          annota('sw-registrato', { nota: sub ? 'iscrizione già presente' : 'nessuna iscrizione' });
        }
        return sub;
      })
      .catch(function (e) {
        console.error('[app] service worker:', e);
        annota('sw-errore', { nota: e.message });
        return null;
      });
  }

  /* --------------------------------------------------------- iscrizione -- */

  function base64UrlToUint8Array(base64Url) {
    var padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    var base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    var grezzo = atob(base64);
    var out = new Uint8Array(grezzo.length);
    for (var i = 0; i < grezzo.length; i++) out[i] = grezzo.charCodeAt(i);
    return out;
  }

  /** Dal permesso concesso all'iscrizione registrata sul server. */
  function iscrivi() {
    dici('Iscrizione al servizio push…');
    return fetch('/api/chiave-pubblica')
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.errore || 'chiave non disponibile'); });
        return r.json();
      })
      .then(function (d) {
        return registrazione.pushManager.subscribe({
          userVisibleOnly: true,   // obbligatorio su Chrome, e comunque la regola
          applicationServerKey: base64UrlToUint8Array(d.chiave),
        });
      })
      .then(function (sub) {
        iscrizione = sub;
        return fetch('/api/iscrivi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ iscrizione: sub.toJSON() }),
        });
      })
      .then(function (r) {
        if (!r.ok) throw new Error('il server ha rifiutato l\'iscrizione (' + r.status + ')');
        annota('iscrizione-creata', { nota: 'servizio: ' + new URL(iscrizione.endpoint).host });
        dici('');
        aggiorna();
      })
      .catch(function (e) {
        console.error('[app] iscrizione:', e);
        annota('iscrizione-fallita', { nota: e.message });
        dici('Non è riuscita: ' + e.message, 'guasto');
        aggiorna();
      });
  }

  /** Il pulsante nella carta: chiede il permesso e poi iscrive. */
  function attiva() {
    btnAttiva.disabled = true;
    dici('Richiesta del permesso…');
    // requestPermission DEVE partire dal tocco, senza attese prima: un await
    // che lo preceda rompe il legame con il gesto e su iOS viene ignorata.
    Promise.resolve(Notification.requestPermission()).then(function (r) {
      var permesso = r || Notification.permission;
      annota(permesso === 'granted' ? 'permesso-concesso'
        : permesso === 'denied' ? 'permesso-negato' : 'permesso-ignorato', {});
      btnAttiva.disabled = false;
      if (permesso !== 'granted') { dici(''); aggiorna(); return; }
      return iscrivi();
    });
  }

  /* -------------------------------------------------------------- prove -- */

  function prova(ritardo) {
    if (!iscrizione) return;
    btnProva.disabled = btnDifferita.disabled = true;
    festa.classList.add('nascosto');
    dici(ritardo ? '' : 'Invio…');

    fetch('/api/prova', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: iscrizione.endpoint, ritardo: ritardo || 0 }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, dati: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.dati.errore || 'invio fallito');
        if (ritardo) return avviaConto(ritardo);
        var e = res.dati.esito || {};
        if (!e.ok) throw new Error(e.motivo || 'il servizio push ha rifiutato l\'invio');
        dici('Inviata. Dovrebbe comparire entro un paio di secondi.', 'ok');
      })
      .catch(function (err) {
        dici('Errore: ' + err.message, 'guasto');
        btnProva.disabled = btnDifferita.disabled = false;
      });
  }

  /**
   * Il conto alla rovescia. Non e' decorazione: e' la sola cosa che dice
   * all'utente che deve chiudere l'app ADESSO, ed e' il gesto senza il quale la
   * prova differita non dimostra niente.
   */
  function avviaConto(secondi) {
    var restanti = secondi;
    var CIRCONFERENZA = 276.5;
    conto.classList.remove('nascosto');
    contoTesto.textContent = 'Chiudi l\'app e blocca lo schermo';
    contoNumero.textContent = restanti;
    arco.style.strokeDashoffset = '0';

    var t = setInterval(function () {
      restanti--;
      contoNumero.textContent = Math.max(restanti, 0);
      arco.style.strokeDashoffset = String(CIRCONFERENZA * (1 - restanti / secondi));
      if (restanti > 0) return;
      clearInterval(t);
      // Se l'utente ha chiuso davvero l'app non leggera' mai questa riga — ed e'
      // esattamente il caso in cui la prova sta riuscendo.
      contoTesto.textContent = 'Inviata. Se sei ancora qui, riprova chiudendo l\'app: ' +
        'in primo piano la prova non dimostra nulla.';
      contoNumero.textContent = '✓';
      btnProva.disabled = btnDifferita.disabled = false;
    }, 1000);
  }

  function mostraFesta(ritardoMs) {
    conto.classList.add('nascosto');
    festa.classList.remove('nascosto');
    festaTesto.textContent = ritardoMs != null
      ? 'Comparsa ' + (ritardoMs / 1000).toFixed(1) + ' secondi dopo la partenza dal server. ' +
        'Il giro completo funziona su questo dispositivo.'
      : 'Il giro completo funziona su questo dispositivo.';
    dici('');
    btnProva.disabled = btnDifferita.disabled = false;
    // Riportare la festa sotto gli occhi: puo' essere fuori schermo, e l'unico
    // istante che conta non deve richiedere di andarlo a cercare.
    festa.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ------------------------------------------------------------- innesco - */

  btnAttiva.addEventListener('click', attiva);
  btnProva.addEventListener('click', function () { prova(0); });
  btnDifferita.addEventListener('click', function () { prova(10); });
  btnAncora.addEventListener('click', function () {
    festa.classList.add('nascosto');
    conto.classList.add('nascosto');
  });
  btnRiaccendi.addEventListener('click', function () { invito.riaccendi(); });

  /* Il service worker avvisa la pagina quando ha mostrato una notifica: e' cosi'
     che la conferma compare senza che l'utente debba ricaricare nulla. */
  if (supportoSW && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', function (ev) {
      if (ev.data && ev.data.tipo === 'notifica-mostrata') mostraFesta(ev.data.ritardoMs);
    });
  }

  /* ── il componente dell'invito ───────────────────────────────────────────
     La pagina non duplica il suo rilevamento: glielo chiede. */
  function collega() {
    if (!invito || !invito.stato) { setTimeout(collega, 60); return; }
    amb = invito.stato.ambiente;

    invito.addEventListener('pwa-invito-mostrato', function (ev) {
      annota('invito-mostrato', { nota: 'passo ' + ev.detail.passo });
    });
    invito.addEventListener('pwa-invito-rinviato', function (ev) {
      annota('invito-rinviato', { nota: ev.detail.esplicito ? 'non ora' : 'chiuso' });
      btnRiaccendi.classList.remove('nascosto');
    });
    invito.addEventListener('pwa-invito-spento', function () {
      annota('invito-spento', {});
      btnRiaccendi.classList.remove('nascosto');
    });
    invito.addEventListener('pwa-invito-installata', function () {
      amb.installata = true;
      annota('app-aperta', { nota: 'appena installata' });
      aggiorna();
    });
    // Il permesso lo chiede il componente durante il percorso: se lo concede,
    // l'iscrizione la completa la pagina, che e' l'unica a sapere del server.
    invito.addEventListener('pwa-invito-notifiche', function (ev) {
      annota(ev.detail.esito === 'granted' ? 'permesso-concesso'
        : ev.detail.esito === 'denied' ? 'permesso-negato' : 'permesso-ignorato', {});
      if (ev.detail.esito === 'granted' && registrazione && registrazione.pushManager) iscrivi();
      else aggiorna();
    });

    if (invito.stato.spento || invito.stato.rinviato) btnRiaccendi.classList.remove('nascosto');

    // getInstalledRelatedApps() risponde in modo asincrono e su iOS non risponde
    // affatto: la carta si ridisegna quando (e se) l'esito arriva, invece di
    // aspettarlo. Su iOS resta null, che vuol dire «non lo so» — e su un «non lo
    // so» non si puo' dire all'utente ne' che ce l'ha ne' che non ce l'ha.
    var attese = 0;
    var controlla = setInterval(function () {
      if (invito.stato.giaInstallata !== undefined || ++attese > 20) {
        clearInterval(controlla);
        amb = invito.stato.ambiente;
        aggiorna();
      }
    }, 250);

    annota('app-aperta', {
      nota: amb.inApp ? ('dentro ' + amb.inApp)
        : amb.iOS ? (amb.safariIOS ? 'Safari' : 'NON Safari: da qui non si installa')
        : undefined,
    });

    aggiorna();
    registraSW().then(aggiorna);
  }

  // Tornando in primo piano il permesso puo' essere cambiato dalle impostazioni
  // di sistema: si ricontrolla invece di fidarsi.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) aggiorna();
  });

  collega();
})();
