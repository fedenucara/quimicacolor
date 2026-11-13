// Cotización de envío con Andreani (canal PyME), igual que en ruo-web.
// Función serverless de Vercel: POST /api/cotizar { cp, items:[{kg, cantidad, tipo}], valor }
//   tipo: "polvo" (bolsa/caja/bolsón), "dispersion" (potes y baldes), "liquido" (botella/bidón/balde)
// Devuelve { opciones:[{ id, tipo:"D"|"S", nombre, precio }], bultos:[...] }.
// Variables en Vercel: ANDREANI_CREDENCIAL (Credential ID de la cuenta PyME), ANDREANI_CP_ORIGEN (1770), ANDREANI_SUCURSAL_ORIGEN (opcional).

const BASE_PYME = "https://woocommerce-api-acom.andreani.com";
const CP_ORIGEN_DEFECTO = "1770";

// Envases de Química Color: medidas en cm (largo × ancho × alto) y peso bruto en gramos.
// Son estimaciones razonables; se ajustan cuando Federico mida los envases reales.
const ENVASES = {
  polvo:      { 1: [25, 18, 8, 1100],  5: [30, 25, 20, 5300],  25: [60, 40, 20, 25500] },
  dispersion: { 1: [12, 12, 15, 1200], 4: [22, 22, 25, 4400], 5: [25, 25, 28, 5400], 10: [30, 30, 35, 10800], 20: [35, 35, 40, 21000] },
  liquido:    { 1: [10, 10, 26, 1100], 5: [20, 14, 32, 5300], 20: [35, 35, 40, 21000] },
};

let sesion = null; // { token, vence }

async function login(credencial) {
  if (sesion && sesion.vence > Date.now()) return sesion.token;
  const r = await fetch(`${BASE_PYME}/api/v1/Login`, {
    method: "POST",
    headers: { authorization: credencial, "content-type": "application/json", accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (r.status === 401 || r.status === 403) throw new Error("Andreani no reconoce la credencial.");
  if (!r.ok) throw new Error(`Andreani no dio sesión (${r.status}).`);
  const j = await r.json();
  const token = j?.response?.accessToken;
  if (!token) throw new Error("Andreani no devolvió el token.");
  sesion = { token, vence: Date.now() + 12 * 3600 * 1000 };
  return token;
}

function normalizarModo(nombre) {
  const n = String(nombre || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/-/g, " ");
  if (n === "a domicilio") return "estandar";
  if (n === "a sucursal") return "sucursal";
  return n;
}

function bultosDe(items) {
  const bultos = [];
  const faltan = [];
  for (const it of items) {
    const kg = Number(it.kg), cantidad = Math.max(1, Math.trunc(Number(it.cantidad) || 1));
    const tipo = ENVASES[it.tipo] ? it.tipo : "polvo";
    const e = ENVASES[tipo][kg];
    if (!e) { faltan.push(`${kg} kg (${tipo})`); continue; }
    bultos.push({ kg, tipo, cantidad, largo: e[0], ancho: e[1], alto: e[2], gramos: e[3] });
  }
  return { bultos, faltan };
}

async function cotizar({ cp, items, valor }) {
  const credencial = (process.env.ANDREANI_CREDENCIAL || "").trim();
  if (!credencial) throw new Error("Falta ANDREANI_CREDENCIAL en Vercel.");
  const cpOrigen = (process.env.ANDREANI_CP_ORIGEN || "").replace(/\D/g, "").slice(0, 4) || CP_ORIGEN_DEFECTO;
  const sucursalOrigen = (process.env.ANDREANI_SUCURSAL_ORIGEN || "").trim();
  const destino = String(cp || "").replace(/\D/g, "").slice(0, 4);
  if (destino.length !== 4) throw new Error("El código postal tiene que tener 4 números.");
  const { bultos, faltan } = bultosDe(Array.isArray(items) ? items : []);
  if (bultos.length === 0) throw new Error(faltan.length ? `Sin medidas para: ${faltan.join(", ")}.` : "No hay nada para cotizar.");
  const unidades = bultos.reduce((s, b) => s + b.cantidad, 0) || 1;
  const precioUnitario = Math.max(1, Math.round(Math.max(0, Number(valor) || 0) / unidades));

  const pedir = async (token) => fetch(`${BASE_PYME}/api/v1/Pyme/rates`, {
    method: "POST",
    headers: { "x-auth-token": token, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      postal_code_origin: cpOrigen,
      postal_code_destination: destino,
      products: bultos.map((b) => ({ quantity: b.cantidad, price: precioUnitario, dimensions: { width: b.ancho, height: b.alto, depth: b.largo, grams: b.gramos } })),
      force_bigger: false,
      ...(sucursalOrigen ? { branch_code_origin: sucursalOrigen } : {}),
    }),
    signal: AbortSignal.timeout(25000),
  });
  let r = await pedir(await login(credencial));
  if (r.status === 401) { sesion = null; r = await pedir(await login(credencial)); }
  const texto = await r.text().catch(() => "");
  if (!r.ok) {
    let detalle = texto.slice(0, 300);
    try { const j = JSON.parse(texto); detalle = [j.message ?? j.error ?? j.title, ...(j.errors && typeof j.errors === "object" ? Object.values(j.errors).flat().map(String) : [])].filter(Boolean).join(" · ") || detalle; } catch {}
    throw new Error(detalle || `Andreani respondió ${r.status}.`);
  }
  const j = texto ? JSON.parse(texto) : {};
  const rates = j?.response?.rates ?? [];
  const opciones = [], vistos = new Set();
  for (const rate of rates) {
    const code = String(rate.code ?? "").trim(), modo = normalizarModo(code), total = Number(rate.total);
    if (!code || vistos.has(modo) || modo === "bigger" || !(total > 0)) continue;
    vistos.add(modo);
    const tipo = modo.includes("sucursal") ? "S" : "D";
    opciones.push({ id: `AD-${tipo}-${modo.replace(/\s+/g, "_")}`, tipo, producto: code, nombre: tipo === "S" ? "Andreani a sucursal" : modo === "estandar" ? "Andreani a domicilio" : `Andreani ${code} (a domicilio)`, precio: Math.round(total) });
  }
  if (opciones.length === 0) throw new Error("Andreani no cotizó este envío (puede ser por peso o tamaño).");
  opciones.sort((a, b) => a.precio - b.precio);
  return { opciones, bultos, faltan, cpOrigen, cpDestino: destino };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    let entrada;
    if (req.method === "POST") {
      entrada = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    } else {
      // GET para probar a mano: /api/cotizar?cp=5000&kg=5&tipo=polvo&cantidad=2&valor=100000
      const q = req.query || {};
      entrada = { cp: q.cp, valor: q.valor, items: [{ kg: q.kg || 1, tipo: q.tipo || "polvo", cantidad: q.cantidad || 1 }] };
    }
    const salida = await cotizar(entrada);
    res.status(200).json({ ok: true, ...salida });
  } catch (e) {
    res.status(200).json({ ok: false, error: e?.message || "No se pudo cotizar." });
  }
}
