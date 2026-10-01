/*
 * <pwa-invito> — invito all'installazione e all'attivazione delle notifiche.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Un file, nessuna dipendenza, si copia in qualunque PWA. Web component con
 * shadow DOM: la grafica della pagina ospite non puo' romperlo, e lui non puo'
 * rompere la pagina ospite. Il tema si cambia dall'esterno con le proprieta'
 * CSS elencate in fondo a questo commento.
 *
 * ── Perche' esiste, dato che ci sono gia' due librerie mature ───────────────
 * Perche' entrambe si fermano all'installazione. Il percorso vero e' a TRE
 * passi — installa → concedi il permesso → iscriviti — e su iPhone il secondo e
 * il terzo esistono SOLO dopo il primo. Una libreria che copre il primo terzo
 * del problema va comunque estesa, e allora tanto vale possederla.
 *
 * ── Cosa e' stato preso da chi c'era prima ─────────────────────────────────
 * Da philfung/add-to-homescreen (MIT): la freccia animata che punta al pulsante
 * Condividi — l'unica scelta d'interfaccia per cui esista un'affermazione sui
 * tassi di installazione — e il riconoscimento dei browser in-app, che sono il
 * caso piu' frequente e il piu' trascurato.
 * Da khmyznikov/pwa-install (MIT): la memoria del rifiuto e l'idea del foglio
 * dal basso con stile di piattaforma.
 * Nessun codice copiato: solo le decisioni, verificate e reimplementate.
 *
 * ── Il vincolo che nessuno puo' aggirare ───────────────────────────────────
 * Su iOS non esiste alcuna API per installare. navigator.install() e'
 * Chromium-only e su iOS ogni browser e' WebKit. Chi promette "installazione
 * automatica su iPhone" sta descrivendo Android. Qui il massimo possibile e'
 * rendere il gesto ovvio: e' esattamente quello che fa la freccia.
 *
 * ── Uso ────────────────────────────────────────────────────────────────────
 *   <script type="module" src="/componente/pwa-invito.js"></script>
 *   <pwa-invito nome-app="La mia app" icona="/icone/icona-192.png"></pwa-invito>
 *
 * Attributi: nome-app · icona · ritardo (ms, default 2500) · rinvio-giorni
 *            (default 7) · senza-notifiche (ferma il percorso all'installazione)
 * Proprieta': stato (sola lettura) · mostra() · nascondi() · riaccendi()
 * Eventi:  pwa-invito-mostrato · pwa-invito-rinviato · pwa-invito-spento
 *          pwa-invito-installata · pwa-invito-passo (dettaglio: {passo})
 *          pwa-invito-notifiche (dettaglio: {esito})
 *
 * ── Tema (proprieta' CSS, si impostano su pwa-invito o su :root) ───────────
 *   --pwa-accento · --pwa-accento-scuro · --pwa-su-accento
 *   --pwa-fondo · --pwa-testo · --pwa-tenue · --pwa-bordo
 *   --pwa-raggio · --pwa-ombra · --pwa-carattere
 */

