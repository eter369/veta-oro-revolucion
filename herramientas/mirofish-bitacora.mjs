// scripts/bitacora.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// src/lib/indicators.ts
function ema(data, period) {
  const out = [];
  const k = 2 / (period + 1);
  let prev = data[0] ?? 0;
  for (let i = 0; i < data.length; i++) {
    prev = i === 0 ? data[0] : data[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}
function sma(data, period) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) sum -= data[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}
function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}
function macd(closes, fast = 12, slow = 26, sig = 9) {
  const ef = ema(closes, fast);
  const es = ema(closes, slow);
  const line = closes.map((_, i) => ef[i] - es[i]);
  const signal = ema(line, sig);
  const histogram = line.map((v, i) => v - signal[i]);
  return { macd: line, signal, histogram };
}
function bollinger(closes, period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper = [];
  const lower = [];
  const pctB = [];
  const bandwidth = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
      pctB.push(NaN);
      bandwidth.push(NaN);
      continue;
    }
    let varSum = 0;
    for (let j = i - period + 1; j <= i; j++) varSum += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(varSum / period);
    const u = mid[i] + mult * sd;
    const l = mid[i] - mult * sd;
    upper.push(u);
    lower.push(l);
    pctB.push(u === l ? 0.5 : (closes[i] - l) / (u - l));
    bandwidth.push(mid[i] === 0 ? 0 : (u - l) / mid[i]);
  }
  return { mid, upper, lower, pctB, bandwidth };
}
function atr(kl, period = 14) {
  const out = new Array(kl.length).fill(NaN);
  if (kl.length <= period) return out;
  const trs = [0];
  for (let i = 1; i < kl.length; i++) {
    const h = kl[i].high, l = kl[i].low, pc = kl[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let a = 0;
  for (let i = 1; i <= period; i++) a += trs[i];
  a /= period;
  out[period] = a;
  for (let i = period + 1; i < kl.length; i++) {
    a = (a * (period - 1) + trs[i]) / period;
    out[i] = a;
  }
  return out;
}
function adx(kl, period = 14) {
  const n = kl.length;
  const adxArr = new Array(n).fill(NaN);
  const plusDI = new Array(n).fill(NaN);
  const minusDI = new Array(n).fill(NaN);
  if (n <= period * 2) return { adx: adxArr, plusDI, minusDI };
  const tr = [0];
  const pdm = [0];
  const mdm = [0];
  for (let i = 1; i < n; i++) {
    const up = kl[i].high - kl[i - 1].high;
    const dn = kl[i - 1].low - kl[i].low;
    pdm.push(up > dn && up > 0 ? up : 0);
    mdm.push(dn > up && dn > 0 ? dn : 0);
    const pc = kl[i - 1].close;
    tr.push(Math.max(kl[i].high - kl[i].low, Math.abs(kl[i].high - pc), Math.abs(kl[i].low - pc)));
  }
  let trS = 0, pS = 0, mS = 0;
  for (let i = 1; i <= period; i++) {
    trS += tr[i];
    pS += pdm[i];
    mS += mdm[i];
  }
  const dx = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    if (i > period) {
      trS = trS - trS / period + tr[i];
      pS = pS - pS / period + pdm[i];
      mS = mS - mS / period + mdm[i];
    }
    plusDI[i] = trS === 0 ? 0 : 100 * pS / trS;
    minusDI[i] = trS === 0 ? 0 : 100 * mS / trS;
    const diSum = plusDI[i] + minusDI[i];
    dx[i] = diSum === 0 ? 0 : 100 * Math.abs(plusDI[i] - minusDI[i]) / diSum;
  }
  let start = period * 2 - 1;
  if (start >= n) start = n - 1;
  let first = 0, cnt = 0;
  for (let i = period; i <= start && i < n; i++) {
    first += dx[i];
    cnt++;
  }
  if (cnt > 0) {
    adxArr[start] = first / cnt;
    for (let i = start + 1; i < n; i++) {
      adxArr[i] = (adxArr[i - 1] * (period - 1) + dx[i]) / period;
    }
  }
  return { adx: adxArr, plusDI, minusDI };
}
function supertrend(kl, period = 10, mult = 3) {
  const n = kl.length;
  const a = atr(kl, period);
  const line = new Array(n).fill(NaN);
  const direction = new Array(n).fill(1);
  let prevUpper = NaN, prevLower = NaN, prevDir = 1, prevST = NaN;
  for (let i = 0; i < n; i++) {
    if (isNaN(a[i])) continue;
    const hl2 = (kl[i].high + kl[i].low) / 2;
    let upper = hl2 + mult * a[i];
    let lower = hl2 - mult * a[i];
    if (!isNaN(prevLower)) {
      lower = lower > prevLower || kl[i - 1].close < prevLower ? lower : prevLower;
      upper = upper < prevUpper || kl[i - 1].close > prevUpper ? upper : prevUpper;
    }
    let dir = prevDir;
    if (isNaN(prevST)) dir = kl[i].close <= upper ? -1 : 1;
    else if (prevST === prevUpper) dir = kl[i].close > upper ? 1 : -1;
    else dir = kl[i].close < lower ? -1 : 1;
    const st = dir === 1 ? lower : upper;
    line[i] = st;
    direction[i] = dir;
    prevUpper = upper;
    prevLower = lower;
    prevDir = dir;
    prevST = st;
  }
  return { line, direction };
}
function rollingVWAP(kl, period = 20) {
  const out = new Array(kl.length).fill(NaN);
  for (let i = period - 1; i < kl.length; i++) {
    let pv = 0, v = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tp = (kl[j].high + kl[j].low + kl[j].close) / 3;
      pv += tp * kl[j].volume;
      v += kl[j].volume;
    }
    out[i] = v === 0 ? kl[i].close : pv / v;
  }
  return out;
}
function obv(kl) {
  const out = [0];
  for (let i = 1; i < kl.length; i++) {
    const d = kl[i].close - kl[i - 1].close;
    out.push(out[i - 1] + (d > 0 ? kl[i].volume : d < 0 ? -kl[i].volume : 0));
  }
  return out;
}
function logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}
function stdev(data) {
  if (data.length < 2) return 0;
  const m = data.reduce((s, x) => s + x, 0) / data.length;
  return Math.sqrt(data.reduce((s, x) => s + (x - m) ** 2, 0) / (data.length - 1));
}
function lastValid(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (!Number.isNaN(arr[i])) return arr[i];
  }
  return NaN;
}
var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// src/lib/tesla369.ts
var TF_WEIGHTS = { "4h": 0.3, "1d": 0.5, "1w": 0.2 };
function classifySignal(s) {
  if (s >= 0.8) return { name: "MAX LONG", tone: "maxlong", action: "Entrada completa", sizeFrac: 1 };
  if (s >= 0.6) return { name: "LONG", tone: "long", action: "Entrada 70%", sizeFrac: 0.7 };
  if (s >= 0.4) return { name: "SWING LONG", tone: "swinglong", action: "Entrada 50%", sizeFrac: 0.5 };
  if (s >= 0.2) return { name: "WATCH LONG", tone: "watchlong", action: "Lista de espera", sizeFrac: 0 };
  if (s > -0.2) return { name: "HOLD / NEUTRAL", tone: "hold", action: "No operar", sizeFrac: 0 };
  if (s > -0.4) return { name: "WATCH SHORT", tone: "watchshort", action: "Lista bajista", sizeFrac: 0 };
  if (s > -0.6) return { name: "SWING SHORT", tone: "swingshort", action: "Corto 50%", sizeFrac: 0.5 };
  if (s > -0.8) return { name: "SHORT", tone: "short", action: "Corto 70%", sizeFrac: 0.7 };
  return { name: "MAX SHORT", tone: "maxshort", action: "Corto completo", sizeFrac: 1 };
}
var W = { rsi: 0.15, macd: 0.15, boll: 0.1, adx: 0.1, st: 0.1, vwap: 0.1, lunar: 0.15, fgi: 0.1, obv: 0.05 };
function analyzeTF(tf, kl, lunar, fgi) {
  if (kl.length < 60) return null;
  const closes = kl.map((k) => k.close);
  const price = closes[closes.length - 1];
  const rsiArr = rsi(closes, 14);
  const rsiV = lastValid(rsiArr);
  const m = macd(closes);
  const hist = m.histogram[m.histogram.length - 1];
  const atrArr = atr(kl, 14);
  const atrV = lastValid(atrArr);
  const b = bollinger(closes);
  const pctB = lastValid(b.pctB);
  const adxR = adx(kl, 14);
  const adxV = lastValid(adxR.adx);
  const pDI = lastValid(adxR.plusDI);
  const mDI = lastValid(adxR.minusDI);
  const st = supertrend(kl);
  const stDir = st.direction[st.direction.length - 1];
  const vwapArr = rollingVWAP(kl, 20);
  const vwapV = lastValid(vwapArr);
  const obvArr = obv(kl);
  const nRSI = clamp((rsiV - 50) / 50, -1, 1);
  const nMACD = atrV > 0 ? clamp(hist / atrV * 3, -1, 1) : 0;
  const nBoll = clamp((pctB - 0.5) * 2, -1, 1);
  const adxGate = adxV > 20 ? Math.min(adxV / 35, 1) : adxV / 20 * 0.3;
  const nADX = clamp((pDI - mDI) / 50 * adxGate, -1, 1);
  const nST = clamp(stDir, -1, 1);
  const vwapDev = vwapV > 0 ? (price - vwapV) / vwapV : 0;
  const nVWAP = clamp(vwapDev / 0.02, -1, 1);
  const nLunar = clamp(lunar.phase.lunarValue / 2, -1, 1);
  const nFGI = clamp(-(fgi - 50) / 50, -1, 1);
  const obvSpan = 5;
  const obvSlope = obvArr.length > obvSpan ? obvArr[obvArr.length - 1] - obvArr[obvArr.length - 1 - obvSpan] : 0;
  const avgVol = kl.slice(-obvSpan - 1).reduce((s, k) => s + k.volume, 0) / (obvSpan + 1);
  const nOBV = avgVol > 0 ? clamp(obvSlope / (avgVol * obvSpan), -1, 1) : 0;
  const components = [
    { key: "rsi", name: "RSI (14)", weight: W.rsi, raw: rsiV.toFixed(1), norm: nRSI },
    { key: "macd", name: "MACD HIST", weight: W.macd, raw: hist.toFixed(2), norm: nMACD },
    { key: "boll", name: "BOLLINGER %B", weight: W.boll, raw: pctB.toFixed(2), norm: nBoll },
    { key: "adx", name: "ADX DIRECCIONAL", weight: W.adx, raw: `${adxV.toFixed(0)} \xB7 +${pDI.toFixed(0)}/-${mDI.toFixed(0)}`, norm: nADX },
    { key: "st", name: "SUPERTREND", weight: W.st, raw: stDir > 0 ? "ALCISTA" : "BAJISTA", norm: nST },
    { key: "vwap", name: "VWAP POSITION", weight: W.vwap, raw: `${(vwapDev * 100).toFixed(2)}%`, norm: nVWAP },
    { key: "lunar", name: "FASE LUNAR", weight: W.lunar, raw: lunar.phase.name.toUpperCase(), norm: nLunar },
    { key: "fgi", name: "FEAR & GREED", weight: W.fgi, raw: `${fgi.toFixed(0)} (INV)`, norm: nFGI },
    { key: "obv", name: "OBV MOMENTUM", weight: W.obv, raw: nOBV >= 0 ? "ACUMULA" : "DISTRIBUYE", norm: nOBV }
  ];
  const base = components.reduce((s, c) => s + c.norm * c.weight, 0);
  const signal = clamp(base * lunar.phase.multiplier, -1, 1);
  return {
    tf,
    signal,
    components,
    rsiV,
    adxV,
    priceVsVwap: vwapDev * 100,
    stDir,
    atrV
  };
}
function fullAnalysis(klines, klines1h, lunar, fgi) {
  const a4 = analyzeTF("4h", klines["4h"], lunar, fgi);
  const a1 = analyzeTF("1d", klines["1d"], lunar, fgi);
  const aW = analyzeTF("1w", klines["1w"], lunar, fgi);
  if (!a4 || !a1 || !aW) return null;
  const confianza = clamp(
    a4.signal * TF_WEIGHTS["4h"] + a1.signal * TF_WEIGHTS["1d"] + aW.signal * TF_WEIGHTS["1w"],
    -1,
    1
  );
  const classification = classifySignal(confianza);
  const pUp = 1 / (1 + Math.exp(-confianza * 4.2));
  const pDown = 1 - pUp;
  const signs = [a4.signal, a1.signal, aW.signal].map((s) => Math.sign(s));
  const aligned = signs.filter((s) => s === Math.sign(confianza) && s !== 0).length;
  const confidencePct = clamp(Math.abs(confianza) * 72 + aligned * 8 + (a1.adxV > 20 ? 8 : 0), 3, 97.4);
  const price = a1.atrV > 0 ? klines["1d"][klines["1d"].length - 1].close : 0;
  const atrPct = price > 0 ? a1.atrV / price * 100 : 0;
  const edgeVsBook = confianza * atrPct * 1.6;
  let sigma1h = 0;
  let annualVolPct = 0;
  let logRet1h = [];
  if (klines1h && klines1h.length > 30) {
    const closes1h = klines1h.map((k) => k.close);
    logRet1h = logReturns(closes1h).slice(-120);
    sigma1h = stdev(logRet1h);
    annualVolPct = sigma1h * Math.sqrt(24 * 365) * 100;
  }
  let alert;
  if (fgi > 85 || fgi < 15) {
    alert = { level: "ROJA", reason: `Fear & Greed extremo (${fgi.toFixed(0)}) \u2014 reducir exposici\xF3n 50%` };
  } else if (lunar.phase.key === "full" && a1.rsiV > 75 || lunar.phase.key === "new" && a1.rsiV < 25) {
    alert = { level: "ROJA", reason: "Sobrecompra/sobreventa lunar \u2014 stops a breakeven" };
  } else if (Math.abs(confianza) > 0.6 && (confianza > 0 && lunar.phase.multiplier >= 1.1 || confianza < 0 && lunar.phase.multiplier <= 0.8)) {
    alert = { level: "VERDE", reason: "Ventana de oportunidad \u2014 se\xF1al fuerte con luna favorable" };
  } else if (Math.abs(confianza) < 0.2 || a1.adxV < 20) {
    alert = { level: "AMARILLA", reason: a1.adxV < 20 ? `ADX ${a1.adxV.toFixed(0)} < 20 \u2014 sin tendencia clara` : "Zona neutral \u2014 esperar confirmaci\xF3n" };
  } else {
    alert = { level: "AMARILLA", reason: "Precauci\xF3n est\xE1ndar \u2014 tama\xF1o reducido" };
  }
  const confirmLong = {
    ok: confianza > 0.4 && a1.adxV > 20 && a1.priceVsVwap > 0,
    checks: [
      { label: "Se\xF1al > +0.40", pass: confianza > 0.4 },
      { label: "ADX > 20", pass: a1.adxV > 20 },
      { label: "Precio > VWAP", pass: a1.priceVsVwap > 0 }
    ]
  };
  const confirmShort = {
    ok: confianza < -0.4 && a1.adxV > 20 && a1.priceVsVwap < 0,
    checks: [
      { label: "Se\xF1al < -0.40", pass: confianza < -0.4 },
      { label: "ADX > 20", pass: a1.adxV > 20 },
      { label: "Precio < VWAP", pass: a1.priceVsVwap < 0 }
    ]
  };
  return {
    perTF: { "4h": a4, "1d": a1, "1w": aW },
    confianza,
    classification,
    pUp,
    pDown,
    confidencePct,
    edgeVsBook,
    atr1d: a1.atrV,
    adx1d: a1.adxV,
    rsi1d: a1.rsiV,
    vwap1d: lastValid(rollingVWAP(klines["1d"], 20)),
    price,
    sigma1h,
    annualVolPct,
    logRet1h,
    alert,
    confirmLong,
    confirmShort
  };
}

