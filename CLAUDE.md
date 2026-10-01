# AppPWA_NotificheTest — banco di prova + struttura agentica portabile

Questo repository e' due cose insieme.

1. Una **PWA di prova** il cui unico scopo e' far arrivare una notifica push su un
   telefono vero — Android e iPhone — e scrivere nel verbale (`docs/esperimento.md`) che cosa e'
   servito davvero perche' funzionasse. Non e' un prodotto: e' un esperimento con
   il verbale allegato.
2. Una **struttura agentica portabile**: tutta la configurazione dell'agente
   (skill, subagent, comandi, script, manifest) vive dentro la cartella del
   progetto in `.claude/`. Copiando/clonando questa cartella su un'altra macchina e
   lanciando `.claude/scripts/bootstrap.sh` si ricostruisce l'ambiente identico.

---

## REGOLE OPERATIVE (vincolanti)

### Regola 1 — Ricerca online prima dei task tecnici
Per **ogni task tecnico** (codice, configurazione, protocolli, librerie, infrastruttura,
sicurezza, deploy, VPS, autenticazione, ecc.) **prima di scrivere codice o eseguire comandi**:

1. Cerca online la documentazione ufficiale / lo stato dell'arte (`WebSearch`, `WebFetch`).
2. Preferisci **fonti primarie**: documentazione ufficiale, RFC, repo upstream, release notes.
3. Verifica che l'informazione sia **attuale** (versioni, breaking change, deprecazioni).
4. Salva una nota sintetica in `docs/research/<argomento>.md` (vedi template più sotto)
   così la ricerca non va rifatta alla sessione successiva.
5. Solo dopo, progetta ed esegui.

Se la ricerca online non è possibile o non produce nulla di utile, **dichiaralo
esplicitamente** e procedi indicando le assunzioni fatte.

Qui la regola pesa più che altrove: il supporto al Web Push su iOS e' cambiato
piu' volte e continua a cambiare, e la memoria di un modello linguistico su questo
argomento e' vecchia per costruzione. Quello che "si sa" sul Web Push va
riverificato, non ricordato.

Eccezioni (non serve ricerca): domande conversazionali, modifiche meccaniche banali,
task già documentati in `docs/research/` e ancora validi.

### Regola 2 — Skill-first: cerca una skill esistente prima di improvvisare
Prima di implementare a mano un compito, **verifica se esiste già una skill/plugin che lo fa**:

1. **Catalogo locale** (marketplace ufficiale già su disco):
   `.claude/scripts/skill-search.sh <parola-chiave>`
2. **Web / GitHub**: `npx skills find <query>`, più `WebSearch` su
   "claude code skill <argomento>", "agent skill <argomento>", awesome-claude-code.
3. Se ne trovi una **utile e affidabile**, installala **in questa cartella** con
   `.claude/scripts/skill-add.sh` e poi **usala** invece di reimplementare.
4. Se non esiste nulla di adatto, dillo in una riga e procedi con implementazione manuale;
   se il compito è ricorrente, **scrivi tu una skill locale** in `.claude/skills/`.

Criteri per considerare una skill "affidabile": fonte ufficiale del vendor, o repo con
manutenzione recente, o marketplace ufficiale Anthropic. Skill da fonti sconosciute vanno
**lette prima di essere usate** (una skill è codice/istruzioni eseguibili).

### Regola 3 — Tutto resta portabile
Nessuna configurazione va scritta a livello utente (`~/.claude/`) salvo richiesta esplicita.
Tutto va in `.claude/` del progetto e viene registrato in `skills.manifest.json`.

### Regola 4 — «Funziona su iOS» si dice solo dopo averlo visto su un iPhone
Questa e' la regola specifica di questo progetto, e non ammette scorciatoie.

Il Web Push fallisce **in silenzio**: nessun errore in console, nessuna eccezione,
semplicemente la notifica non arriva. Un test automatico che passa, un `curl` che
risponde 201 e un service worker registrato **non dimostrano niente** sul fatto che
il telefono squilli.

Quindi:

- il verbale `docs/esperimento.md` distingue sempre **ipotesi** (quello che dice la documentazione) da
  **esito verificato** (quello che si e' visto accadere su un dispositivo reale, con
  modello e versione di sistema annotati);
- nessuna riga del verbale passa da "ipotesi" a "verificato" senza che l'utente
  abbia riferito l'esito della prova sul suo telefono;
- se una prova fallisce, **si scrive che e' fallita e come**. Un esperimento che
  documenta solo i successi non e' un esperimento.

### Regola 5 — Un test si progetta insieme ai suoi strumenti di misura
Prima di dichiarare pronto un banco di prova, la domanda e' una: **se fallisce, da
dove leggo il perche'?** Se la risposta e' «lo chiedo a chi ha in mano il
telefono», gli strumenti mancano e il lavoro non e' finito.

Si lavora come un laboratorio: l'esperimento **scrive il proprio verbale**. Qui
sono `lib/registro.js` (il registro), `/laboratorio` (la pagina che lo mostra in
tempo reale) e `strumenti/banco.js` (lo stesso da terminale). Le righe piu'
importanti le scrive il **dispositivo**, non il server: `notifica-mostrata` e'
l'unica prova che una notifica sia comparsa davvero su uno schermo.

Corollario: lo strumento di misura non deve mai poter guastare l'esperimento.
`annota()` assorbe i propri errori e viene sempre **dopo** `showNotification()`.

### Regola 6 — Un endpoint che agisce verso l'esterno nasce chiuso
Le rotte si separano per **ampiezza dell'effetto**, non per comodita':

