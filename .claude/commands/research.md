---
description: Ricerca la documentazione ufficiale su un argomento tecnico e salva la nota in docs/research/
argument-hint: <argomento tecnico>
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, WebFetch, Agent
---

Argomento: **$ARGUMENTS**

Applica la skill `research-first`:

1. Controlla se `docs/research/` contiene gia' una nota valida sull'argomento.
2. Cerca le fonti primarie (doc ufficiale → RFC/W3C/NIST/OWASP → repo upstream) e **aprile**
   con `WebFetch`. Per argomenti ampi, delega al subagent `doc-researcher`.
3. Verifica versione corrente, deprecazioni, breaking change, CVE noti.
4. Salva `docs/research/<slug>.md` nel formato previsto dalla skill (data, fonti, sintesi
   operativa, trappole, incertezze).
5. Riporta all'utente la sintesi operativa e il percorso del file salvato.

Non inventare URL o versioni: cio' che non hai verificato va sotto "Incertezze".
