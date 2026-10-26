// Importa las "fichas simples" (imagen explicativa) como segunda imagen de cada producto.
//   node sistema/importar-fichas-simples.mjs "<carpeta>" [--aplicar]
// Lee <carpeta>/indice.csv (sku, producto, archivo, estado); usa solo estado "lista" y nunca "_A VALIDAR".
// Convierte a WebP 1200×1200 q85 en imgs/fichas-simples/<sku>.webp y carga "imagenes":
//   [imagen principal, ficha del sku, ficha del skuVsl si la hay, ...otras imágenes que ya hubiera (usos)].
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('C:/Users/feden/AppData/Local/Temp/claude/c--Users-feden-ruo-web/d5a0242e-b611-4841-9d85-f3d6945d61ae/scratchpad/herr/node_modules/sharp');

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const [carpeta, modo] = process.argv.slice(2);
if (!carpeta) { console.error('Uso: node sistema/importar-fichas-simples.mjs "<carpeta>" [--aplicar]'); process.exit(1); }
const aplicar = modo === '--aplicar';

// Nombres con acentos rotos (cp437) y ":" como U+F03A, como en la carpeta de fichas técnicas
const CP437={'¡':0xAD,'│':0xB3,'ü':0x81,'ô':0x93,'í':0xA1,'®':0xA9,'║':0xBA,'▒':0xB1,'╣':0xB9,'¿':0xA8,'¬':0xAA,'▓':0xB2,'╝':0xBC,'ñ':0xA4,'á':0xA0,'ó':0xA2,'ú':0xA3,'é':0x82,'ö':0x94,'ê':0x88};
const desMojibake=s=>s.replace(/├(.)/g,(m,c)=>CP437[c]!=null?Buffer.from([0xC3,CP437[c]]).toString('utf8'):m);
const norm=s=>desMojibake(s).replace(/\uF03A/g,':').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

// catálogo
const src = fs.readFileSync(path.join(root, 'productos-data.js'), 'utf8');
const ctx = {}; vm.createContext(ctx); vm.runInContext(src.replace('const PRODUCTOS_DATA', 'globalThis.P'), ctx);
const P = ctx.P;
const porSku = new Map(), porSkuVsl = new Map();
for (const p of P) { if (p.sku) porSku.set(p.sku.toUpperCase(), p); if (p.skuVsl) porSkuVsl.set(p.skuVsl.toUpperCase(), p); }

// archivos disponibles (sin _A VALIDAR), indexados por nombre normalizado
function walk(d){ return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]); }
const archivos = new Map();
for (const f of walk(carpeta).filter(f => /\.(png|jpe?g|webp)$/i.test(f) && !f.includes('_A VALIDAR'))) archivos.set(norm(path.basename(f)), f);

// índice
const csv = fs.readFileSync(path.join(carpeta, 'indice.csv'), 'utf8').replace(/^\uFEFF/, '');
const filas = csv.trim().split(/\r?\n/).slice(1).map(l => {
  const c = l.split(','); if (c.length < 4) return null;
  const estado = c[c.length - 1].trim(), archivo = c[c.length - 2].trim(), sku = c[0].trim(), producto = c.slice(1, c.length - 2).join(',').trim();
  return { sku, producto, archivo, estado };
}).filter(Boolean);

const porProducto = new Map();   // id -> { sku: ruta, vsl: ruta }
const sinProducto = [], sinArchivo = [], publicadas = [];
let saltadas = 0;
for (const r of filas) {
  if (!r.estado.toLowerCase().startsWith("lista")) { saltadas++; continue; }
  if (/_A VALIDAR/i.test(r.archivo)) { saltadas++; continue; }
  const sku = r.sku.toUpperCase();
  const p = porSku.get(sku), pv = porSkuVsl.get(sku);
  if (!p && !pv) { sinProducto.push(`${r.sku} → ${r.producto}`); continue; }
  const origen = archivos.get(norm(path.basename(r.archivo.replace(/\\/g, '/'))));
  if (!origen) { sinArchivo.push(`${r.sku} → ${r.producto} (${r.archivo})`); continue; }
  const prod = p || pv, esVsl = !p;
  const destino = `imgs/fichas-simples/${sku.toLowerCase()}.webp`;
  if (aplicar) {
    fs.mkdirSync(path.join(root, 'imgs/fichas-simples'), { recursive: true });
    const buf = await sharp(origen).flatten({ background: '#ffffff' }).resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    fs.writeFileSync(path.join(root, destino), buf);
  }
  const e = porProducto.get(prod.id) || {}; e[esVsl ? 'vsl' : 'sku'] = destino; porProducto.set(prod.id, e);
  publicadas.push(`${r.sku} → ${prod.nombre}${esVsl ? ' (vaselina, 3ª imagen)' : ''}`);
}

if (aplicar) {
  const lineas = src.split('\n').map(l => {
    const m = l.match(/^\s*\{ id:"([^"]+)"/); if (!m) return l;
    const e = porProducto.get(m[1]); if (!e) return l;
    const p = P.find(x => x.id === m[1]);
    const otras = (p.imagenes || []).filter(x => x !== p.imagen && !x.startsWith('imgs/fichas-simples/'));
    const imagenes = [p.imagen, e.sku, e.vsl, ...otras].filter(Boolean);
    l = l.replace(/, imagenes:\[[^\]]*\]/, '');
    return l.replace(/imagen:("[^"]*"|null)/, `imagen:$1, imagenes:${JSON.stringify(imagenes)}`);
  });
  fs.writeFileSync(path.join(root, 'productos-data.js'), lineas.join('\n'));
}

const sinFicha = P.filter(p => !porProducto.has(p.id)).map(p => `${p.sku || '(sin sku)'} → ${p.nombre}`);
console.log(`${aplicar ? 'AGREGADAS' : 'SE AGREGARÍAN'}: ${publicadas.length} fichas en ${porProducto.size} productos (filas salteadas por estado/_A VALIDAR: ${saltadas})`);
publicadas.forEach(x => console.log('  ' + x));
console.log(`\nFILAS DEL ÍNDICE SIN PRODUCTO EN LA WEB (${sinProducto.length}):`); sinProducto.forEach(x => console.log('  ' + x));
console.log(`\nFILAS CUYO ARCHIVO NO SE ENCONTRÓ (${sinArchivo.length}):`); sinArchivo.forEach(x => console.log('  ' + x));
console.log(`\nPRODUCTOS DE LA WEB SIN FICHA SIMPLE (${sinFicha.length}):`); sinFicha.forEach(x => console.log('  ' + x));
