// ============================================================
// MIROFISH · datos que el navegador no puede pedir (sin CORS)
// Corre en GitHub Actions antes de publicar kippuu.com y escribe:
//   mirofish/datos/macro.json     calendario macro (FOMC, CPI, NFP, PPI)
//   mirofish/datos/mercados.json  S&P 500 y DXY diarios
//   mirofish/datos/rr25.json      historial horario del risk reversal 25Δ (S5)
//   mirofish/datos/netflows.json  netflows diarios de BTC, ETH y SOL (S6)
// Fuentes gratuitas y sin clave:
//   · Reserva Federal: calendario oficial de reuniones FOMC
//   · ForexFactory (feed público de la semana): CPI, NFP, PPI, FOMC
//   · Yahoo Finance (chart API): ^GSPC y DX-Y.NYB
//   · Deribit (libro público de opciones): RR25 de 7 y 30 días
//   · DeFiLlama (saldos diarios de exchanges): netflows, una vez al día
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

// ---------- S5: risk reversal 25Δ desde el libro de Deribit ----------
// Misma cuenta que src/lib/modulos/s5Skew.ts de MIROFISH: delta Black-76 con
// la IV de marca, IV interpolada en ±25Δ y RR = IV(put) − IV(call).
const MESES_D = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
function normalCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
function ivEnDelta(p, obj) {
  p.sort((a, b) => a.d - b.d);
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    if ((a.d - obj) * (b.d - obj) <= 0 && a.d !== b.d) return a.iv + ((obj - a.d) / (b.d - a.d)) * (b.iv - a.iv);
  }
  return null;
}
async function rrMoneda(moneda, ahora) {
  const j = await traer(`https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${moneda}&kind=option`);
  const porVence = new Map();
  for (const r of j.result) {
    const m = r.instrument_name.match(/^[A-Z_]+-(\d{1,2})([A-Z]{3})(\d{2})-([\d.]+)-([CP])$/);
    if (!m || !r.mark_iv || !r.underlying_price) continue;
    const vence = Date.UTC(2000 + +m[3], MESES_D[m[2]], +m[1], 8);
    if (vence <= ahora + 12 * 3_600_000) continue;
    const T = (vence - ahora) / (365 * 86_400_000), s = r.mark_iv / 100, F = r.underlying_price, K = +m[4];
    const d1 = (Math.log(F / K) + 0.5 * s * s * T) / (s * Math.sqrt(T));
    const lista = porVence.get(vence) ?? { c: [], p: [] };
    if (m[5] === 'C') lista.c.push({ d: normalCdf(d1), iv: r.mark_iv }); else lista.p.push({ d: normalCdf(d1) - 1, iv: r.mark_iv });
    porVence.set(vence, lista);
  }
  const v = [];
  for (const [vence, l] of porVence) {
    const ic = ivEnDelta(l.c, 0.25), ip = ivEnDelta(l.p, -0.25);
    if (ic !== null && ip !== null) v.push({ dias: (vence - ahora) / 86_400_000, rr: ip - ic });
  }
  v.sort((a, b) => a.dias - b.dias);
  const tenor = (dias) => {
    if (!v.length) return null;
    if (dias <= v[0].dias) return v[0].rr;
    for (let i = 1; i < v.length; i++) if (v[i].dias >= dias) return v[i - 1].rr + ((dias - v[i - 1].dias) / (v[i].dias - v[i - 1].dias)) * (v[i].rr - v[i - 1].rr);
    return v[v.length - 1].rr;
  };
  return { r7: tenor(7), r30: tenor(30) };
}