- agisce **su tutti** (`/api/invia`, `/api/registro`) → richiede sempre un
  segreto, e se il segreto non e' configurato risponde **chiusa, non aperta**;
- agisce **solo sul chiamante** (`/api/prova`) → puo' restare libera, ma chi
  chiama deve esibire qualcosa che solo lui possiede (il proprio endpoint push).

Non e' una rifinitura da mettere in fondo al README come manutenzione
facoltativa: se una rotta puo' far squillare i telefoni di altri, nasce chiusa.

### Regola 7 — La chiave privata VAPID non esce da qui
`.env` contiene la chiave privata con cui si firmano le notifiche. Chi ce l'ha puo'
spedire notifiche a nome di questo sito a tutti i dispositivi iscritti. Non va nei
commit, non va nei log, non va incollata in chat. Se dovesse uscire: si rigenera la
coppia con `node strumenti/genera-vapid.js` e si svuota `data/iscrizioni.json`,
perche' le vecchie iscrizioni sono legate alla vecchia chiave e non funzionerebbero
comunque piu'.

Vale lo stesso per `data/iscrizioni.json`: sono endpoint e chiavi di cifratura di
telefoni veri, non dati di prova.

---

## Struttura

```
.claude/
├── settings.json          # config di progetto: marketplace, plugin abilitati, permessi
├── skills/                # skill installate o scritte a mano (portabili, versionate)
├── agents/                # subagent specializzati
│   ├── skill-scout.md     # cerca skill esistenti (locale + web)
│   └── doc-researcher.md  # ricerca documentazione ufficiale online
├── commands/              # slash command di progetto
└── scripts/               # script eseguibili (bash, nessuna dipendenza oltre node/git)
    ├── bootstrap.sh       # ricostruisce l'ambiente su una macchina nuova
    ├── skill-search.sh    # cerca nel marketplace ufficiale già su disco
    ├── skill-add.sh       # installa una skill/plugin nel progetto + aggiorna manifest
    └── skills-status.sh   # inventario di ciò che è installato

.agents/skills/            # skill installate con npx skills (valgono per qualunque agente)

skills.manifest.json       # registro portabile: cosa è installato, da dove, perché
docs/research/             # note di ricerca online riutilizzabili
```

L'apparato di misura:

```
lib/registro.js         il verbale: chi, quando, con che esito (JSONL)
public/laboratorio.html la pagina dello strumento, live — /laboratorio
strumenti/banco.js      lo stesso da terminale: verifica, registro, segui, invia
```

La conoscenza raccolta:

```
README.md                 presentazione per GitHub, inglese e italiano
docs/USAGE.md             guida d'uso: utenti, amministratore, sviluppatori (EN · IT)
docs/esperimento.md       il verbale dell'esperimento: fasi, esiti, correzioni.
                          RESTA IN LOCALE: non viene pubblicato su GitHub (scelta del
                          proprietario). strumenti/pubblica-github.sh lo esclude.
docs/audit-*.md           audit d'interfaccia (skill web-design-guidelines di Vercel)
public/architettura.html  il documento: architettura + istruzioni — /architettura
public/comunicazione.htm  la guida app <-> server — /comunicazione
docs/research/            le fonti primarie, con data e trappole
```

Le pagine del sito restano in italiano; la documentazione per GitHub e' in inglese e
in italiano, **inglese per primo**. Chi aggiorna una lingua aggiorna anche l'altra.

L'applicazione vera e propria e' descritta nel `README.md`.

## Canali di installazione supportati

| Canale | Comando | Dove finisce |
|---|---|---|
| Marketplace ufficiale Anthropic | `claude plugin install <nome> --scope project` | `.claude/settings.json` (`enabledPlugins`) |
| Marketplace di terze parti | `claude plugin marketplace add <repo> --scope project` | `.claude/settings.json` (`extraKnownMarketplaces`) |
| Skill da repo GitHub | `npx skills add <owner>/<repo> --copy` | `.claude/skills/<nome>/` |
| Skill scritta a mano | `.claude/scripts/skill-add.sh --new <nome>` | `.claude/skills/<nome>/SKILL.md` |

Usa sempre `.claude/scripts/skill-add.sh`: incapsula i canali sopra e **aggiorna il manifest**,
che è ciò che rende la struttura ricostruibile altrove.

## Convenzioni di scrittura

- Interfaccia, documentazione e nomi delle rotte in **italiano**.
- Nel testo mostrato all'utente si usano gli accenti veri (`è`, `perché`); nei
  commenti del codice si usa la forma con l'apostrofo (`e'`, `pero'`), per non
  dipendere dalla codifica del terminale.
- I commenti spiegano **perche'**, non **cosa**. Un commento che ripete la riga
  sotto e' rumore; uno che dice perche' quella riga non si puo' togliere e' il
  motivo per cui esistono i commenti.

## Prima di dire che hai finito

```bash
npm test                                   # deve essere verde (118 test)
node --check server.js && node --check sw.js
node strumenti/banco.js verifica           # lista di controllo dell'infrastruttura
```

E, per qualunque cosa riguardi le notifiche: vedi **Regola 4**.

## Template nota di ricerca (`docs/research/<argomento>.md`)

```markdown
# <Argomento>
Data: YYYY-MM-DD · Validità stimata: <es. verificare a ogni major release>

## Fonti
- <URL fonte primaria> — <cosa dice>

## Sintesi operativa
- <fatti verificati, versioni, API, vincoli>

## Trappole / errori comuni
- <...>
```
