// ============================================================
// MIROFISH · datos que el navegador no puede pedir (sin CORS)
// Corre en GitHub Actions antes de publicar kippuu.com y escribe:
//   mirofish/datos/macro.json     calendario macro (FOMC, CPI, NFP, PPI)
//   mirofish/datos/mercados.json  S&P 500 y DXY diarios
// Fuentes gratuitas y sin clave:
//   · Reserva Federal: calendario oficial de reuniones FOMC
//   · ForexFactory (feed público de la semana): CPI, NFP, PPI, FOMC
//   · Yahoo Finance (chart API): ^GSPC y DX-Y.NYB
// Si una fuente falla se conserva lo último publicado en kippuu.com,
// con su fecha: el terminal la marca como vieja en vez de inventar.
// Uso: node herramientas/mirofish-datos.mjs [carpetaSalida]
// ============================================================

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SALIDA = process.argv[2] || 'mirofish/datos';
const PUBLICADO = 'https://kippuu.com/mirofish/datos/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function traer(url, tipo = 'json') {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return tipo === 'json' ? res.json() : res.text();
}

async function publicado(nombre) {
  try { return await traer(PUBLICADO + nombre + '?v=' + Date.now()); } catch { return null; }
}

// ---------- hora de Nueva York → UTC ----------
function desfaseNY(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(ms).map((x) => [x.type, x.value]));
  const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return comoUTC - ms; // negativo: NY va detrás de UTC
}
function nyAUtc(anio, mes, dia, hora, minuto) {
  const aprox = Date.UTC(anio, mes, dia, hora, minuto);
  return aprox - desfaseNY(aprox);
}

// ---------- FOMC: calendario oficial de la Fed ----------
const MESES = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

async function fomc() {
  const html = await traer('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', 'text');
  const re = /(\d{4}) FOMC Meetings|fomc-meeting__month[^>]*><strong>([A-Za-z/]+)<\/strong>|fomc-meeting__date[^>]*>([^<]+)</g;
  const out = [];
  let m, anio = null, mes = null;
  while ((m = re.exec(html))) {
    if (m[1]) anio = +m[1];
    else if (m[2]) mes = m[2];
    else if (m[3] && anio && mes) {
      const txt = m[3].trim();
      if (/notation|unscheduled/i.test(txt)) continue;
      const dias = txt.replace(/\*/g, '').match(/\d+/g);
      if (!dias) continue;
      const nombreMes = mes.split('/').at(-1).slice(0, 3).toLowerCase();
      if (!(nombreMes in MESES)) continue;
      // decisión: 14:00 de Nueva York del último día de la reunión
      out.push({
        time: nyAUtc(anio, MESES[nombreMes], +dias.at(-1), 14, 0),
        titulo: 'Decisión de tasas FOMC', tipo: 'FOMC', impacto: 'alto', pais: 'USD', fuente: 'Reserva Federal',
      });
    }
  }
  if (!out.length) throw new Error('el calendario de la Fed no trajo fechas');
  return out;
}

// ---------- ForexFactory: semana en curso ----------
// Solo la decisión de tasas es "FOMC"; las actas y otros datos de alto impacto
// abren la ventana de riesgo pero no bloquean aperturas.
function clasificarFF(t) {
  if (/Minutes/i.test(t)) return { tipo: 'OTRO', titulo: 'Actas del FOMC' };
  if (/FOMC Press Conference/i.test(t)) return null; // misma hora que la decisión
  if (/Federal Funds Rate|FOMC Statement/i.test(t)) return { tipo: 'FOMC', titulo: 'Decisión de tasas FOMC' };
  if (/\bCPI\b/i.test(t)) return { tipo: 'CPI', titulo: 'Inflación CPI (EE. UU.)' };
  if (/Non-Farm Employment/i.test(t)) return { tipo: 'NFP', titulo: 'Empleo no agrícola NFP (EE. UU.)' };
  if (/\bPPI\b/i.test(t)) return { tipo: 'PPI', titulo: 'Precios al productor PPI (EE. UU.)' };
  return { tipo: 'OTRO', titulo: `Dato de EE. UU.: ${t}` };
}