// src/lib/lunar.ts
var SYNODIC = 29.530588853;
var REF_NEW_MOON = Date.UTC(2e3, 0, 6, 18, 14, 0);
var DAY_MS = 864e5;
var PHASES = [
  {
    index: 0,
    key: "new",
    name: "Luna Nueva",
    archetype: "La Semilla",
    energy: "Inicio \xB7 potencial \xB7 quietud",
    multiplier: 0.8,
    lunarValue: 0,
    strategy: "Acumulaci\xF3n escalonada en soporte. Volumen -20%, squeeze frecuente. No operar rupturas a\xFAn."
  },
  {
    index: 1,
    key: "waxing_crescent",
    name: "Luna Creciente",
    archetype: "El Brote",
    energy: "Crecimiento \xB7 intenci\xF3n \xB7 confianza",
    multiplier: 1.2,
    lunarValue: 1,
    strategy: "Preparar entradas en retroceso. RSI 40-60 + cruce MACD = zona de carga."
  },
  {
    index: 2,
    key: "first_quarter",
    name: "Cuarto Creciente",
    archetype: "El Tronco",
    energy: "Crisis de acci\xF3n \xB7 decisi\xF3n \xB7 fuerza",
    multiplier: 1.3,
    lunarValue: 1,
    strategy: "Ventana \xF3ptima de entrada (d\xEDas 5-10). Volumen +25%, primeras rupturas. SuperTrend + VWAP confirman."
  },
  {
    index: 3,
    key: "waxing_gibbous",
    name: "Gibosa Creciente",
    archetype: "La Flor",
    energy: "Ajuste \xB7 refinamiento \xB7 anticipaci\xF3n",
    multiplier: 1.1,
    lunarValue: 1,
    strategy: "Mantener posiciones ganadoras. Ajustar stops al alza. Cerca del cl\xEDmax emocional."
  },
  {
    index: 4,
    key: "full",
    name: "Luna Llena",
    archetype: "El Fruto",
    energy: "Culminaci\xF3n \xB7 emoci\xF3n \xB7 revelaci\xF3n",
    multiplier: 0.9,
    lunarValue: 0,
    strategy: "ALERTA, no se\xF1al: volatilidad +58%. 63% de tops locales coinciden. Toma parcial si RSI>70 + FGI>75."
  },
  {
    index: 5,
    key: "waning_gibbous",
    name: "Gibosa Menguante",
    archetype: "La Cosecha",
    energy: "Gratitud \xB7 compartir \xB7 conciencia",
    multiplier: 0.7,
    lunarValue: -1,
    strategy: "Proteger ganancias, stops a breakeven. Reducir exposici\xF3n gradualmente."
  },
  {
    index: 6,
    key: "last_quarter",
    name: "Cuarto Menguante",
    archetype: "La Poda",
    energy: "Liberaci\xF3n \xB7 desapego \xB7 crisis",
    multiplier: 0.6,
    lunarValue: -2,
    strategy: "Distribuci\xF3n: presi\xF3n vendedora sostenida. Reducir exposici\xF3n 50%. Cortos solo si ADX>25 y -DI>+DI."
  },
  {
    index: 7,
    key: "waning_crescent",
    name: "Luna Menguante",
    archetype: "El Compost",
    energy: "Descanso \xB7 introspecci\xF3n \xB7 integraci\xF3n",
    multiplier: 0.8,
    lunarValue: -1,
    strategy: "Preparar acumulaci\xF3n del nuevo ciclo. RSI<35 + FGI<25 = zona de siembra contrarian."
  }
];
function getLunarState(now = Date.now()) {
  const elapsed = (now - REF_NEW_MOON) / DAY_MS;
  const age = (elapsed % SYNODIC + SYNODIC) % SYNODIC;
  const cyclePct = age / SYNODIC;
  const illumination = (1 - Math.cos(2 * Math.PI * cyclePct)) / 2;
  const phaseIndex = Math.floor((cyclePct * 8 + 0.5) % 8);
  const phase = PHASES[phaseIndex];
  return {
    ageDays: age,
    cyclePct,
    illumination,
    waxing: cyclePct < 0.5,
    phase,
    dayOfCycle: Math.floor(age) + 1
  };
}

// src/lib/mtf.ts
function nearestLevels(map, price) {
  const above = map.levels.filter((l) => l.price > price);
  const below = map.levels.filter((l) => l.price <= price);
  const up = above[above.length - 1] ?? null;
  const down = below[0] ?? null;
  return {
    up,
    down,
    upPct: up ? (up.price - price) / price * 100 : Infinity,
    downPct: down ? (price - down.price) / price * 100 : Infinity
  };
}
function levelMap(set, price, t24) {
  const d = set["1d"];
  const w = set["1w"];
  if (!price || !d || d.length < 16 || !w || w.length < 2) return null;
  const today = d[d.length - 1];
  const yday = d[d.length - 2];
  const week = w[w.length - 1];
  const pweek = w[w.length - 2];
  const atr1d = lastValid(atr(d.slice(0, -1), 14));
  const dayHigh = Math.max(today.high, price);
  const dayLow = Math.min(today.low, price);
  const levels = [
    { key: "dopen", label: "Apertura diaria", price: today.open, kind: "day" },
    { key: "pdh", label: "M\xE1x. de ayer", price: yday.high, kind: "day" },
    { key: "pdl", label: "M\xEDn. de ayer", price: yday.low, kind: "day" },
    { key: "wopen", label: "Apertura semanal", price: week.open, kind: "week" },
    { key: "pwh", label: "M\xE1x. sem. anterior", price: pweek.high, kind: "week" },
    { key: "pwl", label: "M\xEDn. sem. anterior", price: pweek.low, kind: "week" }
  ];
  if (t24 && t24.high > 0 && t24.low > 0) {
    levels.push({ key: "h24", label: "M\xE1x. 24 h", price: t24.high, kind: "24h" });
    levels.push({ key: "l24", label: "M\xEDn. 24 h", price: t24.low, kind: "24h" });
  }
  if (atr1d > 0) {
    levels.push({ key: "atru", label: "Apertura + ATR", price: today.open + atr1d, kind: "atr" });
    levels.push({ key: "atrd", label: "Apertura \u2212 ATR", price: today.open - atr1d, kind: "atr" });
  }
  levels.sort((a, b) => b.price - a.price);
  const span = t24 ? t24.high - t24.low : 0;
  return {
    levels,
    atr1d,
    dayHigh,
    dayLow,
    dayRangeUsed: atr1d > 0 ? (dayHigh - dayLow) / atr1d : 0,
    pos24h: span > 0 && t24 ? Math.min(1, Math.max(0, (price - t24.low) / span)) : 0.5
  };
}

