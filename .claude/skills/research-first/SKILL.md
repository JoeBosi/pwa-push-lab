---
name: research-first
description: Prima di ogni task tecnico (codice, config, protocolli, librerie, infrastruttura, sicurezza, deploy, autenticazione), documentarsi online su fonti ufficiali e salvare una nota in docs/research/. Usare prima di scrivere codice o eseguire comandi su tecnologie non gia' documentate nel progetto.
---

# research-first — documentazione ufficiale prima del codice

## Quando usarla
Prima di **ogni task tecnico**: implementare un protocollo (TOTP/HOTP, OAuth, WebAuthn...),
usare una libreria o un SDK, configurare un servizio o un VPS, scegliere un'architettura,
fare hardening di sicurezza, deploy.

Non serve se: la risposta e' gia' in `docs/research/` ed e' ancora valida, il task e' una
modifica meccanica, o e' una domanda conversazionale.

## Perche'
La conoscenza del modello ha una data di taglio e le tecnologie cambiano: versioni, API
deprecate, default di sicurezza, breaking change. Su sicurezza e autenticazione un dettaglio
obsoleto e' un difetto reale, non un'imprecisione.

## Procedura

### 1. Controlla la cache locale
```bash
ls docs/research/
```
Se esiste una nota sull'argomento, leggila e verifica la data. Se e' recente e copre il caso,
riusala e non ripetere la ricerca.

### 2. Cerca — fonti primarie per prime
Ordine di preferenza:
1. **Documentazione ufficiale** del progetto/vendor (`WebFetch` sulla pagina esatta)
2. **Specifiche**: RFC, W3C, NIST, OWASP Cheat Sheet
3. **Repo upstream**: README, CHANGELOG, release notes, issue aperte
4. Solo in ultima istanza: blog, StackOverflow, tutorial — e sempre da verificare contro (1)

`WebSearch` per trovare l'URL giusto, poi `WebFetch` per leggerlo davvero. Non fermarti allo
snippet del motore di ricerca.

### 3. Verifica l'attualita'
- Qual e' la **versione corrente**? Cosa e' cambiato nelle ultime release?
- L'approccio e' **deprecato**? Esiste un successore raccomandato?
- Ci sono **CVE** o avvisi di sicurezza noti?

Se le fonti si contraddicono, dillo esplicitamente e indica quale hai seguito e perche'.

### 4. Salva la nota
`docs/research/<argomento>.md`:
```markdown
# <Argomento>
Data: YYYY-MM-DD · Validita' stimata: <quando riverificare>

## Fonti
- <URL> — <cosa dice, versione a cui si riferisce>

## Sintesi operativa
- <fatti verificati: API, parametri, vincoli, valori raccomandati>

## Trappole / errori comuni
- <...>
```
Nota corta e operativa, non un riassunto enciclopedico.

### 5. Poi implementa
Cita nel lavoro le decisioni che derivano dalla ricerca ("uso X perche' la doc ufficiale
raccomanda Y dalla versione Z").

### Se la ricerca non e' possibile
Se `WebSearch`/`WebFetch` non sono disponibili o non trovano nulla di utile: **dichiaralo**,
elenca le assunzioni su cui procedi, e segnala all'utente cosa andrebbe verificato.

## Vedi anche
- `skill-first` — cercare una skill gia' pronta prima di implementare a mano.
