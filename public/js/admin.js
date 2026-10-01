/*
 * Amministrazione utenti. Tutto cio' che arriva dal server entra con
 * textContent: anche i nomi utente, che sono validati, ma "validato" non
 * autorizza mai a smettere di fare escaping.
 */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };
  var NOMI_FREQ = { '5m': '5 min', '1h': 'ora', '1g': 'giorno', '1s': 'settimana' };

  function api(metodo, url, dati) {
    return fetch(url, {
      method: metodo, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      // Corpo JSON anche dove non serve (DELETE): la difesa CSRF del server
      // accetta solo JSON sulle rotte che cambiano qualcosa.
      body: metodo === 'GET' ? undefined : JSON.stringify(dati || {}),
    }).then(function (r) {
      if (r.status === 401) { location.replace('/accesso'); throw new Error('sessione scaduta'); }
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.errore || 'errore ' + r.status);
        return j;
      });
    });
  }

  function mostraPassword(nome, password, motivo) {
    el('password-titolo').textContent = motivo;
    el('password-chi').textContent = 'Per «' + nome + '». Comunicagliela: al primo accesso dovrà sceglierne una sua.';
    el('password-valore').textContent = password;
    el('carta-password').classList.remove('nascosto');
    el('btn-copia').textContent = 'Copia';
    el('carta-password').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function crea(nodo, tag, classe, testo) {
    var x = document.createElement(tag);
    if (classe) x.className = classe;
    if (testo != null) x.textContent = testo;
    nodo.appendChild(x);
    return x;
  }

  function carica() {
    api('GET', '/api/admin/utenti').then(function (lista) {
      var ol = el('elenco-utenti');
      ol.textContent = '';
      lista.forEach(function (u) {
        var li = crea(ol, 'li', 'riga-utente');
        var dati = crea(li, 'div', 'dati');
        var nome = crea(dati, 'strong', null, u.nome + ' ');
        if (u.ruolo === 'admin') crea(nome, 'span', 'distintivo', 'admin');
        if (u.deveCambiare) crea(nome, 'span', 'distintivo attesa', 'password da cambiare');
        var accese = Object.keys(u.griglia || {}).filter(function (k) { return u.griglia[k]; })
          .map(function (k) { return k + ' ' + NOMI_FREQ[u.griglia[k]]; });
        crea(dati, 'div', 'sotto',
          u.dispositivi + (u.dispositivi === 1 ? ' dispositivo' : ' dispositivi') + ' · ' +
          (accese.length ? accese.join(', ') : 'nessuna iscrizione'));

        var az = crea(li, 'div', 'azioni-utente');
        var r = crea(az, 'button', 'btn secondario', 'Nuova password');
        r.type = 'button';
        r.addEventListener('click', function () {
          if (!confirm('Generare una nuova password per «' + u.nome + '»? Le sue sessioni aperte verranno chiuse.')) return;
          api('POST', '/api/admin/utenti/' + encodeURIComponent(u.nome) + '/reimposta').then(function (j) {
            mostraPassword(j.nome, j.password, 'Nuova password iniziale');
            carica();
          }).catch(function (e) { alert(e.message); });
        });
        if (u.ruolo !== 'admin') {
          var d = crea(az, 'button', 'btn pericolo', 'Elimina');
          d.type = 'button';
          d.addEventListener('click', function () {
            if (!confirm('Eliminare «' + u.nome + '» e i suoi dispositivi? Non si torna indietro.')) return;
            api('DELETE', '/api/admin/utenti/' + encodeURIComponent(u.nome)).then(carica)
              .catch(function (e) { alert(e.message); });
          });
        }
      });
    }).catch(function (e) { el('esito-crea').textContent = e.message; });
  }

  el('modulo-crea').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var nome = ev.target.nome.value.trim().toLowerCase();
    el('esito-crea').textContent = 'Creo…';
    el('esito-crea').className = 'esito';
    api('POST', '/api/admin/utenti', { nome: nome }).then(function (j) {
      ev.target.nome.value = '';
      el('esito-crea').textContent = '';
      mostraPassword(j.nome, j.password, 'Utente creato');
      carica();
    }).catch(function (e) {
      el('esito-crea').textContent = e.message;
      el('esito-crea').className = 'esito guasto';
    });
  });

  el('btn-copia').addEventListener('click', function () {
    var p = el('password-valore').textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(p).then(function () { el('btn-copia').textContent = 'Copiata ✓'; });
  });
  // Nascondere davvero: si svuota il testo, non solo si nasconde il riquadro.
  el('btn-nascondi').addEventListener('click', function () {
    el('password-valore').textContent = '';
    el('carta-password').classList.add('nascosto');
  });

  carica();
})();