// src/config/config.json
var config_default = {
  _nota: "Umbrales y pesos de MIROFISH. Ning\xFAn valor de se\xF1al o riesgo vive en el c\xF3digo: se lee de aqu\xED. Tras editar, recompilar (npm run build). Ver README-MODULOS.md.",
  scoreMaestro: {
    _nota: "v3: capa de se\xF1al superior. aporte = peso \xD7 score \xD7 confianza. El sweep ya no suma: es gatillo de ejecuci\xF3n (secci\xF3n gatillo). El r\xE9gimen SPX/DXY y el calendario macro act\xFAan como compuertas. pesosEncargo = pesos del prompt v3; pesos = los que usa el terminal tras la regla \xABedge negativo en el backtest aislado \u2192 peso 0\xBB (npm run backtest los recalcula en backtest/pesos-sugeridos.json). normalizarPesos divide por la suma para que el umbral conserve su sentido.",
    pesosEncargo: { orderflow: 0.3, cvd: 0.2, funding: 0.2, liquidaciones: 0.15, skew: 0.1, mtf: 0.05 },
    pesos: { orderflow: 0, cvd: 0, funding: 0, liquidaciones: 0.15, skew: 0.1, mtf: 0.05 },
    notasPesos: {
      orderflow: "Edge negativo en el backtest aislado (R medio -0.01, t -2.03, 1836 trades): peso 0.",
      cvd: "Edge negativo en el backtest aislado (R medio -0.01, t -3.17, 2350 trades): peso 0.",
      funding: "Edge negativo en el backtest aislado (R medio -0.03, t -1.10, 375 trades): peso 0.",
      liquidaciones: "Muestra chica en el backtest aislado (0 trades): peso del encargo, sin validar.",
      skew: "Sin historial gratuito para el backtest: peso del encargo, sin validar.",
      mtf: "Edge no negativo en el backtest aislado (R medio 0.22, t 1.96, 84 trades)."
    },
    normalizarPesos: true,
    umbralEntrada: 0.4,
    umbralSalidaGiro: 0.2,
    maxPosicionesAbiertas: 3,
    regimenComoCompuerta: true
  },
  scoreSwing: {
    _nota: "Horizonte semanal: no entra al score intrad\xEDa; modula el tama\xF1o (posici\xF3n core) y sugiere niveles escalonados. Misma regla de pesos que el score maestro.",
    pesosEncargo: { netflows: 0.4, orderflowSemanal: 0.25, skew: 0.2, funding7d: 0.15 },
    pesos: { netflows: 0, orderflowSemanal: 0.25, skew: 0.2, funding7d: 0.15 },
    notasPesos: {
      netflows: "Edge negativo en el backtest aislado (R medio -0.31, t -2.60, 49 trades): peso 0.",
      orderflowSemanal: "Edge no negativo en el backtest aislado (R medio 0.21, t 1.11, 46 trades).",
      skew: "Sin historial gratuito para el backtest: peso del encargo, sin validar.",
      funding7d: "Edge no negativo en el backtest aislado (R medio 0.05, t 0.32, 48 trades)."
    },
    normalizarPesos: true,
    modulacionTamano: 0.5,
    nivelesEscalonadosATR: [1, 2, 3]
  },
  gatillo: {
    _nota: "Una entrada solo se ejecuta si, adem\xE1s del score, hay un sweep o un cambio de estructura (MSS) a favor en 15 m en las \xFAltimas velas.",
    temporalidad: "15m",
    velasRecientes: 4,
    ventanaMSS: 10,
    exigir: true
  },
  s1OrderFlow: {
    diasDistribucion: 30,
    pesosVentana: { "1h": 0.5, "4h": 0.3, "1d": 0.2 },
    escalaZ: 2,
    diasSemanal: 365,
    percentilGrandes: 95,
    muestraTamanos: 4e3,
    umbralDivergencia: 0.3,
    confianzaSoloBinance: 0.6,
    confianzaPorExchangeVivo: 0.1,
    castigoDesacuerdo: 0.6,
    minutosMinimosEnVivo: 10,
    tradesMinimosEnVivo: 100
  },
  s2Cvd: {
    anclasUTC: ["00:00", "08:00", "13:30"],
    minutosPorBarra: 5,
    ventanaDivergencia: 12,
    barrasVigencia: 6,
    pesoAbsorcion: 0.6,
    pesoTendencia: 0.4,
    escalaTendencia: 0.15,
    multPerpLidera: 0.5,
    multSpotLidera: 1.25
  },
  s3Basis: {
    diasDistribucion: 90,
    percentilTrampaAlto: 80,
    percentilTrampaBajo: 20,
    pesoContrarian: 0.2
  },
  s4Liquidaciones: {
    clusterReferenciaUsdBTC: 3e8,
    distanciaMinPct: 0.3,
    distanciaMaxPct: 5,
    semividaPct: 2,
    umbralCvdConfluencia: 0.02,
    periodoOI: "4h",
    velasOI: 180
  },
  s5Skew: {
    tenoresDias: [7, 30],
    deltaObjetivo: 0.25,
    diasDistribucion: 90,
    horasCambio: 24,
    diasVolCambio: 30,
    escalaZ: 2,
    umbralGiro: 0.5,
    horasConfirmacion: 48,
    castigoPrematuro: 0.6,
    muestrasMinimas: 48,
    _notaCadencia: "v4: el cron no corre cada hora de verdad (medido: unas 4 corridas al d\xEDa). El m\xF3dulo se activa por cobertura temporal (diasMinimos con \u2265 muestrasPorDiaMin muestras), no por conteo, y el \xABvalor de hace 24 h\xBB se busca con una tolerancia que sigue al hueco mediano de la \xFAltima semana (\xD7 toleranciaMultHueco, entre min y max). Si aun as\xED no hay muestra, se usa la \xFAltima anterior y la confianza se castiga por su antig\xFCedad.",
    diasMinimos: 7,
    muestrasPorDiaMin: 3,
    toleranciaMinHoras: 3,
    toleranciaMaxHoras: 12,
    toleranciaMultHueco: 1.5,
    refrescoMin: 60
  },
  s6Netflows: {
    fuenteActiva: "DeFiLlama (saldos diarios de exchanges, sin clave)",
    cascada: ["CryptoQuant (requiere clave)", "CoinGlass (requiere clave)", "DeFiLlama (saldos diarios de exchanges, sin clave)"],
    exchanges: ["binance-cex", "okx", "bybit", "bitfinex", "gate", "bitget", "gemini", "htx", "kucoin", "crypto-com"],
    diasZ: 30,
    diasRacha: 7,
    minDiasRacha: 5,
    percentilSpike: 95,
    horasSpike: 72,
    escalaZ: 2
  },
  costos: {
    feeTakerPorLado: 5e-4,
    slippageRespaldoBps: { BTC: 1.5, ETH: 2, SOL: 4 },
    profundidadMaxAntiguedadMin: 5
  },
  m1Funding: {
    diasDistribucion: 90,
    neutroAbs: 1e-4,
    overcrowdedMin: 5e-4,
    extremoAbs: 1e-3,
    percentilTrampaAlto: 90,
    percentilTrampaBajo: 10,
    oiCambio4hTrampaPct: 3,
    distanciaNivelPct: 0.35,
    scoreTrampa: 0.8,
    pesoContrarian: 0.5,
    pesoConfirmacionOI: 0.3,
    refrescoSeg: 60,
    refrescoOiHistSeg: 300
  },
  m2Macro: {
    horasAntes: 24,
    horasDespues: 2,
    multiplicadorTamano: 0.5,
    umbralEnVentana: 0.55,
    bloqueoMinAntes: 30,
    bloqueoMinDespues: 30,
    eventosBloqueo: ["FOMC", "CPI"],
    refrescoMin: 30
  },
  m3Regimen: {
    diasCorrelacion: 30,
    dxyEma: 20,
    dxyRetorno5dPct: 1,
    penalizacionLongs: 0.5,
    impulsoLongs: 1.2,
    spxDrawdownPct: 3,
    spxDiasMaximo: 20,
    escalaSpx5dPct: 2,
    escalaDxy5dPct: 1,
    pesoSpx: 0.5,
    pesoDxy: 0.5,
    umbralRiskOn: 0.25,
    refrescoMin: 30
  },
  m4Riesgo: {
    equityInicial: 25e3,
    fraccionKelly: 0.25,
    maxFraccion: 0.05,
    fraccionFija: 0.01,
    fraccionSinVentaja: 25e-4,
    tradesVentana: 30,
    tradesMinimos: 20,
    atrMultStop: 1.5,
    objetivoR: 2,
    maxHorasPosicion: 72,
    perdidaDiariaMaxPct: 3,
    drawdownDefensivoPct: 10,
    multiplicadorDefensivo: 0.5,
    apalancamientoMax: 5
  },
  m5Liquidaciones: {
    bucketPct: 0.5,
    ventanaHoras: 24,
    distanciaMinPct: 0.3,
    distanciaMaxPct: 5,
    masaMinimaFraccionOI: 0.02,
    apalancamientos: [
      { x: 10, peso: 0.4 },
      { x: 25, peso: 0.3 },
      { x: 50, peso: 0.2 },
      { x: 100, peso: 0.1 }
    ],
    margenMantenimiento: 5e-3,
    refrescoProfundidadSeg: 60
  },
  sweep: {
    velasRecientes: 6,
    pesoGrado: { A: 1, B: 0.6, C: 0.3 }
  },
  backtest: {
    _nota: "Backtest aislado de cada m\xF3dulo (npm run backtest): entra cuando |score del m\xF3dulo| supera el umbral, riesgo fijo por trade, mismos stops, objetivos y costos que el terminal.",
    dias: 182,
    umbralAislado: 0.3,
    umbralAisladoSwing: 0.5,
    maxDiasSwing: 21,
    fraccionRiesgo: 0.01,
    umbralesMaestro: [0.35, 0.4, 0.45]
  },
  frescura: {
    _nota: "v4: la antig\xFCedad m\xE1xima depende del uso del dato, no del archivo. Un calendario con un FOMC a 16 d\xEDas no caduca a las 30 h; el OI de 4 h que se pide cada 5 min no puede caducar a los 5 min. rr25 caduca a N veces la cadencia real medida del cron. saltoRelojSeg: un tick de 1 s que llega con m\xE1s retraso que esto = el equipo durmi\xF3 \u2192 se refresca todo.",
    staleMin: 5,
    staleDiarioHoras: 30,
    saltoRelojSeg: 120,
    reintentoDespertarSeg: 20,
    porUso: {
      precioSeg: 5,
      velasMin: 5,
      fundingMin: 10,
      oiMin: 15,
      rr25MultCadencia: 3,
      rr25MinHoras: 2,
      netflowsHoras: 36,
      mercadosHoras: 30,
      macroCuentaRegresivaDias: 7,
      macroCompuertaHoras: 30
    }
  }
};

// src/lib/modulos/comun.ts
var CFG = config_default;
var clamp1 = (v) => Math.max(-1, Math.min(1, v));
var clamp2 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function percentilDe(valor, distribucion) {
  if (!distribucion.length) return 50;
  const menores = distribucion.filter((x) => x < valor).length;
  const iguales = distribucion.filter((x) => x === valor).length;
  return (menores + iguales / 2) / distribucion.length * 100;
}
function ema2(valores, periodo) {
  const k = 2 / (periodo + 1);
  const out = [];
  valores.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}
