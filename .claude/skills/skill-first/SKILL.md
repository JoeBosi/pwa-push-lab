---
name: skill-first
description: Prima di implementare a mano un compito, cerca se esiste gia' una skill/plugin che lo fa (marketplace locale, npx skills, GitHub), installala nel progetto e usala. Usare all'inizio di ogni task non banale — install skill, find skill, cerca skill, plugin, capability.
---

# skill-first — cerca prima, implementa dopo

## Quando usarla
All'inizio di **qualsiasi task non banale** richiesto dall'utente: automazioni, integrazioni
con servizi (auth, DB, cloud, CI, browser, pagamenti...), workflow ricorrenti, generazione
di artefatti, analisi. In pratica: prima di scrivere codice o procedure da zero.

Non serve per: domande conversazionali, modifiche di una riga, task gia' coperti da una
skill installata (in quel caso usala e basta).

## Procedura

### 1. Cerca nel catalogo locale (veloce, offline)
```bash
.claude/scripts/skill-search.sh <parola-chiave> [altra-parola]
```
Interroga i marketplace Claude Code gia' su disco (quello ufficiale Anthropic ha 289+ plugin).
Per i dettagli di un candidato:
```bash
claude plugin details <nome>
```

### 2. Cerca sul web (se il locale non basta)
```bash
npx -y skills find "<query>"          # registry di skill su GitHub
```
In parallelo usa `WebSearch` con query tipo:
- `claude code plugin <argomento>`
- `agent skill <argomento> SKILL.md github`
- `awesome claude code skills <argomento>`
- `<nome-vendor> claude code skill` (molti vendor pubblicano skill ufficiali)

### 3. Valuta prima di installare
Una skill sono **istruzioni e codice che verranno eseguiti**. Installa solo se:
- viene dal marketplace ufficiale Anthropic, **oppure** dal vendor ufficiale del prodotto,
  **oppure** da un repo con manutenzione recente e uso reale;
- il `SKILL.md` e' leggibile e fa cio' che dichiara — **leggilo dopo l'installazione,
  prima di usarlo**, soprattutto se la fonte non e' ufficiale;
- copre davvero il task: una skill vagamente attinente costa piu' di quanto rende.

Se nessun candidato passa questi criteri: **dillo in una riga** e procedi con
implementazione manuale.

### 4. Installa nel progetto (mai a livello utente)
```bash
.claude/scripts/skill-add.sh --plugin <nome>            "<motivo in una riga>"
.claude/scripts/skill-add.sh --repo   <owner>/<repo> <skill> "<motivo>"
.claude/scripts/skill-add.sh --market <owner>/<repo>
```
Lo script installa **e aggiorna `skills.manifest.json`**: e' il manifest a rendere la
struttura ricostruibile su un'altra macchina con `.claude/scripts/bootstrap.sh`.

I plugin diventano attivi al riavvio della sessione; le skill copiate in
`.claude/skills/` sono disponibili subito. Se un plugin appena installato non e' ancora
attivo, dillo all'utente invece di fingere di usarlo.

### 5. Usala, e riferiscilo
Dichiara sempre all'utente: cosa hai cercato, cosa hai trovato, cosa hai installato e perche'
(oppure che non esisteva nulla di adatto). Due righe bastano.

### 6. Se il task e' ricorrente e nessuna skill esiste — scrivila
```bash
.claude/scripts/skill-add.sh --new <nome> "<motivo>"
```
Poi compila `SKILL.md`. Il campo `description` e' cio' che ne innesca il caricamento:
deve dire **quando** usarla, con le parole che l'utente userebbe.

## Vedi anche
- `research-first` — documentarsi online prima dei task tecnici (le due skill si usano insieme:
  prima cerchi la skill, poi la documentazione di cio' che la skill non copre).
