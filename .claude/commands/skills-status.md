---
description: Mostra l'inventario delle capacita' agentiche del progetto (skill, agent, comandi, plugin, note di ricerca)
allowed-tools: Bash, Read
---

Esegui `.claude/scripts/skills-status.sh` e presenta il risultato in forma leggibile.

Poi segnala eventuali incoerenze: voci nel manifest senza file corrispondente, skill presenti
su disco ma non registrate nel manifest, note di ricerca vecchie da riverificare.
