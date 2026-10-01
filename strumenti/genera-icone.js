#!/usr/bin/env node
/*
 * Genera le icone PNG della PWA senza dipendenze.
 *
 * Sul VPS non c'e' ne' ImageMagick ne' PIL, e aggiungere "sharp" per disegnare
 * quattro quadrati sarebbe sproporzionato: qui il PNG viene scritto a mano
 * (zlib + CRC32), che e' una cinquantina di righe e non porta nulla con se'.
 *
 * Le icone NON sono versionate: si rigenerano con `npm run icone`.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DEST = path.join(__dirname, '..', 'public', 'icone');

/* ---------------------------------------------------------------- PNG ---- */

const TAV_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TAV_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function blocco(tipo, dati) {
  const lung = Buffer.alloc(4);
  lung.writeUInt32BE(dati.length, 0);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dati]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo), 0);
  return Buffer.concat([lung, corpo, crc]);
}

/** rgba: Buffer di lato*lato*4 byte. Ritorna il PNG completo. */
function png(lato, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lato, 0);
  ihdr.writeUInt32BE(lato, 4);
  ihdr[8] = 8;   // 8 bit per canale
  ihdr[9] = 6;   // truecolour + alpha
  // 10,11,12 = compressione/filtro/interlacciamento: gli unici valori ammessi.

  // Ogni riga e' preceduta dal byte del filtro. 0 = nessun filtro: l'immagine e'
  // piatta e a tinte larghe, i filtri predittivi non guadagnerebbero nulla.
  const grezzo = Buffer.alloc(lato * (1 + lato * 4));
  for (let y = 0; y < lato; y++) {
    const inizio = y * (1 + lato * 4);
    grezzo[inizio] = 0;
    rgba.copy(grezzo, inizio + 1, y * lato * 4, (y + 1) * lato * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blocco('IHDR', ihdr),
    blocco('IDAT', zlib.deflateSync(grezzo, { level: 9 })),
    blocco('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------- forme ---- */
// Tutte in coordinate normalizzate 0..1, cosi' la stessa figura vale a ogni misura.

const cerchio = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** Rettangolo con gli angoli arrotondati. */
function rettTondo(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return dx * dx + dy * dy <= r * r;
}

/**
 * La campanella. Cupola + fianchi svasati + bordo + battacchio.
 * Il taglio a y=0.315 e' dove la cupola incontra il corpo: sotto quella riga
 * la semilarghezza cresce, sopra e' un semicerchio.
 */
function campana(x, y) {
  if (cerchio(x, y, 0.5, 0.255, 0.048)) return true;              // pomello
  if (cerchio(x, y, 0.5, 0.775, 0.062)) return true;              // battacchio
  if (rettTondo(x, y, 0.16, 0.655, 0.84, 0.715, 0.030)) return true; // bordo

  if (y >= 0.315 && y <= 0.660) {                                  // fianchi
    const t = (y - 0.315) / (0.660 - 0.315);
    const semi = 0.130 + 0.185 * Math.pow(t, 1.7);
    return Math.abs(x - 0.5) <= semi;
  }
  if (y < 0.315) return cerchio(x, y, 0.5, 0.315, 0.130);          // cupola
  return false;
}

/* ------------------------------------------------------------ disegno ---- */

function disegna(lato, { pieno, scalaGlifo = 1 }) {
  const buf = Buffer.alloc(lato * lato * 4);
  const CAMPIONI = 4; // sovracampionamento: senza, i bordi curvi sono a scaletta

  for (let py = 0; py < lato; py++) {
    for (let px = 0; px < lato; px++) {
      let sfondo = 0, glifo = 0;

      for (let sy = 0; sy < CAMPIONI; sy++) {
        for (let sx = 0; sx < CAMPIONI; sx++) {
          const x = (px + (sx + 0.5) / CAMPIONI) / lato;
          const y = (py + (sy + 0.5) / CAMPIONI) / lato;

          // pieno = quadrato intero (icona iOS: il sistema applica gia' la sua
          // maschera, e una trasparenza qui diventerebbe nero). Altrimenti
          // angoli arrotondati come le icone di sistema.
          if (pieno || rettTondo(x, y, 0, 0, 1, 1, 0.225)) sfondo++;

          const gx = 0.5 + (x - 0.5) / scalaGlifo;
          const gy = 0.5 + (y - 0.5) / scalaGlifo;
          if (campana(gx, gy)) glifo++;
        }
      }

      const tot = CAMPIONI * CAMPIONI;
      const aSfondo = sfondo / tot;
      const aGlifo = (glifo / tot) * aSfondo; // il glifo non deborda dallo sfondo

      // Sfumatura verticale: in alto blu profondo, in basso piu' acceso.
      const t = py / (lato - 1);
      const r = Math.round(29 + (37 - 29) * t);
      const g = Math.round(58 + (99 - 58) * t);
      const b = Math.round(138 + (235 - 138) * t);

      const i = (py * lato + px) * 4;
      buf[i] = Math.round(r * (1 - aGlifo) + 255 * aGlifo);
      buf[i + 1] = Math.round(g * (1 - aGlifo) + 255 * aGlifo);
      buf[i + 2] = Math.round(b * (1 - aGlifo) + 255 * aGlifo);
      buf[i + 3] = Math.round(aSfondo * 255);
    }
  }
  return buf;
}

/* --------------------------------------------------------------- main ---- */

fs.mkdirSync(DEST, { recursive: true });

const icone = [
  // Le due misure che il manifest deve dichiarare per essere installabile.
  { file: 'icona-192.png', lato: 192, opzioni: { pieno: false } },
  { file: 'icona-512.png', lato: 512, opzioni: { pieno: false } },
  // "maskable": Android ritaglia a piacere (cerchio, goccia, squircle). Sfondo a
  // tutto quadrato e glifo rimpicciolito, per stare nella zona sicura centrale.
  { file: 'icona-512-maskable.png', lato: 512, opzioni: { pieno: true, scalaGlifo: 0.82 } },
  // iOS ignora il manifest e usa <link rel="apple-touch-icon">: 180px, opaca.
  { file: 'apple-touch-icon.png', lato: 180, opzioni: { pieno: true } },
];

for (const { file, lato, opzioni } of icone) {
  const dati = png(lato, disegna(lato, opzioni));
  fs.writeFileSync(path.join(DEST, file), dati);
  console.log(`${file.padEnd(26)} ${String(lato).padStart(3)}px  ${String(dati.length).padStart(6)} byte`);
}
console.log('\nIcone in public/icone/. Non sono versionate: si rigenerano con `npm run icone`.');
