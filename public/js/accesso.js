/* Accesso e cambio obbligatorio della password iniziale. */
(function () {
  'use strict';
  var el = function (id) { return document.getElementById(id); };

  function invia(url, dati) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(dati),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, dati: j }; });
    });
  }

  function dici(id, testo, classe) {
    el(id).textContent = testo;
    el(id).className = 'esito' + (classe ? ' ' + classe : '');
  }

  function mostraCambio() {
    el('carta-accesso').classList.add('nascosto');
    el('carta-cambio').classList.remove('nascosto');
    el('modulo-cambio').attuale.focus();
  }

  el('modulo-accesso').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = ev.target;
    dici('esito-accesso', 'Verifico…');
    invia('/api/accesso', { nome: f.nome.value, password: f.password.value }).then(function (r) {
      if (!r.ok) return dici('esito-accesso', r.dati.errore || 'accesso non riuscito', 'guasto');
      if (r.dati.deveCambiare) {
        // La password appena digitata e' quella iniziale: la si riporta nel
        // campo "ricevuta" per non fargliela riscrivere.
        el('modulo-cambio').attuale.value = f.password.value;
        f.password.value = '';
        return mostraCambio();
      }
      location.replace('/');
    }).catch(function () { dici('esito-accesso', 'Server non raggiungibile.', 'guasto'); });
  });

  el('modulo-cambio').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = ev.target;
    if (f.nuova.value.length < 8) return dici('esito-cambio', 'Almeno 8 caratteri.', 'guasto');
    if (f.nuova.value !== f.conferma.value) return dici('esito-cambio', 'Le due password non coincidono.', 'guasto');
    dici('esito-cambio', 'Salvo…');
    invia('/api/password', { attuale: f.attuale.value, nuova: f.nuova.value }).then(function (r) {
      if (!r.ok) return dici('esito-cambio', r.dati.errore || 'non riuscito', 'guasto');
      location.replace('/');
    }).catch(function () { dici('esito-cambio', 'Server non raggiungibile.', 'guasto'); });
  });

  // Arrivati qui da "/" con la password ancora da cambiare: la sessione c'e'
  // gia', manca solo il cambio.
  if (/[?&]cambia=1/.test(location.search)) {
    fetch('/api/io', { credentials: 'same-origin' }).then(function (r) {
      if (r.ok) return r.json().then(function (u) { if (u.deveCambiare) mostraCambio(); });
    });
  }
})();
