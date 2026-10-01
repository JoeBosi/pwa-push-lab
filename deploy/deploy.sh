#!/usr/bin/env bash
# Installa/aggiorna il servizio su questo VPS. Idempotente: si rilancia a ogni
# modifica del codice senza effetti collaterali.
#
#   sudo bash deploy/deploy.sh
#
# PREREQUISITO: il record DNS deve gia' esistere e puntare qui, altrimenti Caddy
# non ottiene il certificato — e senza certificato valido iOS non installa la
# PWA e le notifiche non partono. Vedi deploy/README.md, passo 1.
set -euo pipefail

DOMINIO="${DOMINIO:-pwa.example.com}"   # un altro dominio: DOMINIO=… sudo -E bash deploy/deploy.sh
SERVIZIO="pwa-notifiche"
UTENTE="pwanotifiche"
DEST="/opt/pwa-notifiche"
PORTA="3020"

SORGENTE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SORGENTE"

[ "$(id -u)" -eq 0 ] || { echo "Serve root: sudo bash deploy/deploy.sh"; exit 1; }

echo "=== 1/6 · utente di sistema ==="
if id "$UTENTE" &>/dev/null; then
  echo "    $UTENTE esiste gia'"
else
  # --system, senza home e senza shell: questo utente non deve poter accedere
  # alla macchina, deve solo far girare un processo.
  useradd --system --no-create-home --shell /usr/sbin/nologin "$UTENTE"
  echo "    creato $UTENTE"
fi

echo "=== 2/6 · copia del codice in $DEST ==="
mkdir -p "$DEST"
# --delete tiene la destinazione allineata alla sorgente. data/ e .env sono
# esclusi ED esclusi anche dalla cancellazione: contengono lo stato di
# produzione, che non deve essere sovrascritto da un deploy.
rsync -a --delete \
  --exclude node_modules \
  --exclude '.git' \
  --exclude '.claude' \
  --exclude 'deploy' \
  --exclude 'docs' \
  --exclude 'test' \
  --exclude '.env' \
  --exclude 'data' \
  --exclude '*.log' \
  ./ "$DEST/"
mkdir -p "$DEST/data"

echo "=== 3/6 · dipendenze e icone ==="
cd "$DEST"
npm ci --omit=dev --no-audit --no-fund
# Le icone non sono versionate: si generano qui.
node strumenti/genera-icone.js

echo "=== 4/6 · chiavi VAPID ==="
if [ -f "$DEST/.env" ]; then
  echo "    .env gia' presente: NON viene toccato."
  echo "    (rigenerarlo invaliderebbe tutte le iscrizioni dei dispositivi)"
else
  # Le chiavi di produzione nascono qui e non escono da qui: non transitano dal
  # repository, non passano per rsync, non finiscono in un backup del codice.
  node strumenti/genera-vapid.js
  echo "    generate nuove chiavi in $DEST/.env"
fi
# Il token dell'invio collettivo: generato qui, e non lasciato vuoto.
# /api/invia e /api/registro sono chiusi finche' non esiste, ma un token assente
# significherebbe non poter consultare il verbale delle prove.
if ! grep -q '^TOKEN_INVIO=.\+' "$DEST/.env"; then
  TOKEN=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
  if grep -q '^TOKEN_INVIO=' "$DEST/.env"; then
    sed -i "s|^TOKEN_INVIO=.*|TOKEN_INVIO=$TOKEN|" "$DEST/.env"
  else
    echo "TOKEN_INVIO=$TOKEN" >> "$DEST/.env"
  fi
  echo "    generato TOKEN_INVIO (serve per il verbale: vedi sotto)"
fi

# Il segreto che firma i cookie di sessione. Generato una volta, mai
# sovrascritto: cambiarlo farebbe uscire tutti gli utenti.
if ! grep -q '^SESSIONE_SEGRETO=.\{32,\}' "$DEST/.env"; then
  SEGRETO=$(openssl rand -base64 48 | tr -d '/+=\n' | head -c 64)
  sed -i '/^SESSIONE_SEGRETO=/d' "$DEST/.env"
  echo "SESSIONE_SEGRETO=$SEGRETO" >> "$DEST/.env"
  echo "    generato SESSIONE_SEGRETO"
fi

chown "$UTENTE:$UTENTE" "$DEST/.env"
chmod 600 "$DEST/.env"

chown -R "$UTENTE:$UTENTE" "$DEST"
chmod 750 "$DEST/data"

echo "=== 5/6 · servizio systemd ==="
install -m 644 "$SORGENTE/deploy/$SERVIZIO.service" "/etc/systemd/system/$SERVIZIO.service"
systemctl daemon-reload
systemctl enable "$SERVIZIO" >/dev/null
systemctl restart "$SERVIZIO"
sleep 2
if ! systemctl is-active --quiet "$SERVIZIO"; then
  echo "    IL SERVIZIO NON E' PARTITO:"
  journalctl -u "$SERVIZIO" -n 20 --no-pager
  exit 1
fi
echo "    $SERVIZIO attivo su 127.0.0.1:$PORTA"

echo "=== 6/6 · Caddy ==="
if grep -q "^$DOMINIO" /etc/caddy/Caddyfile; then
  echo "    $DOMINIO gia' presente nel Caddyfile: lasciato com'e'"
else
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)"
  printf '\n' >> /etc/caddy/Caddyfile
  # Il modello contiene il segnaposto __DOMINIO__: si sostituisce col dominio scelto.
  sed "s/__DOMINIO__/$DOMINIO/g" "$SORGENTE/deploy/caddy-vhost.conf" >> /etc/caddy/Caddyfile
  if ! caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    echo "    Caddyfile non valido, annullo:"
    caddy validate --config /etc/caddy/Caddyfile || true
    exit 1
  fi
  systemctl reload caddy
  echo "    vhost aggiunto e Caddy ricaricato"
fi

echo
echo "=== fatto ==="
echo "  locale:   http://127.0.0.1:$PORTA"
echo "  pubblico: https://$DOMINIO"
echo
if ! getent hosts "$DOMINIO" >/dev/null; then
  echo "  ATTENZIONE: $DOMINIO non risolve."
  echo "  Crea il record A verso $(curl -s -4 -m 5 https://ifconfig.me || echo '<IP di questo server>')"
  echo "  e riprova fra qualche minuto: senza DNS non c'e' certificato, e senza"
  echo "  certificato non c'e' installazione ne' notifiche."
else
  echo "  Il certificato lo emette Caddy da solo alla prima visita (pochi secondi)."
fi
echo
echo "  Strumento di misura:"
echo "    pagina    https://$DOMINIO/laboratorio"
echo "    terminale node strumenti/banco.js registro"
echo "    token     sudo grep TOKEN_INVIO $DEST/.env"
echo
echo "  Verifica finale — sui telefoni, non da qui. Vedi deploy/README.md."
