---
description: Installa nel progetto una skill/plugin e la registra nel manifest portabile
argument-hint: <nome-plugin | owner/repo | --new nome>
allowed-tools: Bash, Read, Edit, Write, WebSearch, WebFetch
---

Installa: **$ARGUMENTS**

1. Se non e' gia' chiaro cosa sia, identificalo prima (`claude plugin details <nome>`,
   oppure `WebFetch` sul repo) e verifica la provenienza secondo i criteri di `skill-first`.
2. Scegli il canale corretto ed esegui:
   - plugin da marketplace: `.claude/scripts/skill-add.sh --plugin <nome> "<motivo>"`
   - skill da GitHub:       `.claude/scripts/skill-add.sh --repo <owner>/<repo> <skill> "<motivo>"`
   - nuovo marketplace:     `.claude/scripts/skill-add.sh --market <owner>/<repo>`
   - skill locale nuova:    `.claude/scripts/skill-add.sh --new <nome> "<motivo>"`
3. Verifica che `skills.manifest.json` sia stato aggiornato.
4. **Leggi il `SKILL.md` installato** e riassumi in due righe cosa fa realmente.
5. Se e' un plugin, ricorda all'utente che serve riavviare la sessione per attivarlo.
