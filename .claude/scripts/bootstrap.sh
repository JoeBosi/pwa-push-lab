#!/usr/bin/env bash
# Ricostruisce l'ambiente agentico su una macchina nuova, leggendo skills.manifest.json.
# Idempotente: puo' essere rilanciato senza danni.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "=== Bootstrap struttura agentica — $(basename "$ROOT") ==="

command -v node >/dev/null || { echo "ERRORE: node non trovato (richiesto)."; exit 1; }
command -v claude >/dev/null || echo "ATTENZIONE: 'claude' non nel PATH — i plugin non verranno installati."

mkdir -p .claude/skills .claude/agents .claude/commands .claude/scripts docs/research
chmod +x .claude/scripts/*.sh 2>/dev/null || true

[ -f skills.manifest.json ] || { echo "ERRORE: skills.manifest.json mancante."; exit 1; }

# 1. Marketplace
node -e 'const m=require("./skills.manifest.json");(m.marketplaces||[]).forEach(x=>console.log(x.source))' |
while read -r src; do
  [ -n "$src" ] || continue
  if command -v claude >/dev/null; then
    echo "→ marketplace: $src"
    claude plugin marketplace add "$src" --scope project || echo "  (gia' presente o non raggiungibile)"
  fi
done

# 2. Plugin
node -e 'const m=require("./skills.manifest.json");(m.plugins||[]).forEach(x=>console.log(x.name))' |
while read -r name; do
  [ -n "$name" ] || continue
  if command -v claude >/dev/null; then
    echo "→ plugin: $name"
    claude plugin install "$name" --scope project --yes || echo "  (installazione fallita: $name)"
  fi
done

# 3. Skill da repo GitHub (npx skills)
node -e 'const m=require("./skills.manifest.json");(m.skills||[]).forEach(x=>console.log(x.repo+"\t"+(x.skill||"*")))' |
while IFS=$'\t' read -r repo skill; do
  [ -n "$repo" ] || continue
  echo "→ skill: $repo ($skill)"
  npx -y skills add "$repo" --skill "$skill" --copy --yes || echo "  (installazione fallita: $repo)"
done

# 4. Skill locali: gia' versionate nel repo, si verifica solo che ci siano
node -e '
const fs=require("fs");
const m=require("./skills.manifest.json");
let missing=0;
for(const s of m.local_skills||[]){
  const ok=fs.existsSync(s.path+"/SKILL.md");
  if(!ok){missing++;console.log("  MANCANTE: "+s.path+"/SKILL.md");}
}
console.log(missing?`ATTENZIONE: ${missing} skill locali mancanti.`:"Skill locali: tutte presenti.");'

echo
echo "=== Fatto. Inventario: ==="
"$ROOT/.claude/scripts/skills-status.sh"
echo
echo "Riavvia la sessione Claude Code perche' plugin e skill vengano caricati."
