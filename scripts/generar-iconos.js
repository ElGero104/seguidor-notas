#!/usr/bin/env node
/**
 * Genera los iconos PNG de la PWA en docs/icons/ (192, 512 y maskable-512).
 * Node puro sin dependencias: rasteriza el diseño con supersampling y
 * escribe PNG (RGBA) con zlib. La salida es 100% determinista: si el diseño
 * no cambia, los bytes tampoco, así el CI no genera commits basura.
 *
 * Diseño: degradado indigo → violeta con esquinas redondeadas y cuatro
 * barras blancas ascendentes (el "seguidor" de notas).
 */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// ---------- Utilidades PNG ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tipoBuf = Buffer.from(tipo, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tipoBuf, data])), 0);
  return Buffer.concat([len, tipoBuf, data, crcBuf]);
}

function pngRGBA(w, h, pix) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // profundidad de bits
  ihdr[9] = 6;  // tipo de color: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filtro None
    pix.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- Diseño ----------
function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
const C1 = hex("#4f46e5"); // indigo
const C2 = hex("#8b5cf6");  // violeta
const lerp = (a, b, t) => a + (b - a) * t;

/** ¿El punto (x,y) está dentro del rectángulo con esquinas redondeadas? */
function dentroRectRedondo(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(x0 + r - x, x - (x1 - r), 0);
  const dy = Math.max(y0 + r - y, y - (y1 - r), 0);
  return dx * dx + dy * dy <= r * r;
}

function dibujar(size, maskable) {
  const pix = Buffer.alloc(size * size * 4);
  const r = maskable ? 0.01 : size * 0.225;       // maskable: cuadrado completo
  const m = maskable ? size * 0.28 : size * 0.20; // margen interior
  const W = size - 2 * m;
  const H = size - 2 * m;
  const bw = W / 6.4;                             // ancho de barra
  const gap = bw * 0.8;
  const hs = [0.45, 0.62, 0.78, 0.95];            // alturas ascendentes
  const rr = bw * 0.45;                           // radio superior de las barras
  const ss = 2;                                   // supersampling 2x2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0, b = 0; // muestras dentro del fondo / dentro de una barra
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          if (dentroRectRedondo(px, py, 0, 0, size, size, r)) {
            a++;
            for (let i = 0; i < 4; i++) {
              const bx0 = m + i * (bw + gap);
              const by1 = size - m;
              const by0 = by1 - H * hs[i];
              if (dentroRectRedondo(px, py, bx0, by0, bx0 + bw, by1, rr)) { b++; break; }
            }
          }
        }
      }
      if (a === 0) continue; // fuera del icono: transparente
      const t = (x + y) / (2 * size);
      const g = [lerp(C1[0], C2[0], t), lerp(C1[1], C2[1], t), lerp(C1[2], C2[2], t)];
      const o = (y * size + x) * 4;
      pix[o]     = Math.round((b * 255 + (a - b) * g[0]) / a);
      pix[o + 1] = Math.round((b * 255 + (a - b) * g[1]) / a);
      pix[o + 2] = Math.round((b * 255 + (a - b) * g[2]) / a);
      pix[o + 3] = Math.round((a / 4) * 255);
    }
  }
  return pix;
}

function main() {
  const dir = path.join("docs", "icons");
  fs.mkdirSync(dir, { recursive: true });
  const archivos = [
    ["icon-192.png", 192, false],
    ["icon-512.png", 512, false],
    ["maskable-512.png", 512, true],
  ];
  for (const [nombre, size, maskable] of archivos) {
    const p = path.join(dir, nombre);
    fs.writeFileSync(p, pngRGBA(size, size, dibujar(size, maskable)));
    console.log("OK " + p + " (" + size + "x" + size + (maskable ? ", maskable" : "") + ")");
  }
}
main();
