/*
 * Il sito notizie: la griglia categoria × frequenza, l'elenco, e l'attivazione
 * delle notifiche su questo dispositivo.
 *
 * SICUREZZA — i titoli arrivano da feed esterni. Entrano nella pagina SOLO con
 * textContent, mai con innerHTML: un titolo con dentro un <script> o un <img
 * onerror> deve restare testo. E i link passano solo se http/https.
 */
(function () {
  'use strict';

  var el = function (id) { return document.getElementById(id); };
  var invito = document.querySelector('pwa-invito');

  var FREQUENZE = [
    { id: null, etichetta: 'No' },
    { id: '5m', etichetta: '5 min' },
    { id: '1h', etichetta: 'Ogni ora' },
    { id: '1g', etichetta: 'Ogni giorno' },
    { id: '1s', etichetta: 'Ogni settimana' },
  ];
  var NOTE_CATEGORIA = {
    'guerre-macro': 'da esteri ANSA e Sole 24 Ore',
  };

  var io = null;
  var registrazione = null;
  var iscrizione = null;
  var amb = { iOS: false, installata: false, sicura: window.isSecureContext };
  var filtro = new URLSearchParams(location.search).get('categoria') || null;

  /* ─────────────────────────────────────────────────────────── richieste ── */

  function api(metodo, url, dati) {
    return fetch(url, {
      method: metodo,
      credentials: 'same-origin',
      headers: dati ? { 'Content-Type': 'application/json' } : {},
      body: dati ? JSON.stringify(dati) : undefined,
    }).then(function (r) {
      // Sessione scaduta o revocata (password cambiata altrove): si torna
      // all'accesso invece di mostrare una pagina che non funziona piu'.
      if (r.status === 401) { location.replace('/accesso'); throw new Error('sessione scaduta'); }
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.errore || ('errore ' + r.status));
        return j;
      });
    });
  }

  function annota(evento, dettagli) {
    var d = dettagli || {};
    d.installata = amb.installata;
    if (iscrizione) d.endpoint = iscrizione.endpoint;
    return fetch('/api/annota', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evento: evento, dettagli: d }),
    }).catch(function () {});
  }

  /* ─────────────────────────────────────────────────────────── la griglia ── */

  function disegnaGriglia() {
    var g = el('griglia');
    g.textContent = '';
    io.categorie.forEach(function (c) {
      var riga = document.createElement('div');
      riga.className = 'riga';

      var capo = document.createElement('div');
      capo.className = 'riga-capo';
      var nome = document.createElement('strong');
      nome.textContent = c.etichetta;
      capo.appendChild(nome);
      if (NOTE_CATEGORIA[c.id]) {
        var nota = document.createElement('span');
        nota.className = 'nota-cat';
        nota.textContent = NOTE_CATEGORIA[c.id];
        capo.appendChild(nota);
      }
      riga.appendChild(capo);

      var seg = document.createElement('div');
      seg.className = 'segmenti';
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Frequenza per ' + c.etichetta);
      FREQUENZE.forEach(function (f) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'segmento' + (f.id ? '' : ' spento');
        b.textContent = f.etichetta;
        b.setAttribute('aria-pressed', String((io.griglia[c.id] || null) === f.id));
        b.addEventListener('click', function () { scegli(c.id, f.id); });
        seg.appendChild(b);
      });
      riga.appendChild(seg);

      if (io.griglia[c.id]) {
        var prova = document.createElement('button');
        prova.type = 'button';
        prova.className = 'prova-cat';
        prova.textContent = 'Mandamene una adesso';
        prova.addEventListener('click', function () { riepilogoOra(c.id, prova); });
        riga.appendChild(prova);
      }
      g.appendChild(riga);
    });
  }

  function scegli(categoria, frequenza) {
    var nuova = Object.assign({}, io.griglia);
    nuova[categoria] = frequenza;
    el('salvato').textContent = 'Salvo…';
    api('PUT', '/api/griglia', { griglia: nuova }).then(function (r) {
      io.griglia = r.griglia;
      disegnaGriglia();
      el('salvato').textContent = 'Salvato ✓';
      caricaNotizie();
      setTimeout(function () { el('salvato').textContent = ''; }, 2200);
    }).catch(function (e) { el('salvato').textContent = 'Non salvato: ' + e.message; });
  }

  function riepilogoOra(categoria, btn) {
    btn.disabled = true;
    btn.textContent = 'Invio…';
    api('POST', '/api/riepilogo-ora', { categoria: categoria }).then(function () {
      btn.textContent = 'Inviata ✓ — guarda il telefono';
    }).catch(function (e) {
      btn.textContent = e.message;
    }).then(function () {
      setTimeout(function () { btn.disabled = false; btn.textContent = 'Mandamene una adesso'; }, 5000);
    });
  }

  /* ─────────────────────────────────────────────────────────── l'elenco ── */

  // Intl invece di stringhe scritte a mano: "3 ore fa", "ieri", "2 giorni fa"
  // con plurali e forme giuste, senza mantenerle noi.
  var relativo = (window.Intl && Intl.RelativeTimeFormat)
    ? new Intl.RelativeTimeFormat('it', { numeric: 'auto', style: 'short' }) : null;
  function quanto(iso) {
    var s = Math.round((Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'adesso';
    var passi = [[3600, 60, 'minute'], [86400, 3600, 'hour'], [Infinity, 86400, 'day']];
    for (var i = 0; i < passi.length; i++) {
      if (s < passi[i][0]) {
        var n = Math.floor(s / passi[i][1]);
        return relativo ? relativo.format(-n, passi[i][2]) : n + ' ' + passi[i][2] + ' fa';
      }
    }
  }

  function disegnaFiltri() {
    var f = el('filtri');
    f.textContent = '';
    [{ id: null, etichetta: 'Le mie' }].concat(io.categorie).forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'filtro';
      b.textContent = c.etichetta;
      b.setAttribute('aria-pressed', String(filtro === c.id));
      b.addEventListener('click', function () {
        filtro = c.id;
        mostrate = PER_PAGINA;
        history.replaceState(null, '', filtro ? '/?categoria=' + encodeURIComponent(filtro) : '/');
        disegnaFiltri();
        caricaNotizie();
      });
      f.appendChild(b);
    });
  }

  // Si mostrano 15 notizie alla volta: con tutte e 60 la pagina diventava
  // lunga diciottomila pixel, e la griglia sopra spariva dalla vista.
  var PER_PAGINA = 15;
  var mostrate = PER_PAGINA;
  el('btn-altre').addEventListener('click', function () {
    mostrate += PER_PAGINA;
    caricaNotizie();
  });

  function caricaNotizie() {
    var url = '/api/notizie' + (filtro ? '?categoria=' + encodeURIComponent(filtro) : '');
    api('GET', url).then(function (r) {
      var lista = el('elenco');
      lista.textContent = '';
      el('elenco-vuoto').classList.toggle('nascosto', r.voci.length > 0);
      el('btn-altre').classList.toggle('nascosto', r.voci.length <= mostrate);
      r.voci.slice(0, mostrate).forEach(function (v) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        // Doppio controllo: il server filtra gia' i link, ma il client non si
        // fida. Un href "javascript:" sarebbe codice eseguito al tocco.
        if (/^https?:\/\//i.test(v.link)) a.href = v.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = v.titolo;
        li.appendChild(a);

        var sotto = document.createElement('div');
        sotto.className = 'sotto';
        var cat = document.createElement('span');
        cat.className = 'etichetta-cat';
        cat.textContent = v.etichetta;
        var fonte = document.createElement('span');
        fonte.textContent = v.fonte;
        var t = document.createElement('span');
        t.textContent = quanto(v.vista);
        sotto.appendChild(cat); sotto.appendChild(fonte); sotto.appendChild(t);
        li.appendChild(sotto);
        lista.appendChild(li);
      });

      var ko = r.feed.filter(function (f) { return f.ok === false; });
      el('fonti').textContent = ko.length
        ? 'Fonti momentaneamente non raggiungibili: ' + ko.map(function (f) { return f.fonte + ' (' + f.categoria + ')'; }).join(', ')
        : 'Fonti: ANSA, la Repubblica, Il Sole 24 Ore. I titoli portano agli articoli originali.';
    }).catch(function () {});
  }

  /* ───────────────────────────────────────── notifiche su questo dispositivo ── */

  function stato(classe, etichetta) {
    el('pastiglia').className = 'pastiglia' + (classe ? ' ' + classe : '');
    el('pastiglia-testo').textContent = etichetta;
  }
  function dici(m, c) { el('esito').textContent = m || ''; el('esito').className = 'esito' + (c ? ' ' + c : ''); }

  function aggiornaCarta() {
    var btnA = el('btn-attiva'), btnI = el('btn-installa');
    btnA.classList.add('nascosto'); btnI.classList.add('nascosto');
    el('carta').classList.remove('risolta');
    var supporto = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    if (!amb.sicura) { stato('guasto', 'Non sicura'); el('carta-titolo').textContent = 'Serve HTTPS'; el('carta-testo').textContent = 'Apri il sito via https://.'; return; }

    if (amb.iOS && !amb.installata) {
      stato('attesa', 'Da installare');
      el('carta-titolo').textContent = 'Prima aggiungila alla Home';
      el('carta-testo').textContent = 'Su iPhone le notifiche arrivano solo all\'app installata. Puoi farlo da Safari o dal tuo browser: tre tocchi, una volta sola.';
      btnI.classList.remove('nascosto');
      return;
    }
    if (!supporto) { stato('guasto', 'Non supportate'); el('carta-titolo').textContent = 'Questo browser non riceve notifiche'; el('carta-testo').textContent = 'Prova con Chrome, Edge, Firefox o Safari aggiornati.'; return; }

    if (Notification.permission === 'denied') {
      stato('guasto', 'Bloccate');
      el('carta-titolo').textContent = 'Le notifiche sono bloccate';
      el('carta-testo').textContent = amb.iOS ? 'Si riaccendono da Impostazioni → Notifiche → Notizie.' : 'Si riaccendono dal lucchetto accanto all\'indirizzo → Notifiche → Consenti.';
      return;
    }
    if (iscrizione) {
      stato('ok', 'Attive');
      el('carta').classList.add('risolta');
      el('carta-titolo').textContent = 'Questo dispositivo riceve le tue notizie';
      var accese = Object.keys(io.griglia).filter(function (k) { return io.griglia[k]; }).length;
      el('carta-testo').textContent = accese
        ? 'Scegli qui sotto cosa e quanto spesso. «Mandamene una adesso» la fa arrivare subito.'
        : 'Ora scegli qui sotto almeno una categoria: senza, non arriverà niente.';
      return;
    }
    stato('', 'Da attivare');
    el('carta-titolo').textContent = 'Attiva le notifiche';
    el('carta-testo').textContent = 'Un tocco e il telefono chiederà il permesso.';
    btnA.classList.remove('nascosto');
  }

  function toUint8(b) {
    var pad = '='.repeat((4 - (b.length % 4)) % 4);
    var raw = atob((b + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function iscrivi() {
    dici('Iscrizione…');
    return api('GET', '/api/chiave-pubblica').then(function (d) {
      return registrazione.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(d.chiave) });
    }).then(function (sub) {
      iscrizione = sub;
      // Il server lega questo dispositivo all'utente della SESSIONE: il corpo
      // non dice a chi appartiene, e non deve poterlo dire.
      return api('POST', '/api/iscrivi', { iscrizione: sub.toJSON() });
    }).then(function () {
      annota('iscrizione-creata', { nota: 'servizio: ' + new URL(iscrizione.endpoint).host });
      dici(''); aggiornaCarta();
    }).catch(function (e) {
      annota('iscrizione-fallita', { nota: e.message });
      dici('Non riuscita: ' + e.message, 'guasto'); aggiornaCarta();
    });
  }

  el('btn-attiva').addEventListener('click', function () {
    // Dal tocco, senza attese prima: su iOS un await qui farebbe ignorare la richiesta.
    Promise.resolve(Notification.requestPermission()).then(function (r) {
      var p = r || Notification.permission;
      annota(p === 'granted' ? 'permesso-concesso' : p === 'denied' ? 'permesso-negato' : 'permesso-ignorato', {});
      if (p === 'granted' && registrazione && registrazione.pushManager) return iscrivi();
      aggiornaCarta();
    });
  });
  el('btn-installa').addEventListener('click', function () { invito && invito.riaccendi(); });
  el('btn-riaccendi').addEventListener('click', function () { invito && invito.riaccendi(); });

  /*
   * Uscire: PRIMA si disiscrive questo dispositivo, POI si chiude la sessione.
   * Al contrario, la rotta risponderebbe "accesso richiesto" e il telefono
   * continuerebbe a ricevere le notizie di chi se n'e' andato. Il server toglie
   * comunque tutte le caselle dell'utente all'uscita: due strati, non uno.
   */
  el('btn-esci').addEventListener('click', function () {
    var fatto = function () { location.replace('/accesso'); };
    var disdici = iscrizione ? iscrizione.unsubscribe().catch(function () {}) : Promise.resolve();
    disdici
      .then(function () { return fetch('/api/esci', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); })
      .then(fatto, fatto);
  });

  /* ───────────────────────────────────────────────────────────── avvio ── */

  function registraSW() {
    if (!('serviceWorker' in navigator)) return Promise.resolve();
    return navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(function () { return navigator.serviceWorker.ready; })
      .then(function (reg) {
        registrazione = reg;
        if (!reg.pushManager) return null; // iPhone, app non installata: atteso, non un guasto
        return reg.pushManager.getSubscription();
      })
      .then(function (sub) {
        iscrizione = sub;
        // Un dispositivo gia' iscritto (magari dal banco, o da un altro utente
        // prima) viene ri-registrato a nome di chi e' entrato adesso.
        if (sub) api('POST', '/api/iscrivi', { iscrizione: sub.toJSON() }).catch(function () {});
      })
      .catch(function (e) { annota('sw-errore', { nota: e.message }); });
  }

  function collegaInvito() {
    if (!invito || !invito.stato) { setTimeout(collegaInvito, 60); return; }
    amb = invito.stato.ambiente;
    invito.addEventListener('pwa-invito-rinviato', function () { el('btn-riaccendi').classList.remove('nascosto'); });
    invito.addEventListener('pwa-invito-spento', function () { el('btn-riaccendi').classList.remove('nascosto'); });
    invito.addEventListener('pwa-invito-installata', function () { amb.installata = true; aggiornaCarta(); });
    invito.addEventListener('pwa-invito-notifiche', function (ev) {
      if (ev.detail.esito === 'granted' && registrazione && registrazione.pushManager) iscrivi();
      else aggiornaCarta();
    });
    if (invito.stato.spento || invito.stato.rinviato) el('btn-riaccendi').classList.remove('nascosto');
    aggiornaCarta();
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && io) { aggiornaCarta(); caricaNotizie(); }
  });

  api('GET', '/api/io').then(function (u) {
    io = u;
    el('nome-utente').textContent = u.nome;
    // Solo un'indicazione di comodo: la protezione vera e' sul server, che
    // risponde 403 a chi non e' admin anche se il collegamento lo vedesse.
    if (u.ruolo === 'admin') el('link-admin').classList.remove('nascosto');
    disegnaGriglia();
    disegnaFiltri();
    caricaNotizie();
    collegaInvito();
    annota('app-aperta', { nota: 'sito notizie' });
    return registraSW();
  }).then(aggiornaCarta).catch(function () {});
})();
