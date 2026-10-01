---
description: Ricostruisce l'ambiente agentico su questa macchina a partire da skills.manifest.json
allowed-tools: Bash, Read
---

Esegui `.claude/scripts/bootstrap.sh` e riporta l'esito.

Se qualche installazione fallisce, diagnostica la causa (marketplace non raggiungibile,
`claude` o `node` assenti, nome plugin cambiato) e proponi la correzione. Al termine ricorda
che serve riavviare la sessione perche' i plugin vengano caricati.