function correlacion(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const x = a.slice(-n), y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
var diaUTC = (ms) => new Date(ms).toISOString().slice(0, 10);

// src/lib/modulos/m2Macro.ts
var C = CFG.m2Macro;
var HORA = 36e5;
var MIN = 6e4;
function estadoMacro(eventos, ahora, umbralBase) {
  const altos = eventos.filter((e) => e.impacto === "alto").sort((a, b) => a.time - b.time);
  const proximo = altos.find((e) => e.time > ahora) ?? null;
  const bloqueo = altos.find(
    (e) => C.eventosBloqueo.includes(e.tipo) && ahora >= e.time - C.bloqueoMinAntes * MIN && ahora <= e.time + C.bloqueoMinDespues * MIN
  );
  if (bloqueo) {
    return { fase: "bloqueo", proximo, activo: bloqueo, multiplicadorTamano: C.multiplicadorTamano, umbral: C.umbralEnVentana, bloqueaAperturas: true };
  }
  const ventana = altos.find((e) => ahora >= e.time - C.horasAntes * HORA && ahora <= e.time + C.horasDespues * HORA);
  if (ventana) {
    return {
      fase: "ventana",
      proximo,
      activo: ventana,
      multiplicadorTamano: C.multiplicadorTamano,
      umbral: Math.max(umbralBase, C.umbralEnVentana),
      bloqueaAperturas: false
    };
  }
  return { fase: "libre", proximo, activo: null, multiplicadorTamano: 1, umbral: umbralBase, bloqueaAperturas: false };
}

// src/lib/modulos/m3Regimen.ts
var C2 = CFG.m3Regimen;
var ret = (c, n) => c.length > n ? (c[c.length - 1] / c[c.length - 1 - n] - 1) * 100 : 0;
function retornosAlineados(a, b) {
  const mapaB = new Map(b.t.map((t, i) => [diaUTC(t), b.c[i]]));
  const comunes = [];
  a.t.forEach((t, i) => {
    const vb = mapaB.get(diaUTC(t));
    if (vb !== void 0) comunes.push([a.c[i], vb]);
  });
  const ra = [], rb = [];
  for (let i = 1; i < comunes.length; i++) {
    ra.push(Math.log(comunes[i][0] / comunes[i - 1][0]));
    rb.push(Math.log(comunes[i][1] / comunes[i - 1][1]));
  }
  return [ra, rb];
}
function evaluarM3(spx, dxy, btc) {
  const [b1, s1] = retornosAlineados(btc, spx);
  const [b2, d2] = retornosAlineados(btc, dxy);
  const corrSpx = correlacion(b1.slice(-C2.diasCorrelacion), s1.slice(-C2.diasCorrelacion));
  const corrDxy = correlacion(b2.slice(-C2.diasCorrelacion), d2.slice(-C2.diasCorrelacion));
  const dxyUlt = dxy.c[dxy.c.length - 1];
  const dxyEma = ema2(dxy.c, C2.dxyEma).at(-1) ?? dxyUlt;
  const dxyRet5dPct = ret(dxy.c, 5);
  const dxyRuptura = dxyUlt > dxyEma && dxyRet5dPct > C2.dxyRetorno5dPct ? 1 : dxyUlt < dxyEma && dxyRet5dPct < -C2.dxyRetorno5dPct ? -1 : 0;
  const ventana = spx.c.slice(-C2.spxDiasMaximo);
  const maxSpx = Math.max(...ventana);
  const spxDrawdownPct = maxSpx > 0 ? (maxSpx - spx.c[spx.c.length - 1]) / maxSpx * 100 : 0;
  const riskOff = spxDrawdownPct > C2.spxDrawdownPct;
  const spxRet5dPct = ret(spx.c, 5);
  const sSpx = riskOff ? -1 : clamp1(spxRet5dPct / C2.escalaSpx5dPct);
  const sDxy = -clamp1(dxyRet5dPct / C2.escalaDxy5dPct);
  const score = clamp1(C2.pesoSpx * sSpx + C2.pesoDxy * sDxy);
  const regimen = riskOff || score < -C2.umbralRiskOn ? "RISK-OFF" : score > C2.umbralRiskOn ? "RISK-ON" : "MIXTO";
  return { score, regimen, corrSpx, corrDxy, dxyRuptura, dxyRet5dPct, spxRet5dPct, spxDrawdownPct, riskOff };
}
function multiplicadorLargos(m3) {
  if (!m3) return 1;
  if (m3.dxyRuptura === 1) return C2.penalizacionLongs;
  if (m3.dxyRuptura === -1) return C2.impulsoLongs;
  return 1;
}

// src/lib/modulos/m5Liquidaciones.ts
var C3 = CFG.m5Liquidaciones;
var paso = Math.log(1 + C3.bucketPct / 100);
var tramoDe = (p, ref) => Math.round(Math.log(p / ref) / paso);
var centroDe = (k, ref) => ref * Math.exp(k * paso);
var EstimadorClusters = class {
  pos = [];
  paso(oiAntes, oiAhora, vela) {
    const mm = C3.margenMantenimiento;
    this.pos = this.pos.filter((p) => p.lado === "largos" ? vela.low > p.liq : vela.high < p.liq);
    const d = oiAhora - oiAntes;
    if (d > 0) {
      const usd = d * vela.close;
      for (const { x, peso } of C3.apalancamientos) {
        this.pos.push({ liq: vela.close * (1 - 1 / x + mm), lado: "largos", usd: usd * peso / 2 });
        this.pos.push({ liq: vela.close * (1 + 1 / x - mm), lado: "cortos", usd: usd * peso / 2 });
      }
    } else if (d < 0 && oiAntes > 0) {
      const f = 1 + d / oiAntes;
      this.pos = this.pos.map((p) => ({ ...p, usd: p.usd * f }));
    }
  }
};
function agruparClusters(pos, precio) {
  if (!(precio > 0)) return [];
  const tramos = /* @__PURE__ */ new Map();
  for (const p of pos) {
    const k = tramoDe(p.liq, precio);
    const clave = `${k}-${p.lado}`;
    const c = tramos.get(clave);
    if (c) c.usd += p.usd;
    else {
      const centro = centroDe(k, precio);
      tramos.set(clave, { precio: centro, distPct: (centro / precio - 1) * 100, usd: p.usd, lado: p.lado });
    }
  }
  return [...tramos.values()].filter((c) => c.usd > 0).sort((a, b) => Math.abs(a.distPct) - Math.abs(b.distPct));
}

// src/lib/modulos/s1OrderFlow.ts
var C4 = CFG.s1OrderFlow;
var imbalance = (compra, venta) => compra + venta > 0 ? (compra - venta) / (compra + venta) : 0;
function zVentana(velas, n, muestras) {
  if (velas.length < n + 10) return { actual: 0, z: null };
  const acumC = [0], acumV = [0];
  for (const v of velas) {
    acumC.push(acumC[acumC.length - 1] + v.compraUsd);
    acumV.push(acumV[acumV.length - 1] + v.ventaUsd);
  }
  const imbHasta = (fin2) => imbalance(acumC[fin2] - acumC[fin2 - n], acumV[fin2] - acumV[fin2 - n]);
  const fin = velas.length;
  const actual = imbHasta(fin);
  const dist = [];
  for (let f = Math.max(n, fin - muestras); f < fin; f++) dist.push(imbHasta(f));
  if (dist.length < 20) return { actual, z: null };
  const m = dist.reduce((s, x) => s + x, 0) / dist.length;
  const sd = Math.sqrt(dist.reduce((s, x) => s + (x - m) ** 2, 0) / (dist.length - 1));
  return { actual, z: sd > 0 ? (actual - m) / sd : 0 };
}
var HORAS = { "1h": 1, "4h": 4, "1d": 24 };
function evaluarS1(velasHora) {
  const muestras = C4.diasDistribucion * 24;
  const porVentana = {};
  let suma = 0, pesos = 0;
  for (const w of Object.keys(HORAS)) {
    const r = zVentana(velasHora, HORAS[w], muestras);
    porVentana[w] = { imbalance: r.actual, z: r.z };
    const p = C4.pesosVentana[w];
    if (r.z !== null) {
      suma += p * r.z;
      pesos += p;
    }
  }
  const z = pesos > 0 ? suma / pesos : null;
  return { score: z === null ? 0 : clamp1(z / C4.escalaZ), z, porVentana };
}
function evaluarS1Semanal(velasDia) {
  const r = zVentana(velasDia, 7, C4.diasSemanal);
  return { score: r.z === null ? 0 : clamp1(r.z / C4.escalaZ), z: r.z, imbalance7d: r.actual };
}

// src/lib/modulos/s2Cvd.ts
var C5 = CFG.s2Cvd;
var MIN2 = 6e4;
var DIA = 864e5;
var ANCLAS = C5.anclasUTC.map((h) => {
  const [hh, mm] = h.split(":").map(Number);
  return (hh * 60 + mm) * MIN2;
});
var NOMBRES = ["Asia", "Londres", "Nueva York"];
function sesionDe(ms) {
  const dia = Math.floor(ms / DIA) * DIA;
  let s = { inicio: dia - DIA + ANCLAS[ANCLAS.length - 1], nombre: NOMBRES[ANCLAS.length - 1] };
  ANCLAS.forEach((a, i) => {
    if (ms >= dia + a) s = { inicio: dia + a, nombre: NOMBRES[i] };
  });
  return s;
}
function barrasCvd(velas, ancla, minutos = C5.minutosPorBarra) {
  const out = [];
  let cvd = 0;
  for (const v of velas) {
    if (v.time < ancla) continue;
    cvd += 2 * v.compraUsd - v.volUsd;
    const t = ancla + Math.floor((v.time - ancla) / (minutos * MIN2)) * minutos * MIN2;
    const b = out[out.length - 1];
    if (!b || b.t !== t) out.push({ t, alto: v.high, bajo: v.low, cierre: v.close, cvdAlto: cvd, cvdBajo: cvd, cvd, vol: v.volUsd });
    else {
      b.alto = Math.max(b.alto, v.high);
      b.bajo = Math.min(b.bajo, v.low);
      b.cierre = v.close;
      b.cvdAlto = Math.max(b.cvdAlto, cvd);
      b.cvdBajo = Math.min(b.cvdBajo, cvd);
      b.cvd = cvd;
      b.vol += v.volUsd;
    }
  }
  return out;
}
function divergencias(barras, n = C5.ventanaDivergencia) {
  const out = [];
  const mitad = Math.floor(n / 2);
  for (let k = n - 1; k < barras.length; k++) {
    const a = barras.slice(k - n + 1, k - n + 1 + mitad), b = barras.slice(k - n + 1 + mitad, k + 1);
    const maxP = (x) => Math.max(...x.map((y) => y.alto)), minP = (x) => Math.min(...x.map((y) => y.bajo));
    const maxC = (x) => Math.max(...x.map((y) => y.cvdAlto)), minC = (x) => Math.min(...x.map((y) => y.cvdBajo));
    if (maxP(b) > maxP(a) && maxC(b) < maxC(a)) out.push({ indice: k, t: barras[k].t, tipo: "bajista" });
    else if (minP(b) < minP(a) && minC(b) > minC(a)) out.push({ indice: k, t: barras[k].t, tipo: "alcista" });
  }
  return out;
}
function liderazgo(cvdSpot, volSpot, cvdPerp, volPerp, dPrecio) {
  const s = volSpot > 0 ? cvdSpot / volSpot : 0, p = volPerp > 0 ? cvdPerp / volPerp : 0;
  const d = Math.sign(dPrecio);
  const sOk = d !== 0 && Math.sign(s) === d, pOk = d !== 0 && Math.sign(p) === d;
  if (sOk && pOk) return { lider: "ambos", mult: 1 };
  if (sOk) return { lider: "spot", mult: C5.multSpotLidera };
  if (pOk) return { lider: "perp", mult: C5.multPerpLidera };
  return { lider: "ninguno", mult: 1 };
}
function evaluarS2(spot, perp, ahora) {
  const sesion = sesionDe(ahora);
  const bs = barrasCvd(spot, sesion.inicio), bp = barrasCvd(perp, sesion.inicio);
  const porMin = new Map(spot.map((v) => [v.time, v]));
  const combinado = perp.map((v) => {
    const s = porMin.get(v.time);
    return s ? { ...v, volUsd: v.volUsd + s.volUsd, compraUsd: v.compraUsd + s.compraUsd } : v;
  });
  const bc = barrasCvd(combinado, sesion.inicio);
  const suficiente = bc.length >= C5.ventanaDivergencia;
  const base = { score: 0, suficiente, sesion, barrasSpot: bs, barrasPerp: bp, divergencias: [], vigente: null, lider: "ninguno", mult: 1, tendencia: 0 };
  if (!suficiente) return base;
  const divs = divergencias(bc);
  const ultima = divs.at(-1) ?? null;
  const vigente = ultima && bc.length - 1 - ultima.indice <= C5.barrasVigencia ? ultima : null;
  const absorcion = vigente ? (vigente.tipo === "alcista" ? 1 : -1) * (1 - (bc.length - 1 - vigente.indice) / (C5.barrasVigencia + 1)) : 0;
  const volC = bc.reduce((s, b) => s + b.vol, 0);
  const tendencia = volC > 0 ? bc[bc.length - 1].cvd / volC : 0;
  const dPrecio = bc[bc.length - 1].cierre - bc[0].cierre;
  const sumV = (b) => b.reduce((s, x) => s + x.vol, 0);
  const { lider, mult } = liderazgo(bs.at(-1)?.cvd ?? 0, sumV(bs), bp.at(-1)?.cvd ?? 0, sumV(bp), dPrecio);
  const score = clamp1((C5.pesoAbsorcion * absorcion + C5.pesoTendencia * clamp1(tendencia / C5.escalaTendencia)) * mult);
  return { ...base, score, divergencias: divs, vigente, lider, mult, tendencia };
}

// src/lib/modulos/m1Funding.ts
var C6 = CFG.m1Funding;
function zonaFunding(f) {
  const a = Math.abs(f);
  if (a <= C6.neutroAbs) return "neutro";
  if (a > C6.extremoAbs) return "extremo";
  if (a >= C6.overcrowdedMin) return "overcrowded";
  return "normal";
}

// src/lib/modulos/s3FundingBasis.ts
var C1 = CFG.m1Funding;
var C32 = CFG.s3Basis;
function evaluarS3(e) {
  const pf = percentilDe(e.funding, e.fundingHist);
  const pb = e.basis !== null && e.basisHist.length > 30 ? percentilDe(e.basis, e.basisHist) : null;
  const oiSube = e.oiCambio4hPct !== null && e.oiCambio4hPct > C1.oiCambio4hTrampaPct;
  const cerca = (d) => d !== null && d <= C1.distanciaNivelPct;
  const confianza = [e.fundingHist.length > 30, pb !== null, e.oiCambio4hPct !== null].filter(Boolean).length / 3;
  const largos = { funding: pf >= C1.percentilTrampaAlto, oi: oiSube, basis: pb !== null && pb >= C32.percentilTrampaAlto, nivel: cerca(e.distResistenciaPct) };
  const cortos = { funding: pf <= C1.percentilTrampaBajo, oi: oiSube, basis: pb !== null && pb <= C32.percentilTrampaBajo, nivel: cerca(e.distSoportePct) };
  const todos = (p) => p.funding && p.oi && p.basis && p.nivel;
  const zona = zonaFunding(e.funding);
  if (todos(largos)) return { score: -C1.scoreTrampa, confianza, percentilFunding: pf, percentilBasis: pb, zona, trampa: "largos", pilares: largos };
  if (todos(cortos)) return { score: C1.scoreTrampa, confianza, percentilFunding: pf, percentilBasis: pb, zona, trampa: "cortos", pilares: cortos };
  let s = -C1.pesoContrarian * clamp1((pf - 50) / 50);
  if (pb !== null) s += -C32.pesoContrarian * clamp1((pb - 50) / 50);
  if (e.oiCambio4hPct !== null && e.precioCambio4hPct !== null && e.oiCambio4hPct > 0) {
    s += C1.pesoConfirmacionOI * Math.sign(e.precioCambio4hPct) * clamp2(e.oiCambio4hPct / C1.oiCambio4hTrampaPct, 0, 1);
  }
  const masCerca = pf >= 50 ? largos : cortos;
  return { score: clamp1(s), confianza, percentilFunding: pf, percentilBasis: pb, zona, trampa: null, pilares: masCerca };
}
function scoreFunding7d(hist) {
  const n = 21;
  if (hist.length < n + 20) return { score: 0, promedio: null, percentil: null };
  const medias = [];
  let suma = hist.slice(0, n).reduce((s, x) => s + x, 0);
  medias.push(suma / n);
  for (let i = n; i < hist.length; i++) {
    suma += hist[i] - hist[i - n];
    medias.push(suma / n);
  }
  const actual = medias[medias.length - 1];
  const p = percentilDe(actual, medias.slice(0, -1));
  return { score: -clamp1((p - 50) / 50), promedio: actual, percentil: p };
}

// src/lib/modulos/s4Liquidaciones.ts
var C7 = CFG.s4Liquidaciones;
var fraccionReferencia = (oiUsdBTC) => oiUsdBTC && oiUsdBTC > 0 ? C7.clusterReferenciaUsdBTC / oiUsdBTC : null;
function evaluarS4(clusters4h, oiUsd, fracRef, tendenciaCvd) {
  const vacio = { score: 0, relevantes: [], dominante: 0, objetivo: null, invertido: false, umbralUsd: null };
  if (!(oiUsd > 0) || fracRef === null) return vacio;
  const umbralUsd = fracRef * oiUsd;
  const relevantes = clusters4h.filter((c) => Math.abs(c.distPct) >= C7.distanciaMinPct && Math.abs(c.distPct) <= C7.distanciaMaxPct && c.usd >= umbralUsd);
  if (!relevantes.length) return { ...vacio, umbralUsd };
  const tiron = (c) => c.usd / oiUsd * Math.pow(0.5, Math.abs(c.distPct) / C7.semividaPct);
  const arriba = relevantes.filter((c) => c.distPct > 0).reduce((s, c) => s + tiron(c), 0);
  const abajo = relevantes.filter((c) => c.distPct < 0).reduce((s, c) => s + tiron(c), 0);
  const dominante = arriba >= abajo ? 1 : -1;
  const lado = relevantes.filter((c) => Math.sign(c.distPct) === dominante);
  const objetivo = lado.reduce((m, c) => tiron(c) > tiron(m) ? c : m, lado[0]);
  let score = dominante * clamp1(Math.max(arriba, abajo) / fracRef);
  const u = C7.umbralCvdConfluencia;
  const invertido = dominante === -1 && tendenciaCvd > u || dominante === 1 && tendenciaCvd < -u;
  if (invertido) score = -score;
  return { score, relevantes, dominante, objetivo, invertido, umbralUsd };
}

// src/lib/modulos/s5Skew.ts
var C8 = CFG.s5Skew;
var DIA2 = 864e5;
var ANIO = 365 * DIA2;
var HORA2 = 36e5;
function toleranciaDe(h, ahora) {
  const t = h.filter((m) => m.t >= ahora - 7 * DIA2).map((m) => m.t).sort((a, b) => a - b);
  const huecos = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
  if (!huecos.length) return C8.toleranciaMinHoras * HORA2;
  const mediano = huecos[Math.floor(huecos.length / 2)];
  return Math.min(C8.toleranciaMaxHoras * HORA2, Math.max(C8.toleranciaMinHoras * HORA2, mediano * C8.toleranciaMultHueco));
}
function muestraHace(h, serie, t, tol) {
  let mejor = null;
  for (const m of h) if (m[serie] !== null && Math.abs(m.t - t) <= tol && (!mejor || Math.abs(m.t - t) < Math.abs(mejor.t - t))) mejor = m;
  if (mejor) return { v: mejor[serie], edadMs: 0 };
  let previa = null;
  for (const m of h) if (m[serie] !== null && m.t <= t && m.t >= t - DIA2 && (!previa || m.t > previa.t)) previa = m;
  return previa ? { v: previa[serie], edadMs: t - previa.t } : null;
}
function valorHace(h, serie, t, tol) {
  return muestraHace(h, serie, t, tol)?.v ?? null;
}
function cambios(h, serie, desde, tol) {
  const out = [];
  for (const m of h) {
    if (m.t < desde || m[serie] === null) continue;
    const antes = valorHace(h, serie, m.t - C8.horasCambio * HORA2, tol);
    if (antes !== null) out.push(m[serie] - antes);
  }
  return out;
}
function diasConMuestras(h, serie, ahora) {
  const porDia = /* @__PURE__ */ new Map();
  for (const m of h) {
    if (m[serie] === null || m.t < ahora - C8.diasDistribucion * DIA2) continue;
    const d = Math.floor(m.t / DIA2);
    porDia.set(d, (porDia.get(d) ?? 0) + 1);
  }
  let n = 0;
  for (const c of porDia.values()) if (c >= C8.muestrasPorDiaMin) n++;
  return n;
}
function giroEth(h, ahora) {
  const tol = toleranciaDe(h, ahora);
  const ventana = h.filter((m) => m.t >= ahora - C8.horasConfirmacion * HORA2 && m.eth7 !== null);
  let ultimo = null;
  let prev = null;
  for (const m of ventana) {
    const antes = valorHace(h, "eth7", m.t - C8.horasCambio * HORA2, tol);
    if (antes === null) continue;
    const d = m.eth7 - antes;
    if (prev !== null && Math.sign(d) !== Math.sign(prev) && Math.abs(d) >= C8.umbralGiro) {
      ultimo = { t: m.t, direccion: Math.sign(d), confirmado: false, horasRestantes: 0 };
    }
    prev = d;
  }
  if (!ultimo) return null;
  const btcAhora = valorHace(h, "btc7", ahora, tol) ?? h.at(-1)?.btc7 ?? null;
  const btcAlGiro = valorHace(h, "btc7", ultimo.t, tol);
  const confirmado = btcAhora !== null && btcAlGiro !== null && Math.sign(btcAhora - btcAlGiro) === ultimo.direccion;
  const horasRestantes = Math.max(0, C8.horasConfirmacion - (ahora - ultimo.t) / HORA2);
  return { ...ultimo, confirmado, horasRestantes };
}
function evaluarS5(h, actual, activo) {
  const serie = activo === "ETH" ? "eth7" : "btc7";
  const s30 = activo === "ETH" ? "eth30" : "btc30";
  const todo = [...h.filter((m) => m.t < actual.t - 30 * 6e4), actual];
  const rr7 = actual[serie], rr30 = actual[s30];
  const tol = toleranciaDe(todo, actual.t);
  const ref = rr7 === null ? null : muestraHace(todo, serie, actual.t - C8.horasCambio * HORA2, tol);
  const cambio24h = rr7 !== null && ref ? rr7 - ref.v : null;
  const castigoEdad = ref ? Math.max(0.3, 1 - Math.max(0, ref.edadMs - tol) / DIA2) : 0;
  const vol = cambios(todo, serie, actual.t - C8.diasVolCambio * DIA2, tol);
  const sd = vol.length > 5 ? Math.sqrt(vol.reduce((s, x) => s + x * x, 0) / vol.length) : null;
  const z = cambio24h !== null && sd ? cambio24h / sd : null;
  const dist = todo.filter((m) => m.t >= actual.t - C8.diasDistribucion * DIA2 && m[serie] !== null).map((m) => m[serie]);
  const percentil = rr7 !== null && dist.length >= C8.muestrasMinimas ? percentilDe(rr7, dist) : null;
  const giro = giroEth(todo, actual.t);
  let score = z === null ? 0 : -clamp1(z / C8.escalaZ);
  const prematuro = !!giro && !giro.confirmado && giro.horasRestantes > 0 && Math.sign(-score) === giro.direccion;
  if (prematuro) score *= C8.castigoPrematuro;
  const muestras = dist.length;
  const diasCubiertos = diasConMuestras(todo, serie, actual.t);
  const esActivo = diasCubiertos >= C8.diasMinimos;
  const confianza = Math.min(1, diasCubiertos / (C8.diasMinimos * 4)) * (z === null ? 0 : castigoEdad);
  return {
    score: esActivo ? score : 0,
    confianza,
    rr7,
    rr30,
    cambio24h,
    z,
    percentil,
    giro,
    prematuro,
    muestras,
    diasCubiertos,
    activo: esActivo,
    toleranciaHoras: tol / HORA2,
    edadReferenciaHoras: ref ? ref.edadMs / HORA2 : 0
  };
}

// src/lib/modulos/s6Netflows.ts
var C9 = CFG.s6Netflows;
var MIN_EXCHANGES_MISMO_SIGNO = 2;
var MAX_CONCENTRACION = 0.8;
function esMultiEntidad(d) {
  const vals = Object.values(d.porExchange).filter((v) => v !== 0);
  const signo = Math.sign(d.neto);
  if (signo === 0) return false;
  const mismo = vals.filter((v) => Math.sign(v) === signo).length;
  const totalAbs = vals.reduce((s, v) => s + Math.abs(v), 0);
  const mayor = Math.max(0, ...vals.map((v) => Math.abs(v)));
  return mismo >= MIN_EXCHANGES_MISMO_SIGNO && totalAbs > 0 && mayor / totalAbs <= MAX_CONCENTRACION;
}
function evaluarS6(dias, ahora) {
  const orden = [...dias].sort((a, b) => a.t - b.t);
  const ult30 = orden.slice(-C9.diasZ);
  const ult7 = orden.slice(-C9.diasRacha);
  const validos = (x) => x.filter(esMultiEntidad);
  const salidas7 = validos(ult7).filter((d) => d.neto < 0).length;
  const entradas7 = validos(ult7).filter((d) => d.neto > 0).length;
  let z = null;
  if (ult30.length >= 10) {
    const v = ult30.slice(0, -1).map((d) => d.neto);
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
    z = sd > 0 ? (orden[orden.length - 1].neto - m) / sd : 0;
  }
  const a\u00F1o = orden.slice(-365).map((d) => d.neto).sort((a, b) => a - b);
  const p95 = a\u00F1o.length >= 60 ? a\u00F1o[Math.floor(C9.percentilSpike / 100 * a\u00F1o.length)] : null;
  const spike = p95 === null ? null : [...orden].reverse().find((d) => d.t >= ahora - C9.horasSpike * 36e5 && d.neto > p95 && esMultiEntidad(d)) ?? null;
  let regimen = "NEUTRO";
  let score = z === null ? 0 : -clamp1(z / C9.escalaZ) * 0.5;
  if (salidas7 >= C9.minDiasRacha) {
    regimen = "ACUMULACI\xD3N";
    score = clamp1(0.6 + 0.4 * Math.max(0, -(z ?? 0)) / C9.escalaZ);
  } else if (entradas7 >= C9.minDiasRacha) {
    regimen = "DISTRIBUCI\xD3N";
    score = -clamp1(0.6 + 0.4 * Math.max(0, z ?? 0) / C9.escalaZ);
  }
  if (spike) score = Math.min(score, -0.8);
  return { score, z, regimen, salidas7, entradas7, spike, ultimos: orden.slice(-30), ignorados: ult30.filter((d) => d.neto !== 0 && !esMultiEntidad(d)).length };
}

// src/lib/sessions.ts
var HOUR = 36e5;
var DAY = 24 * HOUR;
var LIMA_OFFSET = -5 * HOUR;
var SESSIONS = [
  { key: "tokyo", name: "Tokio", tz: "Asia/Tokyo", open: [9, 0], close: [15, 30], col: "#D08A57" },
  { key: "london", name: "Londres", tz: "Europe/London", open: [8, 0], close: [16, 30], col: "#7F95B0" },
  { key: "ny", name: "Nueva York", tz: "America/New_York", open: [9, 30], close: [16, 0], col: "#C9A227" }
];
var fmtCache = /* @__PURE__ */ new Map();
function partsFmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    fmtCache.set(tz, f);
  }
  return f;
}
function tzOffset(ts, tz) {
  const p = {};
  for (const x of partsFmt(tz).formatToParts(new Date(ts))) {
    if (x.type !== "literal") p[x.type] = Number(x.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1e3) * 1e3;
}
function zonedToUtc(y, m, d, hh, mm, tz) {
  const guess = Date.UTC(y, m, d, hh, mm);
  let ts = guess - tzOffset(guess, tz);
  ts = guess - tzOffset(ts, tz);
  return ts;
}
function sessionIntervals(s, from, to) {
  const out = [];
  const first = Math.floor(from / DAY) * DAY - 2 * DAY;
  for (let t = first; t <= to + 2 * DAY; t += DAY) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), dd = d.getUTCDate();
    const start = zonedToUtc(y, m, dd, s.open[0], s.open[1], s.tz);
    const end = zonedToUtc(y, m, dd, s.close[0], s.close[1], s.tz);
    if (end > from && start < to) out.push({ start, end });
  }
  return out;
}