const MODELLO = document.createElement('template');
MODELLO.innerHTML = `
<style>
  :host {
    /* Valori di riserva: il progetto ospite li sovrascrive dall'esterno con
       --pwa-*. I nomi interni hanno il prefisso --i- per una ragione precisa:
       se si chiamassero come quelli della pagina (--bordo, --testo…), la regola
       della pagina "--pwa-bordo: var(--bordo)" e questa "--bordo:
       var(--pwa-bordo)" agirebbero sullo stesso elemento e si richiamerebbero
       a vicenda. Il browser scarta le variabili cicliche: colori e bordi
       tornerebbero ai valori di sistema, neri. E' successo davvero (audit del
       2026-10-01): un componente da riusare non puo' scegliere nomi che una
       pagina ospite potrebbe gia' usare. */
    --i-accento: var(--pwa-accento, #2563eb);
    --i-accento-scuro: var(--pwa-accento-scuro, #1e3a8a);
    --i-su-accento: var(--pwa-su-accento, #ffffff);
    --i-fondo: var(--pwa-fondo, #ffffff);
    --i-testo: var(--pwa-testo, #16213e);
    --i-tenue: var(--pwa-tenue, #5b6785);
    --i-bordo: var(--pwa-bordo, #e4e8f2);
    --i-raggio: var(--pwa-raggio, 22px);
    --i-ombra: var(--pwa-ombra, 0 -8px 40px rgba(16, 24, 48, 0.18));
    --i-carattere: var(--pwa-carattere, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);

    color-scheme: light dark;
    position: fixed; inset: 0; z-index: 2147483000;
    display: none; font-family: var(--i-carattere);
    /* pointer-events sul solo contenuto: la pagina sotto resta usabile
       finche' il velo non e' acceso. */
    pointer-events: none;
  }
  :host([aperto]) { display: block; }

  @media (prefers-color-scheme: dark) {
    :host {
      --i-fondo: var(--pwa-fondo, #171e30);
      --i-testo: var(--pwa-testo, #e9edf7);
      --i-tenue: var(--pwa-tenue, #9aa6c4);
      --i-bordo: var(--pwa-bordo, #2a3452);
      --i-ombra: var(--pwa-ombra, 0 -8px 40px rgba(0, 0, 0, 0.5));
    }
  }

  .velo {
    position: absolute; inset: 0; background: rgba(9, 14, 28, 0.45);
    opacity: 0; transition: opacity .28s ease; pointer-events: auto;
    -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
  }
  :host([aperto]) .velo { opacity: 1; }

  /* ── il foglio ─────────────────────────────────────────────────────────── */
  .foglio {
    position: absolute; left: 0; right: 0; bottom: 0;
    margin: 0 auto; max-width: 30rem;
    background: var(--i-fondo); color: var(--i-testo);
    border-radius: var(--i-raggio) var(--i-raggio) 0 0;
    box-shadow: var(--i-ombra);
    padding: 8px 22px calc(env(safe-area-inset-bottom) + 22px);
    pointer-events: auto;
    transform: translateY(100%);
    transition: transform .38s cubic-bezier(.32, .72, 0, 1);
    max-height: 88vh; overflow-y: auto;
    /* Il foglio non deve rimbalzare trascinando il contenuto della pagina. */
    overscroll-behavior: contain;
  }
  :host([aperto]) .foglio { transform: translateY(0); }
  /* Su iPhone in Safari il pulsante Condividi sta nella barra IN BASSO, fuori
     dalla pagina. Il foglio si alza per lasciare libero quel bordo: e' li' che
     va la freccia, e senza questo spazio punterebbe a se stessa. */
  :host([indica="basso"]) .foglio { bottom: 74px; border-radius: var(--i-raggio); left: 10px; right: 10px; }

  .maniglia {
    width: 38px; height: 4px; border-radius: 2px; background: var(--i-bordo);
    margin: 6px auto 14px; cursor: grab;
  }

  .capo { display: flex; align-items: center; gap: 13px; margin-bottom: 4px; }
  .capo img { width: 52px; height: 52px; border-radius: 12px; flex: none; }
  h2 { font-size: 1.16rem; margin: 0; letter-spacing: -0.015em; line-height: 1.25; }
  .occhiello {
    font-size: .72rem; font-weight: 700; letter-spacing: .09em;
    text-transform: uppercase; color: var(--i-accento); margin: 0 0 3px;
  }
  p { margin: 12px 0 0; font-size: .95rem; line-height: 1.5; color: var(--i-tenue); }
  p.forte { color: var(--i-testo); }

  /* ── i tre passi ───────────────────────────────────────────────────────── */
  .percorso { display: flex; gap: 6px; margin: 16px 0 4px; }
  .tratto { flex: 1; height: 3px; border-radius: 2px; background: var(--i-bordo); overflow: hidden; }
  .tratto.fatto { background: var(--i-accento); }
  .tratto.ora::after {
    content: ""; display: block; height: 100%; width: 40%;
    background: var(--i-accento); animation: scorre 1.5s ease-in-out infinite;
  }
  @keyframes scorre { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
  .etichetta-passo { font-size: .74rem; color: var(--i-tenue); margin: 7px 0 0; letter-spacing: .02em; }

  /* ── le istruzioni ─────────────────────────────────────────────────────── */
  ol { margin: 16px 0 0; padding: 0; list-style: none; counter-reset: p; }
  ol li {
    counter-increment: p; display: flex; align-items: flex-start; gap: 12px;
    padding: 9px 0; font-size: .93rem; line-height: 1.45;
  }
  ol li::before {
    content: counter(p); flex: none;
    width: 23px; height: 23px; border-radius: 50%;
    background: var(--i-accento); color: var(--i-su-accento);
    font-size: .76rem; font-weight: 700;
    display: grid; place-items: center; margin-top: 1px;
  }
  .glifo {
    display: inline-grid; place-items: center; flex: none;
    width: 27px; height: 27px; border-radius: 7px;
    background: color-mix(in srgb, var(--i-accento) 13%, transparent);
    margin-left: auto;
  }
  .glifo svg { width: 16px; height: 16px; fill: none; stroke: var(--i-accento); stroke-width: 1.9; }

  /* ── pulsanti ──────────────────────────────────────────────────────────── */
  .pulsanti { display: flex; flex-direction: column; gap: 9px; margin-top: 20px; }
  button {
    font: inherit; font-size: .97rem; font-weight: 650;
    min-height: 50px; padding: 13px 20px;
    border-radius: 13px; border: 1.5px solid transparent; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 9px;
    transition: transform .12s ease, opacity .12s ease;
  }
  button:active { transform: scale(.978); }
  button { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
  /* Il focus da tastiera si vede sempre; quello dal tocco no (focus-visible). */
  button:focus-visible, .foglio:focus-visible {
    outline: 3px solid var(--i-accento); outline-offset: 2px;
  }
  .foglio:focus { outline: none; }
  .foglio:focus-visible { outline-offset: -3px; }
  .principale { background: var(--i-accento); color: var(--i-su-accento); }
  .secondario { background: transparent; color: var(--i-accento); border-color: var(--i-accento); }
  .minori { display: flex; gap: 8px; margin-top: 3px; }
  .minori button {
    flex: 1; min-height: 44px; padding: 9px 12px; font-size: .84rem; font-weight: 550;
    background: transparent; color: var(--i-tenue); border-color: var(--i-bordo);
  }

  /* ── la freccia ────────────────────────────────────────────────────────────
     E' la sola scelta d'interfaccia di questo componente per cui esista
     un'affermazione sui tassi di installazione: philfung dichiara che
     toglierla li peggiora in modo netto. Trasforma "leggi tre righe e capisci"
     in "guarda dove indica". */
  .freccia {
    position: absolute; left: 50%; transform: translateX(-50%);
    pointer-events: none; display: none;
  }
  :host([indica="basso"]) .freccia { display: block; bottom: 8px; }
  :host([indica="alto"]) .freccia { display: block; top: calc(env(safe-area-inset-top) + 8px); }
  .freccia svg { width: 40px; height: 46px; filter: drop-shadow(0 3px 9px rgba(0,0,0,.32)); }
  .freccia path { fill: var(--i-accento); }
  :host([indica="basso"]) .freccia { animation: giu 1.15s ease-in-out infinite; }
  :host([indica="alto"]) .freccia { animation: su 1.15s ease-in-out infinite; }
  @keyframes giu { 0%,100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, 11px); } }
  @keyframes su  { 0%,100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, -11px); } }

  /* Il movimento non e' decorazione qui: e' l'indicazione. Chi ha chiesto meno
     movimento la vede ferma, ma la vede: sparire sarebbe perdere l'istruzione. */
  @media (prefers-reduced-motion: reduce) {
    .freccia, .tratto.ora::after { animation: none; }
    .foglio, .velo { transition: none; }
  }

  .nota { font-size: .8rem; color: var(--i-tenue); margin-top: 14px; text-align: center; }
  .nascosto { display: none !important; }
</style>

<div class="velo" part="velo"></div>

<div class="freccia" aria-hidden="true">
  <svg viewBox="0 0 40 46"><path d="M20 46 L4 26 h9.5 V0 h13 v26 H36 Z"/></svg>
</div>

<section class="foglio" role="dialog" aria-modal="true" aria-labelledby="titolo" tabindex="-1" part="foglio">
  <div class="maniglia" part="maniglia"></div>

  <div class="capo">
    <img id="icona" alt="" width="52" height="52">
    <div>
      <p class="occhiello" id="occhiello"></p>
      <h2 id="titolo"></h2>
    </div>
  </div>

  <div class="percorso" id="percorso" aria-hidden="true">
    <span class="tratto" data-t="1"></span>
    <span class="tratto" data-t="2"></span>
    <span class="tratto" data-t="3"></span>
  </div>
  <p class="etichetta-passo" id="etichetta-passo"></p>

  <p id="testo"></p>
  <ol id="passi" class="nascosto"></ol>

  <div class="pulsanti">
    <button class="principale nascosto" id="btn-principale" type="button"></button>
    <button class="secondario nascosto" id="btn-secondario" type="button"></button>
    <div class="minori">
      <button id="btn-dopo" type="button">Non ora</button>
      <button id="btn-mai" type="button">Non mostrarlo più</button>
    </div>
  </div>

  <p class="nota nascosto" id="nota"></p>
</section>
`;

