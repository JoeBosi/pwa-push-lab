#!/usr/bin/env bash
# Inventario delle capacita' agentiche di questo progetto.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "=== Progetto: $(basename "$ROOT") ==="
echo
echo "--- Skill locali (.claude/skills) ---"
found=0
for d in .claude/skills/*/; do
  [ -f "$d/SKILL.md" ] || continue
  found=1
  name=$(sed -n 's/^name:[[:space:]]*//p' "$d/SKILL.md" | head -1)
  # La description puo' essere su una riga oppure un blocco YAML ("description: |"):
  # nel secondo caso il valore vero e' sulle righe indentate successive.
  desc=$(sed -n 's/^description:[[:space:]]*//p' "$d/SKILL.md" | head -1)
  if [ "$desc" = "|" ] || [ "$desc" = ">" ] || [ -z "$desc" ]; then
    desc=$(awk '/^description:/{f=1;next} f&&/^[[:space:]]+/{sub(/^[[:space:]]+/,"");printf "%s ",$0;next} f{exit}' "$d/SKILL.md")
  fi
  printf '  %-24s %s\n' "${name:-$(basename "$d")}" "${desc:0:90}"
done
[ "$found" = 1 ] || echo "  (nessuna)"

echo
echo "--- Subagent (.claude/agents) ---"
ls .claude/agents/*.md >/dev/null 2>&1 && for f in .claude/agents/*.md; do
  printf '  %-24s %s\n' "$(basename "$f" .md)" "$(sed -n 's/^description:[[:space:]]*//p' "$f" | head -1 | cut -c1-90)"
done || echo "  (nessuno)"

echo
echo "--- Slash command (.claude/commands) ---"
ls .claude/commands/*.md >/dev/null 2>&1 && for f in .claude/commands/*.md; do
  printf '  /%-23s %s\n' "$(basename "$f" .md)" "$(sed -n 's/^description:[[:space:]]*//p' "$f" | head -1 | cut -c1-90)"
done || echo "  (nessuno)"

echo
echo "--- Plugin abilitati nel progetto ---"
node -e '
const fs=require("fs");
try{
  const s=JSON.parse(fs.readFileSync(".claude/settings.json","utf8"));
  const p=Object.keys(s.enabledPlugins||{});
  console.log(p.length?p.map(x=>"  "+x).join("\n"):"  (nessuno)");
  const m=Object.keys(s.extraKnownMarketplaces||{});
  console.log("\n--- Marketplace dichiarati ---");
  console.log(m.length?m.map(x=>"  "+x).join("\n"):"  (nessuno)");
}catch(e){console.log("  .claude/settings.json assente o illeggibile");}'

echo
echo "--- Note di ricerca (docs/research) ---"
ls docs/research/*.md >/dev/null 2>&1 && ls -1 docs/research/*.md | sed 's/^/  /' || echo "  (nessuna)"