// ---------- S6: netflows desde los saldos diarios de DeFiLlama ----------
// Mismos exchanges que s6Netflows.exchanges en config.json de MIROFISH.
const EXCHANGES_NETFLOW = ['binance-cex', 'okx', 'bybit', 'bitfinex', 'gate', 'bitget', 'gemini', 'htx', 'kucoin', 'crypto-com'];
const ACTIVOS_NETFLOW = ['BTC', 'ETH', 'SOL'];
async function netflows(ahora) {
  const porActivo = Object.fromEntries(ACTIVOS_NETFLOW.map((a) => [a, new Map()]));
  const avisos = [];
  for (const slug of EXCHANGES_NETFLOW) {
    try {
      const res = await fetch(`https://api.llama.fi/protocol/${slug}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      // solo saldos de cierre de día (00:00 UTC) de los últimos 400 días
      const dias = (j.tokens ?? []).filter((x) => x.date % 86_400 === 0 && x.date * 1000 > ahora - 400 * 86_400_000);
      for (let i = 1; i < dias.length; i++) {
        if (dias[i].date - dias[i - 1].date !== 86_400) continue;
        for (const a of ACTIVOS_NETFLOW) {
          const antes = dias[i - 1].tokens?.[a], ahoraSaldo = dias[i].tokens?.[a];
          if (!(antes > 0) || !(ahoraSaldo >= 0)) continue;
          const d = ahoraSaldo - antes;
          // un salto de más del 30 % del saldo en un día es un cambio de etiquetado de billeteras, no un flujo
          if (Math.abs(d) > 0.3 * antes) continue;
          const t = dias[i].date * 1000;
          const dia = porActivo[a].get(t) ?? { t, neto: 0, porExchange: {} };
          dia.neto += d;
          dia.porExchange[slug] = +d.toFixed(4);
          porActivo[a].set(t, dia);
        }
      }
    } catch (e) {
      avisos.push(`${slug}: ${e.message}`);
    }
  }
  const out = {};
  for (const a of ACTIVOS_NETFLOW) out[a] = [...porActivo[a].values()].sort((x, y) => x.t - y.t).map((d) => ({ ...d, neto: +d.neto.toFixed(4) }));
  return { out, avisos };
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

  // --- S5: una muestra de RR25 por corrida (cada hora), historial de 100 días ---
  const previoRR = await publicado('rr25.json');
  const muestras = (previoRR?.muestras ?? []).filter((m) => m.t > ahora - 100 * 86_400_000);
  const avisosRR = [];
  try {
    const [b, e] = await Promise.all([rrMoneda('BTC', ahora), rrMoneda('ETH', ahora)]);
    const r = (v) => (v === null ? null : +v.toFixed(3));
    // no dos muestras en la misma media hora
    if (!muestras.some((m) => Math.abs(m.t - ahora) < 30 * 60_000)) muestras.push({ t: ahora, btc7: r(b.r7), btc30: r(b.r30), eth7: r(e.r7), eth30: r(e.r30) });
  } catch (e) {
    avisosRR.push(`Deribit: ${e.message}`);
  }
  await writeFile(join(SALIDA, 'rr25.json'), JSON.stringify({ generado: ahora, fuente: 'Deribit (libro público de opciones)', avisos: avisosRR, muestras }));

  // --- S6: netflows, una vez al día (la descarga de DeFiLlama pesa ~150 MB) ---
  const previoNF = await publicado('netflows.json');
  let nf = previoNF;
  if (!previoNF || ahora - previoNF.generado > 20 * 3_600_000 || process.env.FORZAR_NETFLOWS) {
    const r = await netflows(ahora);
    nf = { generado: ahora, fuente: 'DeFiLlama (saldos diarios de exchanges)', exchanges: EXCHANGES_NETFLOW, avisos: r.avisos, activos: r.out };
  }
  if (nf) await writeFile(join(SALIDA, 'netflows.json'), JSON.stringify(nf));

  console.log(`rr25: ${muestras.length} muestras${avisosRR.length ? ' · ' + avisosRR.join(' ') : ''}`);
  console.log(`netflows: ${nf ? Object.entries(nf.activos).map(([a, d]) => `${a} ${d.length} días`).join(', ') : 'sin datos'} (generado ${nf ? new Date(nf.generado).toISOString() : '—'})`);

  const prox = eventos.filter((e) => e.time > ahora).slice(0, 3).map((e) => `${e.tipo} ${new Date(e.time).toISOString()}`);
  console.log(`macro: ${eventos.length} eventos (próximos: ${prox.join(' · ') || 'ninguno'})`);
  console.log(`mercados: SPX ${mercados.spx?.c.length ?? 0} días, DXY ${mercados.dxy?.c.length ?? 0} días`);
  if (avisos.length || mercados.avisos.length) {
    console.log('avisos:', [...avisos, ...mercados.avisos].join(' | '));
    process.exitCode = 1;
  }
}

main();