async function forexFactory() {
  const sem = await traer('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
  const vistos = new Set();
  const out = [];
  for (const e of sem) {
    if (e.country !== 'USD' || e.impact !== 'High') continue;
    const cl = clasificarFF(e.title);
    if (!cl) continue;
    const time = Date.parse(e.date);
    const clave = `${cl.titulo}-${time}`;
    if (!Number.isFinite(time) || vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ time, titulo: cl.titulo, tipo: cl.tipo, impacto: 'alto', pais: 'USD', fuente: 'ForexFactory' });
  }
  return out;
}

// ---------- Yahoo: S&P 500 y DXY diarios ----------
async function yahoo(simbolo) {
  const j = await traer(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?interval=1d&range=1y`);
  const r = j?.chart?.result?.[0];
  const t = r?.timestamp, c = r?.indicators?.quote?.[0]?.close;
  if (!t?.length || !c?.length) throw new Error(`Yahoo sin datos para ${simbolo}`);
  const serie = { t: [], c: [] };
  t.forEach((ts, i) => { if (c[i] != null) { serie.t.push(ts * 1000); serie.c.push(+c[i].toFixed(4)); } });
  return serie;
}

async function main() {
  await mkdir(SALIDA, { recursive: true });
  const ahora = Date.now();
  const previoMacro = await publicado('macro.json');
  const previoMercados = await publicado('mercados.json');

  // --- macro ---
  const avisos = [];
  let fed = [], ff = [];
  try { fed = await fomc(); } catch (e) { avisos.push(`Fed: ${e.message}`); }
  try { ff = await forexFactory(); } catch (e) { avisos.push(`ForexFactory: ${e.message}`); }
  // se conservan los eventos publicados antes (la semana de ForexFactory solo trae 7 días)
  const anteriores = (previoMacro?.eventos ?? []).filter((e) => e.fuente !== 'Reserva Federal' || !fed.length);
  const todos = [...fed, ...ff, ...anteriores];
  const unicos = new Map();
  for (const e of todos) {
    // FOMC de ambas fuentes a la misma hora: queda el oficial
    const clave = `${e.tipo === 'OTRO' ? e.titulo : e.tipo}-${Math.round(e.time / 3_600_000)}`;
    if (!unicos.has(clave) || e.fuente === 'Reserva Federal') unicos.set(clave, e);
  }
  const eventos = [...unicos.values()]
    .filter((e) => e.time > ahora - 400 * 86_400_000)
    .sort((a, b) => a.time - b.time);
  const macro = {
    generado: ahora,
    fuentes: ['Reserva Federal (FOMC)', 'ForexFactory (semana en curso)'],
    nota: 'CPI, NFP y PPI solo se conocen con una semana de anticipación (ForexFactory). El sitio de BLS bloquea consultas automáticas. Desbloqueos de tokens: BTC y ETH no tienen calendario de desbloqueos y no hay fuente gratuita sin clave para SOL; la lista se completa a mano.',
    avisos,
    eventos,
    desbloqueos: previoMacro?.desbloqueos ?? [],
  };
  await writeFile(join(SALIDA, 'macro.json'), JSON.stringify(macro));

  // --- mercados ---
  const mercados = { generado: ahora, fuente: 'Yahoo Finance (cierres diarios)', avisos: [], spx: null, dxy: null };
  for (const [clave, sim] of [['spx', '^GSPC'], ['dxy', 'DX-Y.NYB']]) {
    try {
      mercados[clave] = await yahoo(sim);
    } catch (e) {
      mercados.avisos.push(`${sim}: ${e.message}`);
      mercados[clave] = previoMercados?.[clave] ?? null;
    }
  }
  await writeFile(join(SALIDA, 'mercados.json'), JSON.stringify(mercados));

  const prox = eventos.filter((e) => e.time > ahora).slice(0, 3).map((e) => `${e.tipo} ${new Date(e.time).toISOString()}`);
  console.log(`macro: ${eventos.length} eventos (próximos: ${prox.join(' · ') || 'ninguno'})`);
  console.log(`mercados: SPX ${mercados.spx?.c.length ?? 0} días, DXY ${mercados.dxy?.c.length ?? 0} días`);
  if (avisos.length || mercados.avisos.length) {
    console.log('avisos:', [...avisos, ...mercados.avisos].join(' | '));
    process.exitCode = 1;
  }
}

main();
