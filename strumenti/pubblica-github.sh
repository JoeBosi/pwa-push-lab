#!/usr/bin/env bash
# Pubblica su GitHub un'istantanea PULITA del progetto, in un repository separato.
#
#   bash strumenti/pubblica-github.sh "messaggio del commit"
#
# Perche' un repository separato e non un push di questo: la storia locale e'
# il diario di lavoro, con dati personali nelle versioni vecchie dei file e
# nell'autore dei commit; e il verbale docs/esperimento.md resta in locale per
# scelta del proprietario. Su GitHub va solo lo stato attuale, controllato.
#
# Si ferma — e non pubblica niente — se trova:
#   - un file fra quelli che non devono uscire (.env, data/, chiavi);
#   - una delle stringhe di .pubblicazione/vietati.txt (file LOCALE, non
#     versionato: scritte qui dentro finirebbero proprio nel repository pubblico);
#   - un valore segreto vero, letto dai .env.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTO="${PUBBLICA_REMOTO:-https://github.com/JoeBosi/pwa-push-lab.git}"
AUTORE_NOME="${PUBBLICA_AUTORE_NOME:-JoeBosi}"
AUTORE_EMAIL="${PUBBLICA_AUTORE_EMAIL:-96961030+JoeBosi@users.noreply.github.com}"
ESCLUSI=(docs/esperimento.md)
LAVORO="$ROOT/.pubblicazione"
MESSAGGIO="${1:-Aggiornamento}"

cd "$ROOT"
[ -z "$(git status --porcelain)" ] || { echo "Ci sono modifiche non committate: prima il commit locale."; exit 1; }
[ -f "$LAVORO/vietati.txt" ] || { echo "Manca $LAVORO/vietati.txt (l'elenco locale dei dati da non pubblicare)."; exit 1; }

echo "=== 1/4 · istantanea di HEAD ==="
rm -rf "$LAVORO/albero" && mkdir -p "$LAVORO/albero"
git archive HEAD | tar -x -C "$LAVORO/albero"
for e in "${ESCLUSI[@]}"; do rm -f "$LAVORO/albero/$e"; echo "    escluso $e"; done

# Il dominio vero serve alla produzione (deploy, vhost, systemd) ma su GitHub non
# deve comparire: si sostituisce con example.com, riservato alla documentazione
# (RFC 2606) e quindi di nessuno. Il controllo qui sotto verifica che non ne
# resti traccia.
DOMINIO_VERO="${PUBBLICA_DOMINIO_VERO:-example.com}"
grep -rIlF -- "$DOMINIO_VERO" "$LAVORO/albero" | while IFS= read -r f; do
  sed -i "s/${DOMINIO_VERO//./\\.}/example.com/g" "$f"
done
echo "    dominio sostituito con example.com"

echo "=== 2/4 · controllo dei dati personali e dei segreti ==="
cd "$LAVORO/albero"
problemi=0
if find . \( -name .env -o -path ./data -o -name '*.pem' -o -name '*.key' -o -name node_modules \) | grep -q .; then
  echo "    FILE CHE NON DEVONO USCIRE:"; find . \( -name .env -o -path ./data -o -name '*.pem' -o -name '*.key' \); problemi=1
fi
while IFS= read -r v; do
  [ -n "$v" ] || continue
  if grep -rIlF -- "$v" . >/dev/null 2>&1; then echo "    TROVATO un dato vietato in: $(grep -rIlF -- "$v" . | tr '\n' ' ')"; problemi=1; fi
done < "$LAVORO/vietati.txt"
for f in "$ROOT/.env" /opt/pwa-notifiche/.env; do
  [ -r "$f" ] || continue
  # "|| true": un .env senza uno di questi valori non e' un problema; senza, con
  # pipefail, l'assenza verrebbe scambiata per un segreto trovato.
  segreti="$(grep -E '^(VAPID_PRIVATE_KEY|TOKEN_INVIO|SESSIONE_SEGRETO)=.+' "$f" | cut -d= -f2- || true)"
  while IFS= read -r v; do
    [ -n "$v" ] || continue
    if grep -rIqF -- "$v" .; then echo "    TROVATO UN SEGRETO VERO (da $f)"; problemi=1; fi
  done <<< "$segreti"
done
[ "$problemi" -eq 0 ] || { echo "Pubblicazione annullata: nessun file e' stato inviato."; exit 1; }
echo "    nessun dato personale, nessun segreto"

echo "=== 3/4 · repository di pubblicazione ==="
if [ ! -d "$LAVORO/repo/.git" ]; then
  rm -rf "$LAVORO/repo"
  git clone -q "$REMOTO" "$LAVORO/repo" 2>/dev/null || { mkdir -p "$LAVORO/repo"; git -C "$LAVORO/repo" init -q -b main; git -C "$LAVORO/repo" remote add origin "$REMOTO"; }
fi
cd "$LAVORO/repo"
git fetch -q origin 2>/dev/null && git checkout -q main 2>/dev/null && git reset -q --hard origin/main 2>/dev/null || true
rsync -a --delete --exclude .git "$LAVORO/albero/" "$LAVORO/repo/"
git add -A
if git diff --cached --quiet; then echo "    niente da pubblicare: GitHub e' gia' allineato"; exit 0; fi
git -c user.name="$AUTORE_NOME" -c user.email="$AUTORE_EMAIL" commit -q -m "$MESSAGGIO"
echo "    commit $(git rev-parse --short HEAD) — autore $AUTORE_NOME <$AUTORE_EMAIL>"

echo "=== 4/4 · invio ==="
git push -q -u origin main
echo "    pubblicato: ${REMOTO%.git}"
