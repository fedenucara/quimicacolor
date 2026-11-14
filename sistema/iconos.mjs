// Genera favicons, apple-touch-icon y la imagen para redes (og) a partir de los logos.
import { createRequire } from 'node:module'; import fs from 'node:fs';
const sharp = createRequire(import.meta.url)('sharp');
const marca = 'logo-marca.webp', logo = 'logo.webp';
const sq = async (n) => sharp(marca).resize(n, n, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
fs.writeFileSync('favicon-32.png', await sq(32));
fs.writeFileSync('favicon-192.png', await sq(192));
fs.writeFileSync('favicon-512.png', await sq(512));
fs.writeFileSync('apple-touch-icon.png', await sharp(marca).resize(150, 150, { fit: 'contain', background: '#ffffff' }).extend({ top: 15, bottom: 15, left: 15, right: 15, background: '#ffffff' }).png().toBuffer());
// .ico con un PNG de 32 adentro (formato válido para Google y los navegadores)
const png = await sq(32); const h = Buffer.alloc(6 + 16);
h.writeUInt16LE(0, 0); h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4);
h[6] = 32; h[7] = 32; h[8] = 0; h[9] = 0; h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12); h.writeUInt32LE(png.length, 14); h.writeUInt32LE(22, 18);
fs.writeFileSync('favicon.ico', Buffer.concat([h, png]));
// og 1200x630: logo completo centrado sobre blanco
const l = await sharp(logo).resize({ width: 900, height: 480, fit: 'inside' }).png().toBuffer();
fs.writeFileSync('og.png', await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#ffffff' } }).composite([{ input: l, gravity: 'centre' }]).png().toBuffer());
console.log('ok', fs.statSync('og.png').size, fs.statSync('favicon.ico').size);