// src/lib/sweeps.ts
var SWEEP_DEFAULT = { lookback: 20, volMult: 1.5, strict: false };
var HORIZ = [4, 12, 24];
var PIVOTE_MIN = 3;
var MECHA_MIN = 0.5;
function killzoneDe(kl) {
  if (!kl.length) return () => null;
  const from = kl[0].time, to = kl[kl.length - 1].time + HOUR;
  const zonas = [];
  for (const s of SESSIONS) {
    if (s.key === "tokyo") continue;
    const k = s.key === "london" ? "Londres" : "Nueva York";
    for (const iv of sessionIntervals(s, from, to)) zonas.push({ k, start: iv.start, end: iv.start + 2 * HOUR });
  }
  return (t) => zonas.find((z) => t >= z.start && t < z.end)?.k ?? null;
}
function detectSweeps(kl, cfg, conKillzones = false) {
  const n = kl.length, { lookback, volMult } = cfg;
  const ultimaCerrada = n - 2;
  const kz = conKillzones ? killzoneDe(kl) : () => null;
  const crudos = [];
  for (let i = lookback; i < n; i++) {
    const c = kl[i];
    let lo = Infinity, hi = -Infinity, loI = -1, hiI = -1, vol = 0;
    for (let j = i - lookback; j < i; j++) {
      if (kl[j].low < lo) {
        lo = kl[j].low;
        loI = j;
      }
      if (kl[j].high > hi) {
        hi = kl[j].high;
        hiI = j;
      }
      vol += kl[j].volume;
    }
    const avg = vol / lookback;
    const vr = avg > 0 ? c.volume / avg : 0;
    if (vr < volMult) continue;
    const live = i === n - 1;
    const rango = c.high - c.low || Number.EPSILON;
    const sig = i + 1 <= ultimaCerrada ? kl[i + 1] : null;
    const evento = (type, level, levelIndex) => {
      const bull = type === "bull";
      const wickRatio = bull ? (Math.min(c.open, c.close) - c.low) / rango : (c.high - Math.max(c.open, c.close)) / rango;
      const pivot = levelIndex <= i - PIVOTE_MIN;
      const confirm = sig ? bull ? sig.close > level : sig.close < level : null;
      const puntos = (wickRatio >= MECHA_MIN ? 1 : 0) + (pivot ? 1 : 0) + (confirm ? 1 : 0) + (vr >= volMult * 1.5 ? 1 : 0);
      const grade = confirm && puntos >= 3 ? "A" : puntos >= 2 ? "B" : "C";
      const dir = bull ? 1 : -1;
      const out = HORIZ.map((h) => i + h <= ultimaCerrada ? dir * (kl[i + h].close - c.close) / c.close * 100 : null);
      let mae = null;
      if (i + 24 <= ultimaCerrada) {
        let ext = c.close;
        for (let j = i + 1; j <= i + 24; j++) ext = bull ? Math.min(ext, kl[j].low) : Math.max(ext, kl[j].high);
        mae = -Math.abs(ext - c.close) / c.close * 100;
      }
      return {
        index: i,
        first: i,
        count: 1,
        time: c.time,
        type,
        level,
        levelIndex,
        wick: bull ? c.low : c.high,
        close: c.close,
        volRatio: vr,
        wickRatio,
        pivot,
        confirm,
        grade,
        live,
        killzone: kz(c.time),
        out,
        mae
      };
    };
    if (c.low < lo && c.close > lo) crudos.push(evento("bull", lo, loI));
    if (c.high > hi && c.close < hi) crudos.push(evento("bear", hi, hiI));
  }
  const grupos = [];
  let ultimoDe = { bull: null, bear: null };
  for (const e of crudos) {
    const g = ultimoDe[e.type];
    if (g && e.index - g.hasta <= 2) {
      g.hasta = e.index;
      const rep = e.volRatio > g.ev.volRatio ? { ...e, first: g.ev.first, count: g.ev.count + 1 } : { ...g.ev, count: g.ev.count + 1 };
      grupos[grupos.indexOf(g.ev)] = rep;
      g.ev = rep;
    } else {
      grupos.push(e);
      ultimoDe = { ...ultimoDe, [e.type]: { ev: e, hasta: e.index } };
    }
  }
  if (!cfg.strict) return grupos;
  return grupos.filter((e) => e.wickRatio >= MECHA_MIN && e.pivot && e.confirm !== false);
}

