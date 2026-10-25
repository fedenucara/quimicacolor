// Importa imágenes de producto nuevas al catálogo.
//   node sistema/importar-imagenes.mjs "<carpeta>" [--aplicar]
// Sin --aplicar solo informa (no toca nada).
// Cada archivo se llama "SKU - Producto.png|jpg|webp". Se busca el producto con ese sku (o skuVsl).
// Convierte a WebP (calidad 85, máx 1200×1200, fondo blanco), guarda en imgs/<id>.webp,
// mueve la imagen anterior a imgs/_anteriores/ y actualiza solo el campo "imagen".
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('C:/Users/feden/AppData/Local/Temp/claude/c--Users-feden-ruo-web/d5a0242e-b611-4841-9d85-f3d6945d61ae/scratchpad/herr/node_modules/sharp');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const [carpeta, modo] = process.argv.slice(2);
if (!carpeta) { console.error('Uso: node sistema/importar-imagenes.mjs "<carpeta>" [--aplicar]'); process.exit(1); }
const aplicar = modo === '--aplicar';

const src = fs.readFileSync(path.join(root, 'productos-data.js'), 'utf8');
const ctx = {}; vm.createContext(ctx); vm.runInContext(src.replace('const PRODUCTOS_DATA', 'globalThis.P'), ctx);
const P = ctx.P;
const porSku = new Map(), porSkuVsl = new Map();
for (const p of P) { if (p.sku) porSku.set(p.sku.toUpperCase(), p); if (p.skuVsl) porSkuVsl.set(p.skuVsl.toUpperCase(), p); }

const archivos = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).filter(f => /\.(png|jpe?g|webp)$/i.test(f)) : null;
if (!archivos) { console.log('La carpeta no existe: ' + carpeta); process.exit(1); }
if (archivos.length === 0) { console.log('La carpeta no tiene imágenes: ' + carpeta); }

const publicadas = [], vsl = [], sinProducto = [];
const nuevaRuta = {};
for (const f of archivos) {
  const sku = f.split(' - ')[0].trim().toUpperCase();
  const p = porSku.get(sku);
  const pv = porSkuVsl.get(sku);
  if (!p && !pv) { sinProducto.push(f); continue; }
  const prod = p || pv;
  const esVsl = !p && !!pv;
  const destino = `imgs/${prod.id}${esVsl ? '-vsl' : ''}.webp`;
  if (aplicar) {
    const buf = await sharp(path.join(carpeta, f)).flatten({ background: '#ffffff' })
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    // La imagen anterior se guarda en imgs/_anteriores una sola vez: si ya hay un respaldo
    // de ese producto, no se pisa (así re-correr el importador no borra la foto original).
    const actual = !esVsl && prod.imagen && fs.existsSync(path.join(root, prod.imagen)) ? prod.imagen
                 : !esVsl && fs.existsSync(path.join(root, destino)) ? destino : null;
    if (actual) {
      const respaldo = path.join(root, 'imgs/_anteriores', path.basename(actual));
      fs.mkdirSync(path.join(root, 'imgs/_anteriores'), { recursive: true });
      if (!fs.existsSync(respaldo)) fs.copyFileSync(path.join(root, actual), respaldo);
      if (actual !== destino) fs.unlinkSync(path.join(root, actual));
    }
    fs.writeFileSync(path.join(root, destino), buf);
    if (!esVsl) nuevaRuta[prod.id] = destino;
  }
  (esVsl ? vsl : publicadas).push(`${sku} → ${prod.nombre} (${prod.id})${esVsl ? ' [vaselina: guardada como ' + destino + ', no reemplaza la imagen principal]' : ''}`);
}

if (aplicar && Object.keys(nuevaRuta).length) {
  const lineas = src.split('\n').map(l => {
    const m = l.match(/^\s*\{ id:"([^"]+)"/); if (!m || !nuevaRuta[m[1]]) return l;
    return l.replace(/imagen:("[^"]*"|null)/, `imagen:"${nuevaRuta[m[1]]}"`);
  });
  fs.writeFileSync(path.join(root, 'productos-data.js'), lineas.join('\n'));
}

const sinImagen = P.filter(p => !(nuevaRuta[p.id] || p.imagen)).map(p => `${p.sku || '(sin sku)'} → ${p.nombre}`);
console.log((aplicar ? 'PUBLICADAS' : 'SE PUBLICARÍAN') + ` (${publicadas.length}):`); publicadas.forEach(x => console.log('  ' + x));
if (vsl.length) { console.log(`\nVARIANTE VASELINA (${vsl.length}):`); vsl.forEach(x => console.log('  ' + x)); }
console.log(`\nSIN PRODUCTO (${sinProducto.length}):`); sinProducto.forEach(x => console.log('  ' + x));
console.log(`\nPRODUCTOS QUE SIGUEN SIN IMAGEN (${sinImagen.length}):`); sinImagen.forEach(x => console.log('  ' + x));