/* ═══════════════════════════════════════════════ rilevamento dell'ambiente ══ */

/**
 * Chi sta guardando la pagina, e che cosa puo' fare.
 * Esportato perche' serve anche fuori dal componente (diagnostica, verbale).
 */
export function rilevaAmbiente() {
  const ua = navigator.userAgent || '';

  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    // Dal 2019 iPadOS si presenta come un Mac: l'unica differenza affidabile
    // e' che un Mac vero non ha lo schermo tattile.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const iPad = iOS && (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const android = /Android/i.test(ua);

  /* I browser dentro le app. Sono la sorgente di traffico piu' comune da
     social, e sono ESATTAMENTE quelli in cui l'installazione e' impossibile:
     non hanno la voce "Aggiungi a Home". Vanno riconosciuti per primi, non
     trattati come caso residuale. */
  const inApp =
    /FBAN|FBAV|FB_IAB/i.test(ua) ? 'Facebook' :
    /Instagram/i.test(ua) ? 'Instagram' :
    /Line\//i.test(ua) ? 'LINE' :
    /Twitter|TwitterAndroid/i.test(ua) ? 'X' :
    /LinkedInApp/i.test(ua) ? 'LinkedIn' :
    /TikTok|BytedanceWebview/i.test(ua) ? 'TikTok' :
    /Snapchat/i.test(ua) ? 'Snapchat' :
    /WhatsApp/i.test(ua) ? 'WhatsApp' :
    /Pinterest/i.test(ua) ? 'Pinterest' :
    // WebView Android generica: niente "Chrome/" ma "; wv)".
    (android && /; wv\)/.test(ua)) ? 'app' : null;

  /* Su iOS tutti i browser sono WebKit. Per un periodo solo Safari poteva
     aggiungere alla schermata Home, ma **da iOS 16.4 non e' piu' vero**: i
     browser di terze parti possono offrire "Aggiungi a Home" nel menu Condividi
     (fonte: WebKit, note di Safari 16.4). Chrome, Edge, Firefox e DuckDuckGo lo
     fanno. In Europa la cosa ha oscillato nel 2024 per via del DMA, ma Apple ha
     fatto marcia indietro e le web app sulla Home sono rimaste.

     Resta una differenza di CERTEZZA, non di possibilita': in Safari sappiamo
     dov'e' il pulsante e possiamo puntarci una freccia; negli altri il menu
     cambia da browser a browser e da versione a versione, quindi si danno
     istruzioni a parole e si tiene Safari come ripiego. */
  const safariIOS = iOS && !inApp && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo|YaBrowser/i.test(ua);
  const altroBrowserIOS = iOS && !safariIOS && !inApp;

  // Il nome del browser, per dirgli "nel menu di Chrome" invece di "nel menu".
  const nomeBrowserIOS =
    /CriOS/i.test(ua) ? 'Chrome' :
    /FxiOS/i.test(ua) ? 'Firefox' :
    /EdgiOS/i.test(ua) ? 'Edge' :
    /OPiOS/i.test(ua) ? 'Opera' :
    /DuckDuckGo/i.test(ua) ? 'DuckDuckGo' :
    /YaBrowser/i.test(ua) ? 'Yandex' : null;

  const installata =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    navigator.standalone === true;

  // Versione di iOS: sotto la 16.4 le notifiche push non esistono affatto.
  let versioneIOS = null;
  const m = ua.match(/OS (\d+)[_.](\d+)/);
  if (iOS && m) versioneIOS = Number(m[1]) + Number(m[2]) / 10;

  return {
    iOS, iPad, android, inApp, safariIOS, altroBrowserIOS, nomeBrowserIOS,
    installata, versioneIOS,
    // Se i link dentro lo scope possono finire da soli nell'app installata.
    // Su iOS MAI: ogni link va al browser predefinito, che la PWA sia
    // installata o no. Non e' configurazione mancante, non esiste proprio.
    catturaLink: !iOS && !inApp,
    sicura: window.isSecureContext === true,
    pushPossibile: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    nome: iOS ? 'iOS' : android ? 'Android'
      : /Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows'
      : /Linux/.test(ua) ? 'Linux' : 'sconosciuta',
  };
}