// src/lib/modulos/gatillo.ts
var G = CFG.gatillo;
function mss(velas, dir, n = G.ventanaMSS, recientes = G.velasRecientes) {
  const ultima = velas.length - 2;
  for (let k = ultima; k >= Math.max(n, ultima - recientes + 1); k--) {
    const previas = velas.slice(k - n, k);
    const rompe = dir > 0 ? velas[k].close > Math.max(...previas.map((v) => v.high)) : velas[k].close < Math.min(...previas.map((v) => v.low));
    if (rompe) return ultima - k;
  }
  return null;
}
function gatillo(velas15m, dir) {
  if (!velas15m || velas15m.length < G.ventanaMSS + 5) return { ok: false, tipo: null, hace: null };
  const ultima = velas15m.length - 2;
  const sw = detectSweeps(velas15m, SWEEP_DEFAULT).filter((e) => !e.live && e.index >= ultima - G.velasRecientes + 1 && (e.type === "bull" ? 1 : -1) === dir).at(-1);
  if (sw) return { ok: true, tipo: "sweep", hace: ultima - sw.index };
  const m = mss(velas15m, dir);
  if (m !== null) return { ok: true, tipo: "mss", hace: m };
  return { ok: false, tipo: null, hace: null };
}

// src/lib/modulos/scoreMaestro.ts
var IDS = ["orderflow", "cvd", "funding", "liquidaciones", "skew", "mtf"];
var IDS_SWING = ["netflows", "orderflowSemanal", "skew", "funding7d"];
function sumar(comps, ids, pesos, normalizar) {
  const suma = ids.reduce((s, id) => s + Math.max(0, pesos[id] ?? 0), 0);
  const escala = normalizar && suma > 0 ? 1 / suma : 1;
  const aportes = ids.map((id) => {
    const c = comps.find((x) => x.id === id);
    const usable = !!c && c.estado === "ok";
    const score = usable ? clamp1(c.score) : 0;
    const confianza = usable ? clamp2(c.confianza, 0, 1) : 0;
    const peso = Math.max(0, pesos[id] ?? 0);
    const pesoEfectivo = peso * escala;
    return { id, score, confianza, peso, pesoEfectivo, aporte: pesoEfectivo * score * confianza || 0, estado: c?.estado ?? "caido" };
  });
  return { total: clamp1(aportes.reduce((s, a) => s + a.aporte, 0)), aportes };
}
var PESOS = CFG.scoreMaestro.pesos;
var PESOS_SWING = CFG.scoreSwing.pesos;
var NOTAS_PESOS = CFG.scoreMaestro.notasPesos;
var NOTAS_PESOS_SWING = CFG.scoreSwing.notasPesos;
function scoreSwing(comps, pesos = PESOS_SWING) {
  const r = sumar(comps, IDS_SWING, pesos, CFG.scoreSwing.normalizarPesos);
  return { score: r.total, aportes: r.aportes };
}
function scoreMaestro(comps, ctx, pesos = PESOS) {
  const SM = CFG.scoreMaestro;
  const { total: bruto, aportes } = sumar(comps, IDS, pesos, SM.normalizarPesos);
  const usarRegimen = SM.regimenComoCompuerta;
  const final = bruto > 0 && usarRegimen ? clamp1(bruto * multiplicadorLargos(ctx.m3)) : bruto;
  const dir = final > 0 ? 1 : final < 0 ? -1 : 0;
  const convergencia = dir === 0 ? 0 : ctx.porTF.filter((s) => Math.sign(s) === dir).length;
  const umbral = ctx.macro.umbral;
  const bloqueos = [];
  if (ctx.macro.bloqueaAperturas) bloqueos.push(`Evento ${ctx.macro.activo?.tipo ?? "macro"}: sin aperturas`);
  if (ctx.bloqueoDiarioHasta) bloqueos.push("P\xE9rdida diaria \u2265 l\xEDmite: sin aperturas hasta 00:00 UTC");
  const riskOff = usarRegimen && !!ctx.m3?.riskOff;
  if ((riskOff || ctx.defensivo) && convergencia < 3) {
    bloqueos.push(`${riskOff ? "Risk-off" : "Modo defensivo"}: requiere convergencia 3/3 (${convergencia}/3)`);
  }
  const g = dir === 0 || !ctx.gatillo ? null : dir > 0 ? ctx.gatillo.largo : ctx.gatillo.corto;
  if (CFG.gatillo.exigir && Math.abs(final) > umbral && dir !== 0 && !g?.ok) bloqueos.push("Esperando gatillo en 15 m (sweep o cambio de estructura)");
  const multSwing = dir === 0 ? 1 : clamp2(1 + CFG.scoreSwing.modulacionTamano * ctx.swing * dir, 0.5, 1.5);
  const multTamano = ctx.macro.multiplicadorTamano * (ctx.defensivo ? CFG.m4Riesgo.multiplicadorDefensivo : 1) * multSwing;
  const abrir = Math.abs(final) > umbral && bloqueos.length === 0;
  return { bruto, final, dir, umbral, convergencia, multTamano, multSwing, gatillo: g, abrir, bloqueos, aportes, swing: ctx.swing };
}

// src/lib/cadencia.ts
var DIA3 = 864e5;
function medirCadencia(tiempos, ahora, ventanaDias = 7) {
  const desde = ahora - ventanaDias * DIA3;
  const t = [...tiempos].filter((x) => Number.isFinite(x) && x >= desde && x <= ahora).sort((a, b) => a - b);
  const vacio = { muestras: t.length, corridasPorDia: null, huecoMedianoMs: null, huecoMaxMs: null, ultimoHuecoMs: t.length ? ahora - t[t.length - 1] : null, ventanaDias };
  if (t.length < 2) return vacio;
  const huecos = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
  const mediana = huecos[Math.floor(huecos.length / 2)];
  const cubierto = Math.min(ventanaDias * DIA3, Math.max(t[t.length - 1] - t[0], DIA3 / 24));
  return {
    ...vacio,
    corridasPorDia: (t.length - 1) / (cubierto / DIA3),
    huecoMedianoMs: mediana,
    huecoMaxMs: huecos[huecos.length - 1]
  };
}

