// Favicon vectorial: anillo de seis hexágonos con los colores del logo (rojo, azul, verde azulado, verde, amarillo, naranja).
import { createRequire } from 'node:module'; import fs from 'node:fs';
const sharp = createRequire(import.meta.url)('sharp');
const r = 42, D = r * Math.sqrt(3) + 5;
const C = 128;
const hex = (cx, cy, color) => {
  const pts = [];
  for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i + 30); pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`); }
  return `<polygon points="${pts.join(' ')}" fill="${color}"/>`;
};
// ángulos: arriba-izq, arriba-der, derecha, abajo-der, abajo-izq, izquierda
const colores = [[-120, '#E8312A'], [-60, '#2F4DA8'], [0, '#2C8C6E'], [60, '#4FAE3C'], [120, '#F2C21F'], [180, '#F08A24']];
const cuerpo = colores.map(([ang, col]) => { const a = Math.PI / 180 * ang; return hex(C + D * Math.cos(a), C + D * Math.sin(a), col); }).join('');
const svg = (fondo) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${fondo}${cuerpo}</svg>`;
fs.writeFileSync('favicon.svg', svg(''));
const png = (n, fondo = '') => sharp(Buffer.from(svg(fondo))).resize(n, n).png().toBuffer();
fs.writeFileSync('favicon-32.png', await png(32));
fs.writeFileSync('favicon-192.png', await png(192));
fs.writeFileSync('favicon-512.png', await png(512));
fs.writeFileSync('apple-touch-icon.png', await png(180, '<rect width="256" height="256" rx="48" fill="#ffffff"/>'));
const p32 = await png(32); const h = Buffer.alloc(22);
h.writeUInt16LE(0, 0); h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4); h[6] = 32; h[7] = 32; h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12); h.writeUInt32LE(p32.length, 14); h.writeUInt32LE(22, 18);
fs.writeFileSync('favicon.ico', Buffer.concat([h, p32]));
// vista previa: cómo se ve a 16, 32 y 64 sobre fondo oscuro y claro
const prev = sharp({ create: { width: 400, height: 120, channels: 4, background: '#2b2b2b' } });
const comp = [];
for (const [i, n] of [16, 32, 64].entries()) { comp.push({ input: await png(n), left: 20 + i * 110, top: 60 - n / 2 }); comp.push({ input: await png(n, '<rect width="256" height="256" fill="#fff"/>'), left: 20 + i * 110 + 50, top: 60 - n / 2 }); }
fs.writeFileSync('sistema/preview-favicon.png', await prev.composite(comp).png().toBuffer());
console.log('ok');
