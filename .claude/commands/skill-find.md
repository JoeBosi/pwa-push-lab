---
description: Cerca una skill/plugin gia' esistente per un compito (marketplace locale + npx skills + web) e valuta i candidati
argument-hint: <compito o parola chiave>
allowed-tools: Bash, Read, Glob, Grep, WebSearch, WebFetch, Agent
---

Obiettivo di ricerca: **$ARGUMENTS**

Segui la skill `skill-first`, passi 1–3 (ricerca e valutazione, **senza installare**):

1. Catalogo locale: `.claude/scripts/skill-search.sh $ARGUMENTS` (prova anche sinonimi IT/EN).
2. Registry web: `npx -y skills find "$ARGUMENTS"`.
3. Web: `WebSearch` con almeno tre formulazioni; apri i candidati seri con `WebFetch`.

Se lo spazio di ricerca e' ampio, delega al subagent `skill-scout`.

Riporta i candidati con: fonte, cosa fanno, quanto coprono l'obiettivo, comando di
installazione esatto, rischi. Chiudi con una raccomandazione netta (installare X, oppure
nessun candidato adeguato e perche'). **Non installare niente** senza conferma.
