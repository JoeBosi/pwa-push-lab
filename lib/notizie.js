/*
 * Le notizie: lettura dei feed RSS, deduplica, archivio.
 *
 * "Nuova" vuol dire vista per la prima volta da QUESTO server, non pubDate:
 * le date dei feed sono inaffidabili (fusi orari, ripubblicazioni), mentre il
 * momento in cui l'abbiamo vista noi e' un fatto. Vedi docs/research/feed-rss-notizie.md.
 */
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const FILE = process.env.FILE_NOTIZIE || path.join(__dirname, '..', 'data', 'notizie.json');
const CONSERVA_MS = 7 * 86400e3; // la frequenza piu' lunga e' settimanale: oltre non serve

const FEED = {
  politica: [
    { fonte: 'ANSA', url: 'https://www.ansa.it/sito/notizie/politica/politica_rss.xml' },
    { fonte: 'la Repubblica', url: 'https://www.repubblica.it/rss/politica/rss2.0.xml' },
  ],
  mercati: [
    { fonte: 'Il Sole 24 Ore', url: 'https://www.ilsole24ore.com/rss/finanza.xml' },
    { fonte: 'ANSA', url: 'https://www.ansa.it/sito/notizie/economia/economia_rss.xml' },
  ],
  sport: [
    { fonte: 'ANSA', url: 'https://www.ansa.it/sito/notizie/sport/sport_rss.xml' },
  ],
  // Non esiste un feed "guerre e macroeconomia": si compone da esteri. E' una
  // scelta editoriale, e la pagina la dichiara.
  'guerre-macro': [
    { fonte: 'ANSA', url: 'https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml' },
    { fonte: 'Il Sole 24 Ore', url: 'https://www.ilsole24ore.com/rss/mondo.xml' },
  ],
};

const ETICHETTE = {
  politica: 'Politica',
  mercati: 'Mercati finanziari',
  sport: 'Sport',
  'guerre-macro': 'Guerre e macroeconomia',
};

const parser = new XMLParser({ ignoreAttributes: true, cdataPropName: false, trimValues: true });

function leggiArchivio() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { return { voci: {}, letture: {} }; }
}

function scriviArchivio(a) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(a), { mode: 0o600 });
  fs.renameSync(FILE + '.tmp', FILE);
}

/** Toglie l'HTML che alcuni feed mettono nei titoli: in una notifica sarebbe testo grezzo. */
function pulisci(t) {
  return String(t == null ? '' : (typeof t === 'object' ? (t['#text'] || '') : t))
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

/** Solo http/https: un link "javascript:" nel feed finirebbe dritto in un href. */
function linkSicuro(l) {
  try { const u = new URL(String(l).trim()); return /^https?:$/.test(u.protocol) ? u.href : null; }
  catch (e) { return null; }
}

async function leggiFeed(feed) {
  const r = await fetch(feed.url, {
    headers: { 'User-Agent': 'pwa.example.com/1.0 (sito di prova notifiche push)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const testo = await r.text();
  if (testo.length > 3 * 1024 * 1024) throw new Error('feed troppo grande');
  const xml = parser.parse(testo);
  const item = xml?.rss?.channel?.item || xml?.feed?.entry || [];
  return (Array.isArray(item) ? item : [item]).map((i) => ({
    titolo: pulisci(i.title).slice(0, 220),
    link: linkSicuro(typeof i.link === 'object' ? i.link?.href || i.link?.['#text'] : i.link),
  })).filter((x) => x.titolo && x.link);
}

/**
 * Legge tutti i feed. Ognuno e' isolato: uno che fallisce non ferma gli altri,
 * e l'esito per feed resta registrato perche' "non arrivano notizie di sport"
 * deve poter diventare "il feed ANSA sport risponde 404 da martedi'".
 */
async function aggiorna() {
  const a = leggiArchivio();
  const adesso = new Date().toISOString();
  const esiti = [];

  for (const [categoria, elenco] of Object.entries(FEED)) {
    for (const f of elenco) {
      try {
        const voci = await leggiFeed(f);
        let nuove = 0;
        for (const v of voci) {
          if (a.voci[v.link]) continue;
          a.voci[v.link] = { titolo: v.titolo, link: v.link, categoria, fonte: f.fonte, vista: adesso };
          nuove++;
        }
        a.letture[f.url] = { ok: true, quando: adesso, voci: voci.length, nuove };
        esiti.push({ categoria, fonte: f.fonte, ok: true, nuove });
      } catch (e) {
        a.letture[f.url] = { ok: false, quando: adesso, errore: e.message };
        esiti.push({ categoria, fonte: f.fonte, ok: false, errore: e.message });
      }
    }
  }

  const limite = Date.now() - CONSERVA_MS;
  for (const [k, v] of Object.entries(a.voci)) if (Date.parse(v.vista) < limite) delete a.voci[k];
  scriviArchivio(a);
  return esiti;
}

/** Le notizie di una categoria viste dopo `dal`, dalla piu' recente. */
function nuoveDal(categoria, dal) {
  const t = dal ? Date.parse(dal) : 0;
  return Object.values(leggiArchivio().voci)
    .filter((v) => v.categoria === categoria && Date.parse(v.vista) > t)
    .sort((x, y) => y.vista.localeCompare(x.vista));
}

function ultime(categorie, quante) {
  const set = new Set(categorie);
  return Object.values(leggiArchivio().voci)
    .filter((v) => set.has(v.categoria))
    .sort((x, y) => y.vista.localeCompare(x.vista))
    .slice(0, quante || 40);
}

function statoFeed() {
  const a = leggiArchivio();
  return Object.entries(FEED).flatMap(([categoria, el]) => el.map((f) => ({
    categoria, fonte: f.fonte, ...(a.letture[f.url] || { ok: null }),
  })));
}

module.exports = { FEED, ETICHETTE, aggiorna, nuoveDal, ultime, statoFeed, linkSicuro, pulisci };
