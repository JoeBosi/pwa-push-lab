#!/usr/bin/env bash
# Cerca skill/plugin gia' disponibili nei marketplace Claude Code presenti su disco.
# Uso: .claude/scripts/skill-search.sh <parola-chiave> [altra-parola ...]
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Uso: $0 <parola-chiave> [...]" >&2
  echo "Poi, per il web:  npx skills find <query>" >&2
  exit 2
fi

MP_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/marketplaces"
if [ ! -d "$MP_DIR" ]; then
  echo "Nessun marketplace su disco ($MP_DIR)." >&2
  echo "Esegui prima: .claude/scripts/bootstrap.sh" >&2
  exit 1
fi

QUERY="$*" MPDIR="$MP_DIR" node - <<'JS'
const fs = require('fs'), path = require('path');
const terms = process.env.QUERY.toLowerCase().split(/\s+/).filter(Boolean);
const root = process.env.MPDIR;
const rows = [];

for (const mp of fs.readdirSync(root, { withFileTypes: true })) {
  if (!mp.isDirectory()) continue;
  const f = path.join(root, mp.name, '.claude-plugin', 'marketplace.json');
  if (!fs.existsSync(f)) continue;
  let data;
  try { data = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
  for (const p of data.plugins || []) {
    const hay = [p.name, p.description, (p.keywords || []).join(' '), (p.category || '')]
      .filter(Boolean).join(' ').toLowerCase();
    let score = 0;
    for (const t of terms) {
      if ((p.name || '').toLowerCase().includes(t)) score += 3;
      if (hay.includes(t)) score += 1;
    }
    if (score > 0) rows.push({ score, name: p.name, mp: mp.name, desc: (p.description || '').replace(/\s+/g, ' ') });
  }
}

rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
if (!rows.length) {
  console.log(`Nessun risultato nei marketplace locali per: ${terms.join(' ')}`);
  console.log('Prova il canale web:  npx skills find ' + terms.join(' '));
  process.exit(0);
}
console.log(`${rows.length} risultati per "${terms.join(' ')}":\n`);
for (const r of rows.slice(0, 25)) {
  console.log(`  ${r.name}@${r.mp}`);
  console.log(`      ${r.desc.slice(0, 160)}`);
}
if (rows.length > 25) console.log(`\n  ... e altri ${rows.length - 25}.`);
console.log('\nDettagli:   claude plugin details <nome>');
console.log('Installa:   .claude/scripts/skill-add.sh --plugin <nome> "<motivo>"');
JS