// scripts/bitacora.ts
var SALIDA = process.argv[2] ?? "mirofish/datos";
var PUBLICADO = process.env.PUBLICADO ?? "https://kippuu.com/mirofish/datos/";
var RAMA = process.env.RAMA_DATOS ?? "https://raw.githubusercontent.com/eter369/veta-oro-revolucion/datos/mirofish/datos/";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
var ACTIVOS = ["BTC", "ETH", "SOL"];
var H = 36e5;
var D = 24 * H;
var MIN3 = 6e4;
var VISION = "https://data-api.binance.vision/api/v3";
var OKX = "https://www.okx.com/api/v5";
var SIM = { vision: { BTC: "BTCUSDT", ETH: "ETHUSDT", SOL: "SOLUSDT" }, okx: { BTC: "BTC-USDT-SWAP", ETH: "ETH-USDT-SWAP", SOL: "SOL-USDT-SWAP" }, okxIdx: { BTC: "BTC-USDT", ETH: "ETH-USDT", SOL: "SOL-USDT" }, coinbase: { BTC: "BTC-USD", ETH: "ETH-USD", SOL: "SOL-USD" }, kraken: { BTC: "XBTUSD", ETH: "ETHUSD", SOL: "SOLUSD" } };
var VERSION = 1;
var RETENCION_DIAS = 400;
var LIQ_RETENCION_DIAS = 30;
var espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function traer(url, intentos = 2) {
  let err = null;
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(25e3) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      err = e;
      await espera(800 * (i + 1));
    }
  }
  throw err;
}
async function okx(path) {
  const j = await traer(`${OKX}${path}`);
  if (j.code !== "0") throw new Error(`OKX ${j.code} ${j.msg} ${path}`);
  await espera(120);
  return j.data;
}
async function candidatos(nombre) {
  const out = [];
  for (const [origen, base] of [["publicado", PUBLICADO], ["rama datos", RAMA]]) {
    try {
      out.push({ origen, v: await traer(`${base}${nombre}?v=${Date.now()}`, 1) });
    } catch {
    }
  }
  const local = join(SALIDA, nombre);
  if (existsSync(local)) {
    try {
      out.push({ origen: "local", v: JSON.parse(readFileSync(local, "utf8")) });
    } catch {
    }
  }
  return out;
}
var CAMPOS = [
  "t",
  "activo",
  "precio",
  "corrida",
  "s1Score",
  "s1Z",
  "s1Conf",
  "s1Imb1h",
  "s1Imb4h",
  "s1Imb1d",
  "s1SemScore",
  "vivoBinanceImb",
  "vivoCoinbaseImb",
  "vivoKrakenImb",
  "vivoOkxImb",
  "vivoUsd",
  "vivoVentanaSeg",
  "perpCompraUsd1h",
  "perpVolUsd1h",
  "s2Score",
  "s2Suf",
  "s2Lider",
  "s2Mult",
  "s2Tend",
  "s2Sesion",
  "s3Score",
  "s3Conf",
  "s3Funding",
  "s3PctFunding",
  "s3Basis",
  "s3PctBasis",
  "s3Oi4hPct",
  "s3Trampa",
  "f7dScore",
  "s4Score",
  "s4Conf",
  "s4Dominante",
  "s4ObjDist",
  "s4ObjUsd",
  "s4Invertido",
  "oiUsd",
  "s5Score",
  "s5Conf",
  "s5Rr7",
  "s5Z",
  "s5Activo",
  "s5Dias",
  "s6Score",
  "s6Z",
  "s6Regimen",
  "mtfScore",
  "mtf4h",
  "mtf1d",
  "mtf1w",
  "m3Score",
  "riskOff",
  "macroFase",
  "gatLargo",
  "gatCorto",
  "maestroBruto",
  "maestroFinal",
  "maestroDir",
  "maestroAbrir",
  "maestroBloqueos",
  "encargoBruto",
  "encargoFinal",
  "swing",
  "r1h",
  "r4h",
  "r24h",
  "r7d"
];
var col = (c) => CAMPOS.indexOf(c);
var r4 = (v) => v === null || v === void 0 || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4;
async function vision(a, intervalo, limite, desde) {
  const r = await traer(`${VISION}/klines?symbol=${SIM.vision[a]}&interval=${intervalo}&limit=${limite}${desde ? `&startTime=${desde}` : ""}`);
  return r.map((k) => ({ time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volUsd: +k[7], compraUsd: +k[10] }));
}
var aKline = (v) => ({ time: v.time, open: v.open, high: v.high, low: v.low, close: v.close, volume: v.volUsd });
var aFlujo = (v) => v.map((k) => ({ time: k.time, compraUsd: k.compraUsd, ventaUsd: k.volUsd - k.compraUsd }));
var aCvd = (v) => v.map((k) => ({ time: k.time, high: k.high, low: k.low, close: k.close, volUsd: k.volUsd, compraUsd: k.compraUsd }));
async function tradesBinance(a) {
  const r = await traer(`${VISION}/aggTrades?symbol=${SIM.vision[a]}&limit=1000`);
  return r.map((x) => ({ t: x.T, lado: x.m ? -1 : 1, usd: +x.p * +x.q }));
}
async function tradesCoinbase(a) {
  const r = await traer(`https://api.exchange.coinbase.com/products/${SIM.coinbase[a]}/trades?limit=1000`);
  return r.map((x) => ({ t: Date.parse(x.time), lado: x.side === "sell" ? 1 : -1, usd: +x.price * +x.size }));
}
async function tradesKraken(a) {
  const r = await traer(`https://api.kraken.com/0/public/Trades?pair=${SIM.kraken[a]}`);
  const lista = Object.entries(r.result).find(([k]) => k !== "last")?.[1] ?? [];
  return lista.map((x) => ({ t: +x[2] * 1e3, lado: x[3] === "b" ? 1 : -1, usd: +x[0] * +x[1] }));
}
async function tradesOkx(a) {
  const r = await okx(`/market/trades?instId=${SIM.okx[a]}&limit=500`);
  const ctVal = CT_VAL[a];
  return r.map((x) => ({ t: +x.ts, lado: x.side === "buy" ? 1 : -1, usd: +x.px * +x.sz * ctVal }));
}
function instantanea(trades, hasta) {
  if (!trades.length) return { imb: null, usd: 0, ventanaSeg: 0 };
  const desde = Math.max(Math.min(...trades.map((x) => x.t)), hasta - 5 * MIN3);
  const v = trades.filter((x) => x.t >= desde && x.t <= hasta);
  let c = 0, s = 0;
  for (const x of v) if (x.lado > 0) c += x.usd;
  else s += x.usd;
  return { imb: c + s > 0 ? imbalance(c, s) : null, usd: c + s, ventanaSeg: Math.round((hasta - desde) / 1e3) };
}
var CT_VAL = { BTC: 0.01, ETH: 0.1, SOL: 1 };
async function cargarCtVal() {
  for (const a of ACTIVOS) {
    try {
      const d = await okx(`/public/instruments?instType=SWAP&instId=${SIM.okx[a]}`);
      if (d[0]?.ctVal) CT_VAL[a] = +d[0].ctVal;
    } catch {
    }
  }
}
async function velasOkx(a, bar, limite) {
  const d = await okx(`/market/candles?instId=${SIM.okx[a]}&bar=${bar}&limit=${limite}`);
  return d.map((k) => ({ time: +k[0], high: +k[2], low: +k[3], close: +k[4], volUsd: +k[7] })).sort((x, y) => x.time - y.time);
}
async function indexOkx(a, bar, limite) {
  const d = await okx(`/market/index-candles?instId=${SIM.okxIdx[a]}&bar=${bar}&limit=${limite}`);
  return d.map((k) => ({ time: +k[0], close: +k[4] })).sort((x, y) => x.time - y.time);
}
async function takerOkx(a, periodo) {
  const d = await okx(`/rubik/stat/taker-volume?ccy=${a}&instType=CONTRACTS&period=${periodo}`);
  return d.map((x) => ({ time: +x[0], venta: +x[1], compra: +x[2] })).sort((x, y) => x.time - y.time);
}
function calibrarTaker(taker, velas, avisos, a) {
  const porT = new Map(velas.map((v) => [v.time, v]));
  let sumT = 0, sumV = 0, sumVb = 0;
  for (const t of taker) {
    const v = porT.get(t.time);
    if (!v || !v.volUsd) continue;
    sumT += t.venta + t.compra;
    sumV += v.volUsd;
    sumVb += v.volUsd / v.close;
  }
  if (!sumT || !sumV) return (v) => v;
  const enUsd = sumT / sumV, enBase = sumT / sumVb;
  if (enUsd > 0.2 && enUsd < 5) return (v) => v;
  if (enBase > 0.2 && enBase < 5) return (v, time) => v * (porT.get(time)?.close ?? 0);
  avisos.push(`${a}: taker volume de OKX con unidad desconocida (ratio USD ${enUsd.toFixed(2)}, base ${enBase.toFixed(2)}); se usa tal cual`);
  return (v) => v;
}
async function fundingOkx(a, dias) {
  const out = [];
  let after = null;
  const desde = Date.now() - dias * D;
  for (let i = 0; i < 4; i++) {
    const d = await okx(`/public/funding-rate-history?instId=${SIM.okx[a]}&limit=100${after ? `&after=${after}` : ""}`);
    if (!d.length) break;
    for (const x of d) out.push({ time: +x.fundingTime, rate: +x.fundingRate });
    after = d[d.length - 1].fundingTime;
    if (+after < desde) break;
  }
  return out.filter((x) => x.time >= desde).sort((x, y) => x.time - y.time);
}
async function oiOkx(a) {
  const d = await okx(`/rubik/stat/contracts/open-interest-volume?ccy=${a}&period=1H`);
  return d.map((x) => ({ time: +x[0], oiUsd: +x[1] })).sort((x, y) => x.time - y.time);
}
async function liquidacionesOkx(a) {
  const d = await okx(`/public/liquidation-orders?instType=SWAP&uly=${SIM.okxIdx[a]}&state=filled&limit=100`);
  const out = [];
  for (const g of d) for (const x of g.details ?? []) {
    const precio = +x.bkPx, usd = +x.sz * CT_VAL[a] * precio;
    if (precio > 0 && usd > 0) out.push({ t: +x.ts, precio, usd, lado: x.posSide === "long" ? "largos" : "cortos" });
  }
  return out;
}
async function main() {
  mkdirSync(SALIDA, { recursive: true });
  const ahora = Date.now();
  const tCierre = Math.floor(ahora / H) * H;
  const avisos = [];
  console.log(`Bit\xE1cora \xB7 corrida ${new Date(ahora).toISOString()} \xB7 ancla ${new Date(tCierre).toISOString()}`);
  const prevCands = await candidatos("bitacora.json");
  const prev = prevCands.sort((x, y) => (y.v.filas?.length ?? 0) - (x.v.filas?.length ?? 0))[0];
  const filasPrev = prev?.v.filas ?? [];
  console.log(`historial previo: ${prev ? `${filasPrev.length} filas (${prev.origen})` : "ninguno"}; candidatos: ${prevCands.map((c) => `${c.origen}=${c.v.filas?.length ?? 0}`).join(", ") || "\u2014"}`);
  if (prev && prev.v.campos && prev.v.campos.join() !== CAMPOS.join()) avisos.push(`el historial previo tiene otros campos (${prev.v.campos.length} vs ${CAMPOS.length}); se migra por nombre`);
  const migrar = (f) => {
    if (!prev?.v.campos || prev.v.campos.join() === CAMPOS.join()) return f;
    const m = new Map(prev.v.campos.map((c, i) => [c, f[i]]));
    return CAMPOS.map((c) => m.get(c) ?? null);
  };
  const filas = filasPrev.map(migrar);
  const yaHay = new Set(filas.map((f) => `${f[col("t")]}-${f[col("activo")]}`));
  const liqCands = await candidatos("liquidaciones-okx.json");
  const liqPrev = liqCands.sort((x, y) => total(y.v) - total(x.v))[0]?.v;
  const liqs = { generado: ahora, fuente: "OKX (\xF3rdenes de liquidaci\xF3n p\xFAblicas, swap USDT)", activos: { BTC: liqPrev?.activos.BTC ?? [], ETH: liqPrev?.activos.ETH ?? [], SOL: liqPrev?.activos.SOL ?? [] } };
  const [macroJ, mercadosJ, rrJ, nfJ] = await Promise.all([
    candidatos("macro.json"),
    candidatos("mercados.json"),
    candidatos("rr25.json"),
    candidatos("netflows.json")
  ]);
  const eventos = macroJ[0]?.v.eventos ?? [];
  const mercados = mercadosJ[0]?.v ?? null;
  const rr = rrJ.sort((x, y) => (y.v.muestras?.length ?? 0) - (x.v.muestras?.length ?? 0))[0]?.v.muestras ?? [];
  const netflows = nfJ[0]?.v.activos ?? null;
  let fgi = 50;
  try {
    const f = await traer("https://api.alternative.me/fng/?limit=1&format=json");
    fgi = +f.data[0].value;
  } catch {
    avisos.push("Fear & Greed no respondi\xF3: 50");
  }
  await cargarCtVal();
  const macro = estadoMacro(eventos, tCierre, CFG.scoreMaestro.umbralEntrada);
  const ok = (v) => v === null || v === void 0 ? "caido" : "ok";
  let oiBTC = [];
  try {
    oiBTC = await oiOkx("BTC");
  } catch (e) {
    avisos.push(`OI BTC OKX: ${e.message}`);
  }
  const oiBTCAhora = oiBTC.at(-1)?.oiUsd ?? null;
  const fracRef = fraccionReferencia(oiBTCAhora);
  const cierres = { BTC: /* @__PURE__ */ new Map(), ETH: /* @__PURE__ */ new Map(), SOL: /* @__PURE__ */ new Map() };
  for (const a of ACTIVOS) {
    try {
      console.log(`  ${a}\u2026`);
      const [v1h, v1d, v5m, v15, v4h, v1w] = await Promise.all([
        vision(a, "1h", 1e3),
        vision(a, "1d", 400),
        vision(a, "5m", 300, sesionDe(tCierre - 1).inicio),
        vision(a, "15m", 200),
        vision(a, "4h", 300),
        vision(a, "1w", 100)
      ]);
      for (const k of v1h) cierres[a].set(k.time + H, k.close);
      const cerradas1h = v1h.filter((k) => k.time + H <= tCierre);
      const precio = cerradas1h.at(-1)?.close ?? null;
      if (!precio) throw new Error("sin velas de 1 h");
      const k1 = cerradas1h.map(aKline);
      const k4 = v4h.filter((k) => k.time + 4 * H <= tCierre).map(aKline);
      const kd = v1d.filter((k) => k.time + D <= tCierre).map(aKline);
      const kw = v1w.filter((k) => k.time + 7 * D <= tCierre).map(aKline);
      const k15 = v15.filter((k) => k.time + 15 * MIN3 <= tCierre + 15 * MIN3).map(aKline);
      const s1 = evaluarS1(aFlujo(cerradas1h));
      const sem = evaluarS1Semanal(aFlujo(v1d.filter((k) => k.time + D <= tCierre)));
      const inst = async (fn, nombre) => {
        try {
          return instantanea(await fn(), ahora);
        } catch (e) {
          avisos.push(`${a} ${nombre}: ${e.message}`);
          return { imb: null, usd: 0, ventanaSeg: 0 };
        }
      };
      const [iB, iC, iK, iO] = [await inst(() => tradesBinance(a), "binance"), await inst(() => tradesCoinbase(a), "coinbase"), await inst(() => tradesKraken(a), "kraken"), await inst(() => tradesOkx(a), "okx")];
      let perpCvd = [], perp1h = null;
      try {
        const [velas5, taker5, taker1h] = [await velasOkx(a, "5m", 300), await takerOkx(a, "5m"), await takerOkx(a, "1H")];
        const esc = calibrarTaker(taker5, velas5, avisos, a);
        const porT = new Map(taker5.map((t) => [t.time, t]));
        const ancla = sesionDe(tCierre - 1).inicio;
        perpCvd = velas5.filter((v) => v.time >= ancla && v.time + 5 * MIN3 <= ahora).map((v) => {
          const t = porT.get(v.time);
          return { time: v.time, high: v.high, low: v.low, close: v.close, volUsd: v.volUsd, compraUsd: t ? esc(t.compra, v.time) : v.volUsd / 2 };
        });
        const u = taker1h.filter((t) => t.time + H <= tCierre).at(-1);
        if (u) perp1h = { compra: esc(u.compra, u.time), vol: esc(u.compra + u.venta, u.time) };
      } catch (e) {
        avisos.push(`${a} OKX flujo: ${e.message}`);
      }
      const spotCvd = aCvd(v5m.filter((k) => k.time + 5 * MIN3 <= ahora));
      const s2 = evaluarS2(spotCvd, perpCvd, ahora);
      let s3 = null, f7d = null;
      let fundingAct = null, basisAct = null, oi4hPct = null, oiUsdAct = null;
      let oiSerie = [];
      try {
        const [fh, fAct, swapD, idxD, idxT, tick] = [
          await fundingOkx(a, CFG.m1Funding.diasDistribucion),
          await okx(`/public/funding-rate?instId=${SIM.okx[a]}`),
          await velasOkx(a, "1D", 100),
          await indexOkx(a, "1D", 100),
          await okx(`/market/index-tickers?instId=${SIM.okxIdx[a]}`),
          await okx(`/market/ticker?instId=${SIM.okx[a]}`)
        ];
        oiSerie = a === "BTC" ? oiBTC : await oiOkx(a);
        fundingAct = +fAct[0].fundingRate;
        const idx = +idxT[0].idxPx, last = +tick[0].last;
        basisAct = idx > 0 ? (last - idx) / idx : null;
        const idxPorT = new Map(idxD.map((x) => [x.time, x.close]));
        const basisHist = swapD.filter((v) => v.time + D <= tCierre).map((v) => {
          const i = idxPorT.get(v.time);
          return i ? (v.close - i) / i : null;
        }).filter((x) => x !== null);
        const oiT = oiSerie.filter((o) => o.time <= tCierre);
        const oiAhora = oiT.at(-1), oiHace4 = oiT.find((o) => o.time === (oiAhora?.time ?? 0) - 4 * H);
        oi4hPct = oiAhora && oiHace4 && oiHace4.oiUsd > 0 ? (oiAhora.oiUsd / oiHace4.oiUsd - 1) * 100 : null;
        oiUsdAct = oiAhora?.oiUsd ?? null;
        const ult24 = k1.slice(-24);
        const lv = levelMap({ "1d": kd, "1w": kw }, precio, { high: Math.max(...ult24.map((k) => k.high)), low: Math.min(...ult24.map((k) => k.low)) });
        const near = lv ? nearestLevels(lv, precio) : null;
        if (fh.length > 30) {
          s3 = evaluarS3({
            funding: fundingAct,
            fundingHist: fh.map((f) => f.rate),
            basis: basisAct,
            basisHist,
            oiCambio4hPct: oi4hPct,
            precioCambio4hPct: k1.length > 5 ? (precio / k1[k1.length - 5].close - 1) * 100 : null,
            distResistenciaPct: near && Number.isFinite(near.upPct) ? near.upPct : null,
            distSoportePct: near && Number.isFinite(near.downPct) ? near.downPct : null
          });
          f7d = scoreFunding7d(fh.map((f) => f.rate));
        }
      } catch (e) {
        avisos.push(`${a} OKX funding/OI/basis: ${e.message}`);
      }
      let s4 = null;
      try {
        const k4Mapa = new Map(k4.map((k) => [k.time, k]));
        const oi4 = oiSerie.filter((o) => o.time % (4 * H) === 0 && o.time <= tCierre);
        const est = new EstimadorClusters();
        for (let i = 1; i < oi4.length; i++) {
          const v4 = k4Mapa.get(oi4[i].time - 4 * H);
          if (v4) est.paso(oi4[i - 1].oiUsd / v4.close, oi4[i].oiUsd / v4.close, v4);
        }
        if (oi4.length > 6 && oiUsdAct) s4 = evaluarS4(agruparClusters(est.pos, precio), oiUsdAct, fracRef, s2.tendencia);
      } catch (e) {
        avisos.push(`${a} S4: ${e.message}`);
      }
      try {
        const nuevas = await liquidacionesOkx(a);
        const claves = new Set(liqs.activos[a].map((l) => `${l.t}-${l.precio}-${Math.round(l.usd)}`));
        for (const l of nuevas) {
          const k = `${l.t}-${l.precio}-${Math.round(l.usd)}`;
          if (!claves.has(k)) {
            claves.add(k);
            liqs.activos[a].push(l);
          }
        }
        liqs.activos[a] = liqs.activos[a].filter((l) => l.t >= ahora - LIQ_RETENCION_DIAS * D).sort((x, y) => x.t - y.t);
      } catch (e) {
        avisos.push(`${a} liquidaciones OKX: ${e.message}`);
      }
      const rrAct = rr.at(-1) ?? null;
      const s5 = rrAct ? evaluarS5(rr.slice(0, -1), rrAct, a === "ETH" ? "ETH" : "BTC") : null;
      const nf = netflows?.[a]?.filter((d) => d.t < Math.floor(tCierre / D) * D) ?? [];
      const s6 = nf.length > 20 ? evaluarS6(nf, tCierre) : null;
      const an = fullAnalysis({ "4h": k4.slice(-120), "1d": kd.slice(-120), "1w": kw.slice(-80) }, k1.slice(-160), getLunarState(tCierre), fgi);
      const porTF = an ? [an.perTF["4h"].signal, an.perTF["1d"].signal, an.perTF["1w"].signal] : [0, 0, 0];
      const m3 = mercados && mercados.spx?.c?.length > 40 && mercados.dxy?.c?.length > 40 ? evaluarM3(mercados.spx, mercados.dxy, { t: kd.map((k) => k.time), c: kd.map((k) => k.close) }) : null;
      const gat = { largo: gatillo(k15, 1), corto: gatillo(k15, -1) };
      const comps = [
        { id: "orderflow", score: s1.score, confianza: CFG.s1OrderFlow.confianzaSoloBinance, estado: s1.z === null ? "caido" : "ok", actualizado: tCierre },
        { id: "cvd", score: s2.score, confianza: s2.suficiente ? 1 : 0, estado: perpCvd.length ? "ok" : "caido", actualizado: tCierre },
        { id: "funding", score: s3?.score ?? 0, confianza: s3?.confianza ?? 0, estado: ok(s3), actualizado: tCierre },
        { id: "liquidaciones", score: s4?.score ?? 0, confianza: fracRef === null ? 0 : 1, estado: ok(s4), actualizado: tCierre },
        { id: "skew", score: s5?.score ?? 0, confianza: s5?.confianza ?? 0, estado: ok(s5), actualizado: tCierre },
        { id: "mtf", score: an?.confianza ?? 0, confianza: 1, estado: ok(an), actualizado: tCierre }
      ];
      const swingComps = [
        { id: "netflows", score: s6?.score ?? 0, confianza: 1, estado: ok(s6), actualizado: tCierre },
        { id: "orderflowSemanal", score: sem.score, confianza: 1, estado: sem.z === null ? "caido" : "ok", actualizado: tCierre },
        { id: "skew", score: s5?.score ?? 0, confianza: s5?.confianza ?? 0, estado: ok(s5), actualizado: tCierre },
        { id: "funding7d", score: f7d?.score ?? 0, confianza: 1, estado: ok(f7d), actualizado: tCierre }
      ];
      const sw = scoreSwing(swingComps, PESOS_SWING);
      const ctx = { m3, macro, porTF, defensivo: false, bloqueoDiarioHasta: null, gatillo: gat, swing: sw.score };
      const dec = scoreMaestro(comps, ctx, PESOS);
      const decEnc = scoreMaestro(comps, ctx, CFG.scoreMaestro.pesosEncargo);
      if (yaHay.has(`${tCierre}-${a}`)) {
        console.log(`    ya hab\xEDa fila para esta hora; no se duplica`);
        continue;
      }
      const fila = {
        t: tCierre,
        activo: a,
        precio: r4(precio),
        corrida: ahora,
        s1Score: r4(s1.score),
        s1Z: r4(s1.z),
        s1Conf: r4(comps[0].confianza),
        s1Imb1h: r4(s1.porVentana["1h"].imbalance),
        s1Imb4h: r4(s1.porVentana["4h"].imbalance),
        s1Imb1d: r4(s1.porVentana["1d"].imbalance),
        s1SemScore: r4(sem.score),
        vivoBinanceImb: r4(iB.imb),
        vivoCoinbaseImb: r4(iC.imb),
        vivoKrakenImb: r4(iK.imb),
        vivoOkxImb: r4(iO.imb),
        vivoUsd: Math.round(iB.usd + iC.usd + iK.usd + iO.usd),
        vivoVentanaSeg: Math.min(iB.ventanaSeg || 300, iC.ventanaSeg || 300, iK.ventanaSeg || 300, iO.ventanaSeg || 300),
        perpCompraUsd1h: perp1h ? Math.round(perp1h.compra) : null,
        perpVolUsd1h: perp1h ? Math.round(perp1h.vol) : null,
        s2Score: r4(s2.score),
        s2Suf: s2.suficiente ? 1 : 0,
        s2Lider: s2.lider,
        s2Mult: r4(s2.mult),
        s2Tend: r4(s2.tendencia),
        s2Sesion: s2.sesion.nombre,
        s3Score: r4(s3?.score),
        s3Conf: r4(s3?.confianza),
        s3Funding: fundingAct === null ? null : r4(fundingAct * 100),
        s3PctFunding: r4(s3?.percentilFunding),
        s3Basis: basisAct === null ? null : r4(basisAct * 100),
        s3PctBasis: r4(s3?.percentilBasis),
        s3Oi4hPct: r4(oi4hPct),
        s3Trampa: s3?.trampa ?? null,
        f7dScore: r4(f7d?.score),
        s4Score: r4(s4?.score),
        s4Conf: r4(comps[3].confianza),
        s4Dominante: s4?.dominante ?? null,
        s4ObjDist: r4(s4?.objetivo?.distPct),
        s4ObjUsd: s4?.objetivo ? Math.round(s4.objetivo.usd) : null,
        s4Invertido: s4 ? s4.invertido ? 1 : 0 : null,
        oiUsd: oiUsdAct === null ? null : Math.round(oiUsdAct),
        s5Score: r4(s5?.score),
        s5Conf: r4(s5?.confianza),
        s5Rr7: r4(s5?.rr7),
        s5Z: r4(s5?.z),
        s5Activo: s5 ? s5.activo ? 1 : 0 : null,
        s5Dias: s5?.diasCubiertos ?? null,
        s6Score: r4(s6?.score),
        s6Z: r4(s6?.z),
        s6Regimen: s6?.regimen ?? null,
        mtfScore: r4(an?.confianza),
        mtf4h: porTF[0],
        mtf1d: porTF[1],
        mtf1w: porTF[2],
        m3Score: r4(m3?.score),
        riskOff: m3 ? m3.riskOff ? 1 : 0 : null,
        macroFase: macro.fase,
        gatLargo: gat.largo.ok ? gat.largo.tipo : null,
        gatCorto: gat.corto.ok ? gat.corto.tipo : null,
        maestroBruto: r4(dec.bruto),
        maestroFinal: r4(dec.final),
        maestroDir: dec.dir,
        maestroAbrir: dec.abrir ? 1 : 0,
        maestroBloqueos: dec.bloqueos.length,
        encargoBruto: r4(decEnc.bruto),
        encargoFinal: r4(decEnc.final),
        swing: r4(sw.score),
        r1h: null,
        r4h: null,
        r24h: null,
        r7d: null
      };
      filas.push(CAMPOS.map((c) => fila[c]));
      console.log(`    s1 ${fila.s1Score} \xB7 s2 ${fila.s2Score} \xB7 s3 ${fila.s3Score} \xB7 s4 ${fila.s4Score} \xB7 s5 ${fila.s5Score} \xB7 s6 ${fila.s6Score} \xB7 mtf ${fila.mtfScore} \xB7 maestro ${fila.maestroFinal} (encargo ${fila.encargoFinal}) \xB7 swing ${fila.swing}`);
    } catch (e) {
      avisos.push(`${a}: ${e.message}`);
      console.log(`    ${a} fall\xF3: ${e.message}`);
    }
  }
  let rellenos = 0;
  const horizontes = [["r1h", H], ["r4h", 4 * H], ["r24h", D], ["r7d", 7 * D]];
  for (const f of filas) {
    const a = f[col("activo")], t = f[col("t")];
    const p0 = cierres[a]?.get(t);
    if (!p0) continue;
    for (const [c, h] of horizontes) {
      if (f[col(c)] !== null || t + h > tCierre) continue;
      const p1 = cierres[a].get(t + h);
      if (p1) {
        f[col(c)] = r4(p1 / p0 - 1);
        rellenos++;
      }
    }
  }
  const vivas = filas.filter((f) => f[col("t")] >= ahora - RETENCION_DIAS * D).sort((x, y) => x[col("t")] - y[col("t")] || String(x[col("activo")]).localeCompare(String(y[col("activo")])));
  if (vivas.length < filasPrev.length) throw new Error(`la bit\xE1cora quedar\xEDa con ${vivas.length} filas y antes ten\xEDa ${filasPrev.length}: no se escribe`);
  const corridas = [...(prev?.v.corridas ?? []).filter((c) => c >= ahora - 30 * D), ahora];
  const salida = {
    version: VERSION,
    generado: ahora,
    fuentes: { spot: "Binance spot v\xEDa data-api.binance.vision (velas con volumen agresor, aggTrades)", perp: "OKX swap USDT (taker volume, velas, funding, OI, basis, liquidaciones)", vivo: "Binance spot, Coinbase, Kraken, OKX (\xFAltimos trades por REST)", opciones: "Deribit v\xEDa rr25.json", netflows: "DeFiLlama v\xEDa netflows.json", nota: "Serie del servidor: Binance spot + OKX swap. Binance bloquea su API desde los runners de GitHub (451) y Bybit devuelve 403." },
    corridas,
    cadencia: medirCadencia(corridas, ahora),
    campos: CAMPOS,
    filas: vivas,
    avisos
  };
  writeFileSync(join(SALIDA, "bitacora.json"), JSON.stringify(salida));
  const totalLiq = total(liqs), totalPrev = liqPrev ? total(liqPrev) : 0;
  if (totalLiq >= totalPrev) writeFileSync(join(SALIDA, "liquidaciones-okx.json"), JSON.stringify(liqs));
  else avisos.push(`liquidaciones: ${totalLiq} < ${totalPrev} previas; no se escribe`);
  const kb = (n) => `${(Buffer.byteLength(readFileSync(join(SALIDA, n))) / 1024).toFixed(0)} KB`;
  console.log(`bit\xE1cora: ${vivas.length} filas (${kb("bitacora.json")}), ${rellenos} retornos rellenados, cadencia ${salida.cadencia?.corridasPorDia?.toFixed(1) ?? "\u2014"} corridas/d\xEDa \xB7 liquidaciones ${totalLiq}${avisos.length ? `
avisos:
 - ${avisos.join("\n - ")}` : ""}`);
}
function total(l) {
  return ACTIVOS.reduce((s, a) => s + (l.activos?.[a]?.length ?? 0), 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
export {
  CAMPOS
};
