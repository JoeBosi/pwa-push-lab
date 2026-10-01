#!/usr/bin/env bash
# Installa una capacita' agentica NEL PROGETTO e la registra in skills.manifest.json.
#
# Uso:
#   skill-add.sh --plugin <nome[@marketplace]> "<motivo>"    # marketplace Claude Code
#   skill-add.sh --market <owner/repo>                       # aggiungi un marketplace
#   skill-add.sh --repo   <owner/repo> [skill] "<motivo>"    # skill da GitHub (npx skills)
#   skill-add.sh --new    <nome> "<motivo>"                  # scaffold skill locale
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
MANIFEST="$ROOT/skills.manifest.json"

manifest_add() { # $1 = chiave array, $2 = json object
  KEY="$1" ENTRY="$2" node - <<'JS'
const fs = require('fs');
const p = 'skills.manifest.json';
const m = JSON.parse(fs.readFileSync(p, 'utf8'));
const key = process.env.KEY;
const entry = JSON.parse(process.env.ENTRY);
m[key] = m[key] || [];
const i = m[key].findIndex(e => e.name === entry.name);
if (i >= 0) m[key][i] = { ...m[key][i], ...entry }; else m[key].push(entry);
fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
console.log(`manifest aggiornato: ${key} += ${entry.name}`);
JS
}

usage() { sed -n '2,10p' "$0"; exit 2; }
[ $# -ge 1 ] || usage
MODE="$1"; shift

case "$MODE" in
  --plugin)
    [ $# -ge 1 ] || usage
    NAME="$1"; REASON="${2:-}"
    echo "→ claude plugin install $NAME --scope project"
    claude plugin install "$NAME" --scope project
    manifest_add plugins "$(NAME="$NAME" REASON="$REASON" node -e \
      'console.log(JSON.stringify({name:process.env.NAME,channel:"claude-plugin",scope:"project",reason:process.env.REASON}))')"
    echo "Riavvia la sessione (o /plugin) perche' il plugin diventi attivo."
    ;;

  --market)
    [ $# -ge 1 ] || usage
    SRC="$1"
    echo "→ claude plugin marketplace add $SRC --scope project"
    claude plugin marketplace add "$SRC" --scope project
    manifest_add marketplaces "$(SRC="$SRC" node -e \
      'const s=process.env.SRC;console.log(JSON.stringify({name:s.split("/").pop(),source:s,scope:"project"}))')"
    ;;

  --repo)
    [ $# -ge 1 ] || usage
    REPO="$1"; SKILL="${2:-*}"; REASON="${3:-}"
    echo "→ npx -y skills add $REPO --skill '$SKILL' --copy --yes  (project-level)"
    npx -y skills add "$REPO" --skill "$SKILL" --copy --yes
    manifest_add skills "$(REPO="$REPO" SKILL="$SKILL" REASON="$REASON" node -e \
      'console.log(JSON.stringify({name:process.env.SKILL==="*"?process.env.REPO:process.env.SKILL,repo:process.env.REPO,skill:process.env.SKILL,channel:"npx-skills",reason:process.env.REASON}))')"
    ;;

  --new)
    [ $# -ge 1 ] || usage
    NAME="$1"; REASON="${2:-}"
    DIR=".claude/skills/$NAME"
    if [ -e "$DIR/SKILL.md" ]; then echo "Esiste gia': $DIR/SKILL.md" >&2; exit 1; fi
    mkdir -p "$DIR"
    cat > "$DIR/SKILL.md" <<EOF
---
name: $NAME
description: TODO — una riga che descrive QUANDO usare questa skill (e' cio' che ne innesca il caricamento).
---

# $NAME

## Quando usarla
TODO

## Procedura
1. TODO

## Note
Skill locale del progetto. Motivo: ${REASON:-non specificato}
EOF
    manifest_add local_skills "$(NAME="$NAME" REASON="$REASON" node -e \
      'console.log(JSON.stringify({name:process.env.NAME,path:".claude/skills/"+process.env.NAME,reason:process.env.REASON}))')"
    echo "Creata: $DIR/SKILL.md — compila description e procedura."
    ;;

  *) usage ;;
esac