/**
 * Questa stessa app risulta gia' installata sul dispositivo?
 *
 * Richiede `related_applications: [{ platform: "webapp", url: "<url assoluto
 * del manifest>" }]` nel manifest — l'app si dichiara fra le proprie app
 * correlate, ed e' cosi' che si riconosce.
 *
 * **Solo Chromium.** Su iOS non c'e' modo di saperlo: non esiste l'API, e la
 * web app installata ha un contenitore di dati separato da Safari, quindi non
 * funziona nemmeno il trucco di lasciare un segno in localStorage. Su iOS
 * questa funzione risponde sempre `null`, che significa "non lo so" — ed e'
 * diverso da `false`, che significherebbe "no". La differenza conta: su un
 * "non lo so" non si puo' dire all'utente che non ce l'ha.
 */
export async function giaInstallataAltrove() {
  if (!navigator.getInstalledRelatedApps) return null;
  try {
    const trovate = await navigator.getInstalledRelatedApps();
    return trovate.some((a) => a.platform === 'webapp');
  } catch (e) {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════ il componente ══ */

const G = {
  rinvio: 'pwa-invito-rinviato-fino-a',
  spento: 'pwa-invito-spento',
};

class PwaInvito extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).appendChild(MODELLO.content.cloneNode(true));
    this.amb = rilevaAmbiente();
    this._prompt = null;      // l'evento beforeinstallprompt messo da parte
    this._passo = 0;          // 0 = nessuno, 1 installa, 2 permesso, 3 fatto
    this._aperto = false;
  }

  /* --------------------------------------------------------- ciclo di vita */

  connectedCallback() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    this.el = {
      velo: this.shadowRoot.querySelector('.velo'),
      foglio: this.shadowRoot.querySelector('.foglio'),
      maniglia: this.shadowRoot.querySelector('.maniglia'),
      icona: $('icona'), occhiello: $('occhiello'), titolo: $('titolo'),
      testo: $('testo'), passi: $('passi'), nota: $('nota'),
      percorso: $('percorso'), etichettaPasso: $('etichetta-passo'),
      principale: $('btn-principale'), secondario: $('btn-secondario'),
      dopo: $('btn-dopo'), mai: $('btn-mai'),
    };

    this.el.icona.src = this.getAttribute('icona') || '/icone/icona-192.png';
    this.el.velo.addEventListener('click', () => this.rinvia(false));
    this.el.dopo.addEventListener('click', () => this.rinvia(true));
    this.el.mai.addEventListener('click', () => this.spegni());

    /*
     * Tastiera: Esc chiude come "non ora", e Tab gira DENTRO il foglio finche'
     * e' aperto. Senza la trappola, Tab porterebbe il focus sulla pagina sotto,
     * che il lettore di schermo considera inesistente.
     */
    this.shadowRoot.addEventListener('keydown', (ev) => {
      if (!this._aperto) return;
      if (ev.key === 'Escape') { ev.preventDefault(); this.rinvia(false); return; }
      if (ev.key !== 'Tab') return;
      const attivi = [...this.shadowRoot.querySelectorAll('button')]
        .filter((b) => !b.disabled && b.offsetParent !== null);
      if (!attivi.length) return;
      const primo = attivi[0], ultimo = attivi[attivi.length - 1];
      const ora = this.shadowRoot.activeElement;
      if (ev.shiftKey && (ora === primo || ora === this.el.foglio)) { ev.preventDefault(); ultimo.focus(); }
      else if (!ev.shiftKey && ora === ultimo) { ev.preventDefault(); primo.focus(); }
    });
    this._abilitaTrascinamento();

    // beforeinstallprompt va bloccato e messo da parte, o Chrome mostra la sua
    // barretta e l'evento si perde: da quel momento l'installazione in un tocco
    // non sarebbe piu' possibile.
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this._prompt = e;
      if (this._aperto) this._disegna();
    });

    window.addEventListener('appinstalled', () => {
      this._prompt = null;
      this.amb.installata = true;
      this._emetti('pwa-invito-installata', {});
      // Non si chiude: si passa al secondo passo. L'utente ha appena fatto la
      // cosa piu' difficile, ed e' il momento in cui e' piu' disposto a
      // concedere il permesso.
      this._passo = 2;
      this._aperto ? this._disegna() : this.mostra();
    });

    // Aprendo l'app dall'icona display-mode cambia senza ricaricare la pagina.
    const mq = window.matchMedia('(display-mode: standalone)');
    const suCambio = (ev) => {
      if (!ev.matches) return;
      this.amb.installata = true;
      this._passo = 2;
      this._disegna();
    };
    mq.addEventListener ? mq.addEventListener('change', suCambio) : mq.addListener(suCambio);

    const ritardo = Number(this.getAttribute('ritardo'));
    // La rilevazione parte subito ma non blocca: se risponde tardi, peggio che
    // altro l'invito compare com'era prima. Meglio un invito imperfetto che una
    // pagina ferma ad aspettare una risposta che su iOS non arrivera' mai.
    giaInstallataAltrove().then((r) => {
      this.amb.giaInstallata = r;
      if (this._aperto) this._disegna();
    });
    setTimeout(() => this._forse(), Number.isFinite(ritardo) ? ritardo : 2500);
  }

  /* ------------------------------------------------------------- decisione */

  /** Se e quando comparire. Il silenzio e' una risposta legittima. */
  _forse() {
    if (this._spentoDaUtente() || this._rinviato()) return;
    if (this.amb.installata && !this._notificheDaFare()) return;
    this._passo = this.amb.installata ? 2 : 1;
    this.mostra();
  }

  /** Vero quando i link possono finire da soli nell'app installata.
      Falso su iOS, e non per una configurazione mancante: li' non esiste. */
  get catturaLinkPossibile() { return this.amb.catturaLink; }

  _notificheDaFare() {
    if (this.hasAttribute('senza-notifiche')) return false;
    if (!this.amb.pushPossibile) return false;
    // 'denied' e' definitivo: il browser non richiedera' piu'. Insistere
    // sarebbe mostrare un pulsante che non puo' funzionare.
    return Notification.permission === 'default';
  }

  _rinviato() {
    try { return Number(localStorage.getItem(G.rinvio) || 0) > Date.now(); }
    catch (e) { return false; } // navigazione privata: meglio mostrarlo
  }

  _spentoDaUtente() {
    try { return localStorage.getItem(G.spento) === 'si'; } catch (e) { return false; }
  }

  /* ------------------------------------------------------------- apertura */

  mostra() {
    this._disegna();
    // Si ricorda chi aveva il focus, per restituirglielo alla chiusura.
    this._focusPrima = document.activeElement;
    this.setAttribute('aperto', '');
    this._aperto = true;
    /*
     * Il foglio si dichiara aria-modal: per un lettore di schermo tutto il resto
     * della pagina diventa inerte. Se il focus restasse fuori, chi naviga da
     * tastiera si troverebbe in una zona che "non esiste" — bloccato. Il focus
     * va sul pulsante principale o, se non c'e', sul foglio stesso.
     * Si aspetta un fotogramma: prima della transizione l'elemento non e'
     * ancora focalizzabile su alcuni browser.
     */
    // Sul foglio e non sul primo pulsante: il lettore di schermo annuncia il
    // titolo della finestra, chi usa la tastiera entra nei pulsanti con Tab, e
    // chi tocca non vede comparire un anello di focus che non ha chiesto.
    requestAnimationFrame(() => this.el.foglio.focus({ preventScroll: true }));
    this._emetti('pwa-invito-mostrato', { passo: this._passo, ambiente: this.amb });
  }

  nascondi() {
    const eraAperto = this._aperto;
    this.removeAttribute('aperto');
    this.removeAttribute('indica');
    this._aperto = false;
    // Il focus torna dov'era: chiudere una finestra non deve far perdere il
    // segno a chi naviga da tastiera.
    if (eraAperto && this._focusPrima && this._focusPrima.focus) {
      try { this._focusPrima.focus({ preventScroll: true }); } catch (e) { /* elemento sparito */ }
    }
  }

  /** «Non ora»: torna fra `rinvio-giorni`. Il velo toccato vale come non ora. */
  rinvia(esplicito) {
    const giorni = Number(this.getAttribute('rinvio-giorni')) || 7;
    try { localStorage.setItem(G.rinvio, String(Date.now() + giorni * 864e5)); } catch (e) { /* — */ }
    this.nascondi();
    this._emetti('pwa-invito-rinviato', { esplicito: !!esplicito, giorni });
  }

  /** «Non mostrarmelo più»: per sempre, finche' non si chiama riaccendi(). */
  spegni() {
    try { localStorage.setItem(G.spento, 'si'); } catch (e) { /* — */ }
    this.nascondi();
    this._emetti('pwa-invito-spento', {});
  }

  /** Riaccende un invito spento. La pagina ospite deve offrirne il modo:
      una scelta definitiva senza ripensamento non e' rispetto, e' un vicolo. */
  riaccendi() {
    try { localStorage.removeItem(G.spento); localStorage.removeItem(G.rinvio); }
    catch (e) { /* — */ }
    this._passo = this.amb.installata ? 2 : 1;
    this.mostra();
  }

  get stato() {
    return {
      ambiente: this.amb, passo: this._passo, aperto: this._aperto,
      installabileInUnTocco: !!this._prompt,
      giaInstallata: this.amb.giaInstallata,   // true | false | null («non lo so»)
      catturaLink: this.amb.catturaLink,
      rinviato: this._rinviato(), spento: this._spentoDaUtente(),
    };
  }

  /* --------------------------------------------------------- il contenuto */

  _disegna() {
    const e = this.el;
    const a = this.amb;

    this.removeAttribute('indica');
    e.passi.classList.add('nascosto');
    e.nota.classList.add('nascosto');
    [e.principale, e.secondario].forEach((b) => { b.classList.add('nascosto'); b.onclick = null; });
    e.mai.classList.remove('nascosto');
    e.titolo.textContent = '';

    this._disegnaPercorso();

    if (this._passo === 2) return this._scenarioNotifiche();
    // Prima di ogni altra cosa: se e' gia' installata e la stiamo guardando nel
    // browser, riproporre l'installazione e' il modo piu' rapido di sembrare
    // rotti. Si dice invece dove trovarla.
    if (a.giaInstallata === true && !a.installata) return this._scenarioGiaInstallata();
    if (a.inApp) return this._scenarioInApp();
    if (a.altroBrowserIOS) return this._scenarioIOSAltroBrowser();
    if (a.iOS) return this._scenarioIOSSafari();
    if (this._prompt) return this._scenarioUnTocco();
    return this._scenarioManuale();
  }

  _disegnaPercorso() {
    const finale = this.hasAttribute('senza-notifiche');
    this.el.percorso.style.display = finale ? 'none' : '';
    const etichette = { 1: 'Passo 1 di 2 — installazione', 2: 'Passo 2 di 2 — notifiche', 3: 'Fatto' };
    this.el.etichettaPasso.textContent = finale ? '' : (etichette[this._passo] || '');
    this.shadowRoot.querySelectorAll('.tratto').forEach((t) => {
      const n = Number(t.dataset.t);
      t.className = 'tratto' + (n < this._passo ? ' fatto' : n === this._passo ? ' ora' : '');
      // Con due passi il terzo tratto non ha senso: sparisce.
      t.style.display = n === 3 ? 'none' : '';
    });
  }

  /* — Android e desktop: un tocco, ed e' il massimo che il web consenta — */
  _scenarioUnTocco() {
    const e = this.el;
    e.occhiello.textContent = 'Installazione';
    e.titolo.textContent = `Aggiungi ${this._nomeApp()} alla schermata Home`;
    e.testo.textContent = 'Un tocco. Poi le notifiche arriveranno anche ad app chiusa, ' +
      'e l\'icona resterà insieme alle altre.';
    e.testo.className = 'forte';
    e.principale.textContent = 'Installa ora';
    e.principale.classList.remove('nascosto');
    e.principale.onclick = () => this._installaUnTocco();
  }

  async _installaUnTocco() {
    if (!this._prompt) return;
    this.el.principale.disabled = true;
    this._prompt.prompt();
    const scelta = await this._prompt.userChoice;
    this.el.principale.disabled = false;
    if (scelta.outcome === 'accepted') return; // ci pensa 'appinstalled'
    // Rifiutata: Chrome non ripresenta l'evento in questa sessione. Lasciare il
    // pulsante acceso significherebbe lasciare un pulsante morto.
    this._prompt = null;
    this._disegna();
  }

  /* — iPhone/iPad in Safari: nessuna API, si rende ovvio il gesto — */
  _scenarioIOSSafari() {
    const e = this.el;
    // Su iPhone la barra con Condividi sta IN BASSO; su iPad in alto a destra.
    this.setAttribute('indica', this.amb.iPad ? 'alto' : 'basso');

    e.occhiello.textContent = 'Installazione';
    e.titolo.textContent = `Aggiungi ${this._nomeApp()} alla Home`;
    e.testo.innerHTML = 'Su iPhone le notifiche funzionano <strong>solo</strong> dall\'app ' +
      'installata. Segui la freccia:';
    e.testo.className = '';

    this._elencoPassi([
      { testo: this.amb.iPad
          ? 'Tocca Condividi, in alto a destra.'
          : 'Tocca Condividi, in basso — il quadrato con la freccia.',
        glifo: 'condividi' },
      { testo: 'Scorri e scegli «Aggiungi a Home».', glifo: 'piu' },
      { testo: 'Tocca «Aggiungi», poi apri l\'app dalla nuova icona.', glifo: 'spunta' },
    ]);

    if (this.amb.versioneIOS && this.amb.versioneIOS < 16.4) {
      e.nota.textContent = `Attenzione: questo iPhone ha iOS ${this.amb.versioneIOS.toFixed(1)}. ` +
        'Le notifiche push richiedono iOS 16.4 o successivo — l\'app si installa lo stesso, ' +
        'ma le notifiche non arriveranno.';
      e.nota.classList.remove('nascosto');
    }
  }

  /*
   * — iPhone, browser diverso da Safari —
   *
   * Si installa anche da qui: da iOS 16.4 i browser di terze parti possono
   * offrire "Aggiungi a Home" nel menu Condividi. Dire "solo Safari puo'" era
   * falso, e mandava a fare un giro inutile chi era gia' nel posto giusto.
   *
   * Quello che cambia rispetto a Safari non e' la possibilita' ma la CERTEZZA
   * di dove sia il pulsante: ogni browser mette Condividi in un posto suo e lo
   * sposta fra una versione e l'altra. Quindi niente freccia — puntarla a caso
   * sarebbe peggio che non averla — istruzioni a parole, e Safari offerto come
   * ripiego per i pochi browser che l'opzione non ce l'hanno.
   */
  _scenarioIOSAltroBrowser() {
    const e = this.el;
    const browser = this.amb.nomeBrowserIOS;

    e.occhiello.textContent = 'Installazione';
    e.titolo.textContent = `Aggiungi ${this._nomeApp()} alla Home`;
    e.testo.innerHTML = 'Su iPhone le notifiche funzionano <strong>solo</strong> dall\'app ' +
      'installata. Si fa anche da ' + (browser || 'questo browser') + ':';
    e.testo.className = '';

    this._elencoPassi([
      { testo: browser === 'Chrome'
          ? 'Tocca Condividi — l\'icona nella barra dell\'indirizzo, oppure ⋯ in alto a destra.'
          : 'Tocca Condividi o il menu del browser (⋯ oppure ⋮).',
        glifo: 'condividi' },
      { testo: 'Scorri e scegli «Aggiungi a Home».', glifo: 'piu' },
      { testo: 'Tocca «Aggiungi», poi apri l\'app dalla nuova icona.', glifo: 'spunta' },
    ]);

    // Ripiego, non strada principale: alcuni browser iOS non hanno la voce, e
    // li' Safari resta l'unico modo.
    e.secondario.innerHTML = 'Non la trovo — apri in Safari ' + this._svg('esterno', true);
    e.secondario.classList.remove('nascosto');
    e.secondario.onclick = () => this._apriInSafari();
  }

  /* — Browser dentro Instagram/Facebook/WhatsApp: il caso piu' frequente — */
  _scenarioInApp() {
    const e = this.el;
    e.occhiello.textContent = 'Browser limitato';
    e.titolo.textContent = `Esci da ${this.amb.inApp} per installare`;
    e.testo.textContent = `Stai guardando la pagina dentro ${this.amb.inApp}, che non permette ` +
      'di aggiungere app alla schermata Home. Serve il browser vero.';
    e.testo.className = '';

    this._elencoPassi(this.amb.iOS
      ? [{ testo: 'Tocca ⋯ o Condividi, in alto o in basso.', glifo: 'condividi' },
         { testo: 'Scegli «Apri nel browser» o «Apri in Safari».', glifo: 'esterno' },
         { testo: 'Da lì: Condividi → «Aggiungi a Home».', glifo: 'piu' }]
      : [{ testo: 'Tocca ⋮ in alto a destra.', glifo: 'menu' },
         { testo: 'Scegli «Apri in Chrome» o «Apri nel browser».', glifo: 'esterno' },
         { testo: 'Da lì comparirà il pulsante per installare.', glifo: 'spunta' }]);

    if (this.amb.iOS) {
      e.principale.innerHTML = 'Prova ad aprire in Safari ' + this._svg('esterno', true);
      e.principale.classList.remove('nascosto');
      e.principale.onclick = () => this._apriInSafari();
    }
    e.secondario.textContent = 'Copia l\'indirizzo';
    e.secondario.classList.remove('nascosto');
    e.secondario.onclick = () => this._copiaIndirizzo(e.secondario);
  }

  /* — Ce l'ha gia': non si reinstalla, si dice dove aprirla — */
  _scenarioGiaInstallata() {
    const e = this.el;
    e.occhiello.textContent = 'Già installata';
    e.titolo.textContent = `${this._nomeApp()} è già sul tuo dispositivo`;
    e.testo.innerHTML = this.amb.catturaLink
      ? 'Stai guardando la versione nel browser. Aprila dalla sua icona: le notifiche ' +
        'arrivano <strong>solo</strong> all\'app installata, non a questa scheda.'
      : 'Aprila dalla sua icona sulla schermata Home: le notifiche arrivano lì.';
    e.testo.className = '';
    e.mai.classList.add('nascosto');

    if (this.amb.catturaLink) {
      e.nota.textContent = 'Se vuoi che i link si aprano da soli nell\'app: impostazioni ' +
        'dell\'app → «Apri i link supportati».';
      e.nota.classList.remove('nascosto');
    }

    e.principale.textContent = 'Ho capito';
    e.principale.classList.remove('nascosto');
    e.principale.onclick = () => this.rinvia(true);
  }

  /* — Browser che non offre installazione (Firefox desktop, Safari macOS) — */
  _scenarioManuale() {
    const e = this.el;
    e.occhiello.textContent = 'Installazione';
    e.titolo.textContent = `Installa ${this._nomeApp()}`;
    e.testo.textContent = 'Questo browser non offre un pulsante di installazione: cercala nel ' +
      'suo menù come «Installa» o «Aggiungi alla schermata Home». ' +
      'Le notifiche qui funzionano comunque, anche senza installare.';
    e.testo.className = '';
    if (this._notificheDaFare()) {
      e.principale.textContent = 'Salta e attiva le notifiche';
      e.principale.classList.remove('nascosto');
      e.principale.onclick = () => { this._passo = 2; this._disegna(); };
    }
  }

  /* — Secondo passo: il permesso. Il piu' delicato, perche' e' definitivo — */
  _scenarioNotifiche() {
    const e = this.el;
    e.occhiello.textContent = 'Notifiche';
    e.titolo.textContent = 'Un ultimo passo';
    e.testo.innerHTML = 'Il telefono chiederà il permesso. È l\'unica volta che lo chiede: ' +
      'se rispondi «Non consentire», <strong>non lo richiederà più</strong> e andrà riaperto ' +
      'dalle impostazioni.';
    e.testo.className = '';
    e.mai.classList.add('nascosto'); // qui «mai più» non ha senso: c'e' gia' il no del sistema

    e.principale.textContent = 'Attiva le notifiche';
    e.principale.classList.remove('nascosto');
    e.principale.onclick = () => this._chiediPermesso();
  }

  async _chiediPermesso() {
    this.el.principale.disabled = true;
    // requestPermission DEVE partire dal tocco, senza attese prima: un await
    // che lo preceda rompe il legame con il gesto e su iOS viene ignorata.
    let esito;
    try { esito = await Notification.requestPermission(); }
    catch (err) { esito = Notification.permission; }
    esito = esito || Notification.permission;

    this.el.principale.disabled = false;
    this._emetti('pwa-invito-notifiche', { esito });

    if (esito === 'granted') { this._passo = 3; this.nascondi(); return; }

    this.el.occhiello.textContent = 'Permesso negato';
    this.el.titolo.textContent = 'Le notifiche restano spente';
    this.el.testo.innerHTML = this.amb.iOS
      ? 'Si riaccendono da <strong>Impostazioni → Notifiche</strong>, cercando questa app nell\'elenco.'
      : 'Si riaccendono dal lucchetto accanto all\'indirizzo → Notifiche → Consenti.';
    this.el.principale.classList.add('nascosto');
  }

  /* ------------------------------------------------------------ strumenti */

  /**
   * x-safari-https:// riapre la pagina in Safari da un altro browser iOS.
   * Non da' alcun riscontro se fallisce — su iOS 16 non funziona, e in certi
   * browser in-app e' bloccato — quindi il ripiego non e' un dettaglio: senza,
   * l'utente resterebbe fermo davanti a un pulsante che non ha fatto nulla.
   */
  _apriInSafari() {
    const indirizzo = location.href.replace(/^https?:\/\//, '');
    const btn = this.el.principale;
    const partito = Date.now();

    try { location.href = 'x-safari-https://' + indirizzo; }
    catch (e) { /* schema rifiutato: se ne accorge il controllo qui sotto */ }

    // Se dopo un secondo siamo ancora qui e la pagina non e' stata nascosta,
    // il salto non e' avvenuto: si dice cosa fare a mano.
    setTimeout(() => {
      if (document.hidden || Date.now() - partito > 2500) return;
      btn.disabled = true;
      btn.textContent = 'Non ha funzionato — copia l\'indirizzo';
      btn.onclick = () => this._copiaIndirizzo(btn);
      btn.disabled = false;
      this.el.nota.textContent = 'Alcune versioni di iOS non permettono il salto automatico. ' +
        'Copia l\'indirizzo e incollalo in Safari.';
      this.el.nota.classList.remove('nascosto');
    }, 1000);
  }

  _copiaIndirizzo(btn) {
    const url = location.origin + location.pathname;
    const fatto = () => { btn.textContent = 'Indirizzo copiato ✓'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(fatto, () => { btn.textContent = url; });
    } else {
      btn.textContent = url; // ultimo ripiego: almeno resta leggibile e selezionabile
    }
  }

  _elencoPassi(voci) {
    this.el.passi.innerHTML = '';
    voci.forEach((v) => {
      const li = document.createElement('li');
      li.appendChild(document.createTextNode(v.testo));
      if (v.glifo) {
        const g = document.createElement('span');
        g.className = 'glifo';
        g.setAttribute('aria-hidden', 'true');
        g.innerHTML = this._svg(v.glifo);
        li.appendChild(g);
      }
      this.el.passi.appendChild(li);
    });
    this.el.passi.classList.remove('nascosto');
  }

  /* Icone disegnate qui invece che caricate: un file in meno da servire, e
     nessuna richiesta di rete fra l'utente e l'istruzione che deve leggere. */
  _svg(nome, inLinea) {
    const d = {
      condividi: '<path d="M8 1v10M8 1 5 4M8 1l3 3M3 7H2v8h12V7h-1"/>',
      piu: '<path d="M8 3v10M3 8h10"/>',
      spunta: '<path d="M3 8.5 6.5 12 13 4"/>',
      esterno: '<path d="M9 2h5v5M14 2 7 9M12 9v5H2V4h5"/>',
      menu: '<path d="M8 3.2h.01M8 8h.01M8 12.8h.01" stroke-linecap="round" stroke-width="2.4"/>',
    }[nome] || '';
    const misura = inLinea ? 'width="15" height="15" style="stroke:currentColor;fill:none;stroke-width:1.9"' : '';
    return `<svg viewBox="0 0 16 16" ${misura} stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  }

  _nomeApp() {
    return this.getAttribute('nome-app') || document.title || 'l\'app';
  }

  _emetti(nome, dettaglio) {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  /** Trascinamento verso il basso per chiudere: e' il gesto che gli utenti
      provano per primo davanti a un foglio, e se non risponde sembra bloccato. */
  _abilitaTrascinamento() {
    const foglio = this.el.foglio;
    let inizio = null, spostamento = 0;

    const giu = (ev) => {
      // Solo dalla maniglia o dal bordo alto: piu' in basso il trascinamento
      // serve a scorrere il contenuto.
      const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
      if (foglio.scrollTop > 0) return;
      inizio = y; spostamento = 0;
      foglio.style.transition = 'none';
    };
    const muovi = (ev) => {
      if (inizio === null) return;
      const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
      spostamento = Math.max(0, y - inizio);
      foglio.style.transform = `translateY(${spostamento}px)`;
    };
    const su = () => {
      if (inizio === null) return;
      foglio.style.transition = '';
      foglio.style.transform = '';
      inizio = null;
      // Oltre un quarto della sua altezza si considera un congedo, non un
      // ripensamento a meta'.
      if (spostamento > foglio.offsetHeight / 4) this.rinvia(false);
    };

    foglio.addEventListener('touchstart', giu, { passive: true });
    foglio.addEventListener('touchmove', muovi, { passive: true });
    foglio.addEventListener('touchend', su);
    this.el.maniglia.addEventListener('mousedown', giu);
    window.addEventListener('mousemove', muovi);
    window.addEventListener('mouseup', su);
  }
}

customElements.define('pwa-invito', PwaInvito);
export default PwaInvito;
