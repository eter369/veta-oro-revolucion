/* ================================================================
   KIPU · SANTA CATARINA OS — SIMULADOR DE INVERSIÓN
   ----------------------------------------------------------------
   Porta el simulador de terrenos.html a una ventana del OS.
   Se carga con <script src> ANTES del script principal del OS y
   cuelga de window.KP:

     KP.tpl.simulador()       -> string de HTML de la ventana
     KP.init.simulador(root)  -> engancha controles y calcula

   Depende del espacio común KP (lo publica el archivo del catálogo,
   que carga primero): KP.LOTES, KP.TIPO_LBL, KP.fmtBRL, KP.fmtPEN,
   KP.fmtBRLc, KP.fmtPct, KP.cierreDe, KP.sceneSVG, KP.esc.
   Y de las utilidades del shell (index.html): waLink(), fxRate,
   fmtUSD(), renderPrices().

   POR QUÉ ESTE MÓDULO ES DISTINTO AL RESTO: es el único que produce
   números de futuro. Todo lo que sale de aquí es un ESCENARIO
   HIPOTÉTICO construido con un supuesto que elige el usuario, nunca
   una previsión de KIPU. Por eso el supuesto viaja pegado al
   resultado en todas partes (héroe, fichas, gráfico, tabla y pie).
   ================================================================ */
(function () {
  'use strict';

  window.KP = window.KP || {};
  KP.tpl  = KP.tpl  || {};
  KP.init = KP.init || {};

  /* ================================================================
     1. CONSTANTES DE NEGOCIO
     Se declaran arriba y con nombre para que cualquiera pueda
     auditarlas sin leer el cálculo.
     ================================================================ */
  var IMP_GANANCIA = 0.15;   // no residente: 15% sobre la ganancia de capital al vender
  var PRECIO_MIN   = 40000;  // por debajo de esto no hay lote razonable: se avisa en vez de inventar
  var FX_DEF       = 1.51;   // S/ 1 ≈ R$ 1,51 — valor medio de mercado citado en la página antigua
  var ANIOS_DEF    = 8;
  var PEN_DEF      = 500000;

  var nf0 = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });

  /* Envolturas defensivas: si el archivo del catálogo no cargó, el
     simulador debe degradar con un aviso, nunca romper la ventana. */
  function esc(s)      { return KP.esc ? KP.esc(s) : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function fmtBRL(v)   { return KP.fmtBRL  ? KP.fmtBRL(v)  : 'R$ ' + nf0.format(Math.round(v)); }
  function fmtPEN(v)   { return KP.fmtPEN  ? KP.fmtPEN(v)  : 'S/ ' + nf0.format(Math.round(v)); }
  function fmtBRLc(v)  { return KP.fmtBRLc ? KP.fmtBRLc(v) : fmtBRL(v); }
  function fmtPct(v)   { return KP.fmtPct  ? KP.fmtPct(v)  : nf1.format(v) + '%'; }
  function lotes()     { return (KP.LOTES && KP.LOTES.length) ? KP.LOTES : []; }
  function cierreDe(p) {
    if (KP.cierreDe) return KP.cierreDe(p);
    var itbi = p * 0.03, escr = p * 0.0175, legal = 8000;
    var cambio = (p + itbi + escr + legal) * 0.01;
    return { itbi: itbi, escr: escr, legal: legal, cambio: cambio, total: itbi + escr + legal + cambio };
  }
  /* El equivalente en dólares NO se calcula aquí: se emite el span que
     el shell rellena con la cotización en vivo (y vuelve a rellenar
     cuando llega la real). */
  function usd(brl) { return '<span class="usd-lbl" data-brl="' + Math.round(brl) + '"></span>'; }
  function pintarUSD() { if (typeof window.renderPrices === 'function') window.renderPrices(); }
  function wa(txt) { return (typeof window.waLink === 'function') ? window.waLink(txt) : '#'; }

  var YEAR0 = new Date().getFullYear();   // el año base se calcula, no se cablea: no envejece
  var uid   = 0;

  /* ================================================================
     2. SUPUESTOS DE VALORIZACIÓN
     El % de referencia sale del dato histórico del lote (valPct) o,
     en modo presupuesto, de la mediana del catálogo. Los tres presets
     son FRACCIONES de ese dato, para que se vea que el más alto es
     "repetir el pasado" y no una previsión. Se puede escribir un
     supuesto propio, incluso negativo: el mercado también baja.
     ================================================================ */
  function r1(x) { return Math.round(x * 10) / 10; }

  function medianaValPct() {
    var v = lotes().map(function (l) { return l.valPct; }).sort(function (a, b) { return a - b; });
    if (!v.length) return 12;
    var m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : r1((v[m - 1] + v[m]) / 2);
  }

  function refPctDe(st) {
    if (st.modo === 'terreno') {
      var l = loteDe(st.loteId);
      if (l) return l.valPct;
    }
    return medianaValPct();
  }

  function presetsDe(ref) {
    return {
      prudente:   Math.max(0, r1(ref * 0.4)),
      intermedio: Math.max(0, r1(ref * 0.7)),
      historico:  r1(ref)
    };
  }

  var PRESET_LBL = {
    prudente:   { t: 'Prudente',            s: '40% del dato histórico' },
    intermedio: { t: 'Intermedio',          s: '70% del dato histórico' },
    historico:  { t: 'Histórico de la zona', s: 'repetir el dato pasado' }
  };

  function loteDe(id) {
    var L = lotes();
    for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i];
    return null;
  }

  /* ================================================================
     3. CÁLCULO
     ================================================================ */

  /* Costos de cierre como función afín del precio: total(p) = A·p + B.
     Se resuelve con dos sondas en vez de copiar los porcentajes de
     KP.cierreDe. Así, si mañana cambian el ITBI o la tarifa legal, el
     modo "presupuesto" sigue invirtiendo la fórmula correcta sin tocar
     este archivo. */
  function coefCierre() {
    var t0 = cierreDe(0).total;
    var t1 = cierreDe(1e6).total;
    return { A: (t1 - t0) / 1e6, B: t0 };
  }

  /* Precio de terreno alcanzable con `cap` reales de caja.
     k = 1 al contado (pagas el terreno entero) o la cuota inicial en %
     si hay financiación (la caja solo cubre inicial + cierre). */
  function precioDesdeCapital(cap, k) {
    var c = coefCierre();
    var p = (cap - c.B) / (k + c.A);
    return p > 0 ? p : 0;
  }

  function calcular(st) {
    var lote = null, precio = 0, capBRL = 0;
    var k = (st.pago === 'cuotas') ? st.entrada / 100 : 1;

    if (st.modo === 'terreno') {
      lote = loteDe(st.loteId) || lotes()[0] || null;
      precio = lote ? lote.precio : 0;
      capBRL = precio * k + cierreDe(precio).total;
    } else {
      capBRL = st.pen * st.fx;                 // presupuesto en soles llevado a reales
      precio = precioDesdeCapital(capBRL, k);
    }

    var c = cierreDe(precio);
    var contado = precio + c.total;            // desembolso si pagas todo de una

    /* Financiación directa del desarrollador: sistema francés (cuota fija). */
    var fin = null;
    if (st.pago === 'cuotas') {
      var e = st.entrada / 100, n = st.plazo, i = st.interes / 1200;
      var base  = precio * (1 - e);            // saldo financiado
      var cuota = i > 0 ? base * i / (1 - Math.pow(1 + i, -n)) : base / n;
      fin = {
        inicial: precio * e,
        cuota: cuota,
        n: n,
        cajaInicio: precio * e + c.total,      // lo que pones el día de la firma
        totalCuotas: cuota * n,
        costoCredito: cuota * n - base,        // cuánto cuesta pagar en el tiempo
        total: precio * e + cuota * n + c.total
      };
    }

    var desembolso = fin ? fin.total : contado; // todo lo que sale de tu bolsillo

    /* Serie del escenario: valorización compuesta sobre el precio del
       terreno. g puede ser negativo si el usuario escribe un supuesto
       de caída. */
    var H = st.anios, g = st.g / 100, serie = [];
    for (var t = 0; t <= H; t++) serie.push(precio * Math.pow(1 + g, t));

    var vH   = serie[H];
    var imp  = Math.max(0, vH - precio) * IMP_GANANCIA;
    var neto = vH - imp;
    var res  = neto - desembolso;               // resultado del escenario, ya con impuesto
    var roi  = desembolso > 0 ? res / desembolso : 0;
    /* Tasa anual equivalente: interés compuesto que llevaría lo
       desembolsado hasta el neto. No descuenta CUÁNDO se paga cada
       cuota, y así se rotula en pantalla. */
    var tae  = (desembolso > 0 && H > 0 && neto > 0) ? Math.pow(neto / desembolso, 1 / H) - 1 : null;

    return {
      lote: lote, precio: precio, capBRL: capBRL, c: c, contado: contado, fin: fin,
      desembolso: desembolso, H: H, serie: serie, vH: vH, imp: imp, neto: neto,
      res: res, roi: roi, tae: tae, fx: st.fx, g: st.g, k: k, valido: precio >= PRECIO_MIN
    };
  }

  /* Resultado neto si vendes en el año t (para gráfico y tabla). */
  function resEn(t, r) {
    var v = r.serie[t];
    return (v - Math.max(0, v - r.precio) * IMP_GANANCIA) - r.desembolso;
  }

  /* ================================================================
     4. PLANTILLA
     ================================================================ */
  KP.tpl.simulador = function () {
    var id = 'kps' + (++uid);
    var L = lotes();
    var ref = medianaValPct(), pre = presetsDe(ref);

    var optsLote = L.map(function (l) {
      return '<option value="' + l.id + '">' + esc(l.ciudad) + ' — ' + esc(l.barrio) +
             ' · ' + nf0.format(l.m2) + ' m² · ' + fmtBRLc(l.precio) + '</option>';
    }).join('');

    return `<style>
/* Estilos propios del simulador. Todo va prefijado .kp-sim-* para no
   chocar con el resto del OS, que ya define .pad, .sec-head, .sm-stat,
   .badge, .btn… (esas sí se reutilizan tal cual). */
.kp-sim{
  /* tonos derivados que el sistema no expone como variable propia */
  --kp-sim-soft:rgba(227,184,92,.12);
  --kp-sim-panel:rgba(255,255,255,.045);
  --kp-sim-hueco:rgba(8,9,12,.5);
  --kp-sim-neg:#e8907f;            /* no hay variable de "negativo" en el OS */
  color-scheme:dark;
  -webkit-user-select:text;user-select:text;   /* el body del OS bloquea la selección */
}
.kp-sim button,.kp-sim label{-webkit-user-select:none;user-select:none}
.kp-sim :focus-visible{outline:2px solid var(--gold-hi);outline-offset:2px;border-radius:8px}

.kp-sim-layout{display:grid;grid-template-columns:296px 1fr;gap:18px;align-items:start;margin-top:16px}
.kp-sim-panel{background:var(--kp-sim-panel);border:1px solid var(--line);border-radius:14px;padding:16px}
.kp-sim-panel h3,.kp-sim-card h4{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--txt-dim);margin-bottom:13px}
.kp-sim-fld{margin-bottom:14px}
.kp-sim-fld:last-child{margin-bottom:0}
.kp-sim-lbl{display:flex;justify-content:space-between;align-items:baseline;gap:10px;
  font-size:11.5px;font-weight:600;letter-spacing:.03em;color:var(--txt);margin-bottom:7px}
.kp-sim-hint{font-size:10px;font-weight:400;color:var(--txt-dim);letter-spacing:.02em;text-align:right}
.kp-sim-in{width:100%;max-width:100%;background:var(--kp-sim-hueco);border:1px solid var(--line);
  color:var(--txt);border-radius:9px;padding:9px 11px;font-family:'Space Grotesk',system-ui,sans-serif;
  font-size:13.5px;transition:border-color .2s}
.kp-sim-in:hover{border-color:var(--gold-dim)}
.kp-sim-range{width:100%;accent-color:var(--gold);margin-top:9px;display:block}
.kp-sim-seg{display:flex;gap:5px;background:var(--kp-sim-hueco);border:1px solid var(--line);border-radius:11px;padding:4px}
.kp-sim-seg button{flex:1;padding:9px 6px;border-radius:8px;font-size:11px;font-weight:600;
  letter-spacing:.03em;color:var(--txt-dim);transition:.2s;line-height:1.25}
.kp-sim-seg button:hover{color:var(--txt)}
.kp-sim-seg button[aria-pressed="true"]{background:linear-gradient(120deg,var(--gold),var(--gold-hi));color:var(--ink)}
.kp-sim-scen{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.kp-sim-scen button{border:1px solid var(--line);background:rgba(255,255,255,.03);border-radius:10px;
  padding:9px 5px;text-align:center;color:var(--txt-dim);font-size:9.5px;line-height:1.35;transition:.2s}
.kp-sim-scen button .p{display:block;font-family:'Space Grotesk',system-ui,sans-serif;font-size:15px;
  font-weight:600;color:var(--txt);margin-bottom:2px}
.kp-sim-scen button:hover{border-color:var(--gold-dim)}
.kp-sim-scen button[aria-pressed="true"]{border-color:var(--gold-dim);background:var(--kp-sim-soft);color:var(--gold-hi)}
.kp-sim-scen button[aria-pressed="true"] .p{color:var(--gold-hi)}
.kp-sim-nota{font-size:10.5px;line-height:1.65;color:var(--txt-dim);margin-top:9px}
.kp-sim-nota b{color:var(--txt);font-weight:600}
.kp-sim-fx{font-size:10.5px;line-height:1.65;color:var(--txt-dim);background:var(--kp-sim-hueco);
  border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-top:14px}
.kp-sim-fx b{color:var(--txt);font-weight:600}

/* --- columna de resultados --- */
.kp-sim-scene{height:96px;border-radius:12px;overflow:hidden;border:1px solid var(--line);margin-bottom:12px}
.kp-sim-scene svg{display:block;width:100%;height:100%}
.kp-sim-hero{background:linear-gradient(120deg,var(--kp-sim-soft),rgba(227,184,92,.04));
  border:1px solid var(--gold-dim);border-radius:14px;padding:16px 18px}
.kp-sim-hero .k{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--txt-dim)}
.kp-sim-hero .v{font-family:'Space Grotesk',system-ui,sans-serif;font-size:clamp(21px,4.2vw,30px);
  font-weight:600;color:var(--gold-hi);margin:5px 0 3px;line-height:1.15;overflow-wrap:anywhere}
.kp-sim-hero .sub{font-size:11.5px;line-height:1.7;color:var(--txt-dim)}
.kp-sim-hero .sub b{color:var(--txt);font-weight:600}
.kp-sim-badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}
.kp-sim-hero .badge{font-size:10px}
.kp-sim-alcance{margin-top:14px;font-size:11.5px;line-height:1.7;color:var(--txt-dim);
  background:var(--kp-sim-panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.kp-sim-alcance b{color:var(--gold-hi);font-weight:600}
.kp-sim-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
.kp-sim-chips button{font-size:10.5px;letter-spacing:.02em;padding:6px 11px;border-radius:20px;
  border:1px solid var(--line);color:var(--txt-dim);transition:.2s}
.kp-sim-chips button:hover{border-color:var(--gold-dim);color:var(--gold-hi)}
.kp-sim .sm-stats{margin:14px 0 0}
.kp-sim .sm-stat .v{overflow-wrap:anywhere}
.kp-sim .sm-stat .v.neutro{color:var(--txt)}
.kp-sim .sm-stat .v.baja{color:var(--kp-sim-neg)}

.kp-sim-card{background:var(--kp-sim-hueco);border:1px solid var(--line);border-radius:14px;
  padding:14px 16px 15px;margin-top:14px}
.kp-sim-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.kp-sim-card-head h4{margin-bottom:0}
.kp-sim-toggle{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;
  padding:7px 12px;border-radius:8px;border:1px solid var(--line);color:var(--txt-dim);transition:.2s}
.kp-sim-toggle:hover{border-color:var(--gold-dim);color:var(--gold-hi)}
.kp-sim-chart{position:relative}
.kp-sim-chart svg{display:block;width:100%;height:auto}
.kp-sim-grid{stroke:var(--line);stroke-width:1}
.kp-sim-axis{stroke:var(--line);stroke-width:1.5}
.kp-sim-tick{fill:var(--txt-dim);font-size:9.5px;font-family:'Inter',system-ui,sans-serif}
.kp-sim-line{fill:none;stroke:var(--gold-hi);stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}
.kp-sim-area{fill:var(--kp-sim-soft)}
.kp-sim-base{stroke:var(--txt-dim);stroke-width:1.4;stroke-dasharray:5 5}
.kp-sim-baselbl{fill:var(--txt-dim);font-size:9.5px;font-family:'Inter',system-ui,sans-serif}
.kp-sim-dot{fill:var(--gold-hi);stroke:var(--ink);stroke-width:2}
.kp-sim-endlbl{fill:var(--gold-hi);font-size:11px;font-weight:600;font-family:'Space Grotesk',system-ui,sans-serif}
.kp-sim-cross{stroke:var(--gold);stroke-width:1;stroke-dasharray:3 3;opacity:0}
.kp-sim-cursor{fill:var(--gold-hi);stroke:var(--ink);stroke-width:2;opacity:0}
.kp-sim-vacio{fill:var(--txt-dim);font-size:12px;font-family:'Inter',system-ui,sans-serif}
.kp-sim-read{font-size:11px;line-height:1.6;color:var(--txt-dim);margin-top:7px;min-height:2.6em}
.kp-sim-read b{color:var(--txt);font-weight:600}
.kp-sim-tblwrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.kp-sim-tbl{width:100%;border-collapse:collapse;font-size:11.5px;font-variant-numeric:tabular-nums}
.kp-sim-tbl caption{text-align:left;font-size:10.5px;line-height:1.6;color:var(--txt-dim);padding-bottom:9px}
.kp-sim-tbl th{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--txt-dim);
  font-weight:600;text-align:right;padding:7px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
.kp-sim-tbl th[scope=row]{text-align:left;text-transform:none;letter-spacing:0;font-size:11.5px;color:var(--txt)}
.kp-sim-tbl td{text-align:right;padding:7px 8px;border-bottom:1px solid var(--line);
  color:var(--txt-dim);white-space:nowrap}
.kp-sim-tbl .baja{color:var(--kp-sim-neg)}
.kp-sim-tbl .sube{color:var(--green)}
.kp-sim-row{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;line-height:1.5;
  padding:7px 0;border-bottom:1px dashed var(--line);color:var(--txt-dim)}
.kp-sim-row b{color:var(--txt);font-family:'Space Grotesk',system-ui,sans-serif;font-weight:600;white-space:nowrap}
.kp-sim-row.tot{border-bottom:none;color:var(--txt)}
.kp-sim-row.tot b{color:var(--gold-hi)}
.kp-sim-cta{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.kp-sim-cta .btn{flex:1;min-width:170px;padding:12px 14px}

/* --- móvil: a 375px todo se apila y nada desborda --- */
@media(max-width:820px){ .kp-sim-layout{grid-template-columns:1fr} }
@media(max-width:520px){
  .kp-sim.pad{padding:18px 14px 24px}
  .kp-sim-scen{grid-template-columns:1fr}
  .kp-sim-seg{flex-direction:column}
  .kp-sim-cta .btn{min-width:100%}
}
</style>

<div class="pad kp-sim" data-sim="${id}">
  <div class="sec-head">
    <h2>Simulador de <em>inversión</em></h2>
    <p>De soles a metros cuadrados · escenario hipotético con los supuestos que tú eliges</p>
  </div>

  <!-- Aviso de cabecera: lo primero que se lee, antes que cualquier cifra. -->
  <div class="sm-aviso" role="note">
    ⚠ <b>Esto es un escenario hipotético, no una previsión.</b> El panel proyecta el supuesto de
    valorización que tú seleccionas abajo, aplicado de forma compuesta sobre el precio del terreno.
    Cambia el supuesto y cambia todo el resultado. KIPU no promete rentabilidad ni revalorización:
    el mercado inmobiliario puede subir o bajar.
  </div>

  <div class="kp-sim-layout">
    <!-- ============ PANEL DE PARÁMETROS ============ -->
    <div class="kp-sim-panel">
      <h3>Parámetros</h3>

      <div class="kp-sim-fld">
        <span class="kp-sim-lbl" id="${id}-modo-l">Punto de partida</span>
        <div class="kp-sim-seg" role="group" aria-labelledby="${id}-modo-l">
          <button type="button" data-modo="presupuesto" aria-pressed="true">Desde mi presupuesto</button>
          <button type="button" data-modo="terreno" aria-pressed="false">Desde un terreno</button>
        </div>
      </div>

      <div class="kp-sim-fld" data-fld="presupuesto">
        <label class="kp-sim-lbl" for="${id}-pen">Presupuesto en soles
          <span class="kp-sim-hint">S/ 100.000 – 3.000.000</span></label>
        <input class="kp-sim-in" type="number" id="${id}-pen" value="${PEN_DEF}" min="50000" step="10000" inputmode="numeric">
        <input class="kp-sim-range" type="range" id="${id}-penr" min="100000" max="3000000" step="10000"
               value="${PEN_DEF}" aria-label="Presupuesto en soles (deslizador)">
      </div>

      <div class="kp-sim-fld" data-fld="terreno" hidden>
        <label class="kp-sim-lbl" for="${id}-lote">Terreno del catálogo</label>
        <select class="kp-sim-in" id="${id}-lote">${optsLote}</select>
      </div>

      <div class="kp-sim-fld">
        <label class="kp-sim-lbl" for="${id}-fx">Tipo de cambio S/ → R$
          <span class="kp-sim-hint">editable</span></label>
        <input class="kp-sim-in" type="number" id="${id}-fx" value="${FX_DEF}" min="0.5" max="4" step="0.01" inputmode="decimal">
      </div>

      <div class="kp-sim-fld">
        <label class="kp-sim-lbl" for="${id}-anios">Horizonte
          <span class="kp-sim-hint" data-out="anios">${ANIOS_DEF} años</span></label>
        <input class="kp-sim-range" type="range" id="${id}-anios" min="1" max="15" step="1" value="${ANIOS_DEF}" style="margin-top:0">
      </div>

      <div class="kp-sim-fld">
        <span class="kp-sim-lbl" id="${id}-scen-l">Supuesto de valorización anual</span>
        <div class="kp-sim-scen" role="group" aria-labelledby="${id}-scen-l" data-scen>
          <button type="button" data-preset="prudente" aria-pressed="false">
            <span class="p">${fmtPct(pre.prudente)}</span>Prudente</button>
          <button type="button" data-preset="intermedio" aria-pressed="true">
            <span class="p">${fmtPct(pre.intermedio)}</span>Intermedio</button>
          <button type="button" data-preset="historico" aria-pressed="false">
            <span class="p">${fmtPct(pre.historico)}</span>Histórico de la zona</button>
        </div>
        <label class="kp-sim-lbl" for="${id}-g" style="margin-top:11px">Supuesto propio (% al año)
          <span class="kp-sim-hint">admite negativo</span></label>
        <input class="kp-sim-in" type="number" id="${id}-g" value="${pre.intermedio}" min="-10" max="30" step="0.5" inputmode="decimal">
        <p class="kp-sim-nota" data-out="refnota"></p>
      </div>

      <div class="kp-sim-fld">
        <span class="kp-sim-lbl" id="${id}-pago-l">Forma de pago</span>
        <div class="kp-sim-seg" role="group" aria-labelledby="${id}-pago-l">
          <button type="button" data-pago="contado" aria-pressed="true">Al contado</button>
          <button type="button" data-pago="cuotas" aria-pressed="false">Financiado</button>
        </div>
      </div>

      <div data-fld="fin" hidden>
        <div class="kp-sim-fld">
          <label class="kp-sim-lbl" for="${id}-entrada">Cuota inicial
            <span class="kp-sim-hint" data-out="entrada">30%</span></label>
          <input class="kp-sim-range" type="range" id="${id}-entrada" min="20" max="60" step="5" value="30" style="margin-top:0">
        </div>
        <div class="kp-sim-fld">
          <label class="kp-sim-lbl" for="${id}-plazo">Plazo</label>
          <select class="kp-sim-in" id="${id}-plazo">
            <option value="12">12 cuotas mensuales</option>
            <option value="24">24 cuotas mensuales</option>
            <option value="36" selected>36 cuotas mensuales</option>
            <option value="48">48 cuotas mensuales</option>
            <option value="60">60 cuotas mensuales</option>
          </select>
        </div>
        <div class="kp-sim-fld">
          <label class="kp-sim-lbl" for="${id}-interes">Interés anual del desarrollador
            <span class="kp-sim-hint">típico 8–12%</span></label>
          <input class="kp-sim-in" type="number" id="${id}-interes" value="10" min="0" max="30" step="0.5" inputmode="decimal">
        </div>
        <p class="kp-sim-nota" data-out="finnota"></p>
      </div>

      <p class="kp-sim-fx">Ruta cambiaria de referencia: <b>S/ → USDT → R$</b> (1 USDT ≈ S/ 3,55 ≈ R$ 5,36).
        El tipo directo S/ 1 ≈ R$ 1,51 era el valor medio de mercado citado por Wise en jul. 2026:
        <b>ajústalo arriba con la cotización del día en que cierres</b>. El equivalente en dólares que
        aparece a la derecha usa la cotización USD/BRL en vivo de la barra superior.</p>
    </div>

    <!-- ============ RESULTADOS ============ -->
    <div data-out="res"></div>
  </div>
</div>`;
  };

  /* ================================================================
     5. GRÁFICO (SVG)
     Se dibuja a la medida del contenedor y se redibuja con
     ResizeObserver. La misma información está en la tabla accesible:
     el dato NUNCA depende del dibujo.
     ================================================================ */
  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    var m = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < m.length; i++) if (raw <= m[i] * p) return m[i] * p;
    return 10 * p;
  }

  function chartSVG(r, w) {
    var h  = w < 420 ? 200 : 244;
    var Lm = w < 420 ? 46 : 60, Rm = 16, Tm = 18, Bm = 26;
    var iw = Math.max(40, w - Lm - Rm), ih = h - Tm - Bm;

    if (!r.valido) {
      return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" ' +
        'aria-label="Sin proyección: el presupuesto no alcanza el rango del catálogo.">' +
        '<text class="kp-sim-vacio" x="' + (w / 2) + '" y="' + (h / 2) + '" text-anchor="middle">' +
        'Sube el presupuesto para ver el escenario</text></svg>';
    }

    var maxV = Math.max.apply(null, r.serie.concat([r.desembolso])) * 1.08;
    var step = niceStep(maxV / 4) || 1;
    var yMax = step * Math.ceil(maxV / step) || 1;
    var X = function (t) { return Lm + (r.H ? t / r.H : 0) * iw; };
    var Y = function (v) { return Tm + ih - (v / yMax) * ih; };

    var g = '';
    for (var v = 0; v <= yMax + 1e-6; v += step) {
      g += '<line class="kp-sim-grid" x1="' + Lm + '" y1="' + Y(v).toFixed(1) + '" x2="' + (w - Rm) + '" y2="' + Y(v).toFixed(1) + '"/>' +
           '<text class="kp-sim-tick" x="' + (Lm - 8) + '" y="' + (Y(v) + 3.5).toFixed(1) + '" text-anchor="end">' + fmtBRLc(v) + '</text>';
    }
    /* densidad de etiquetas del eje X según el ancho real: en móvil se
       muestran menos años para que no se solapen */
    var cabe = Math.max(2, Math.floor(iw / 58));
    var cada = Math.max(1, Math.ceil((r.H + 1) / cabe));
    for (var t = 0; t <= r.H; t += cada) {
      g += '<text class="kp-sim-tick" x="' + X(t).toFixed(1) + '" y="' + (h - 9) + '" text-anchor="middle">' +
           (t === 0 ? 'Hoy' : YEAR0 + t) + '</text>';
    }

    var pts = r.serie.map(function (val, i) { return X(i).toFixed(1) + ',' + Y(val).toFixed(1); }).join(' ');
    var area = 'M ' + X(0).toFixed(1) + ',' + (Tm + ih) + ' L ' + pts.split(' ').join(' L ') +
               ' L ' + X(r.H).toFixed(1) + ',' + (Tm + ih) + ' Z';
    var yBase = Y(Math.min(r.desembolso, yMax));

    g += '<path class="kp-sim-area" d="' + area + '"/>' +
         '<line class="kp-sim-axis" x1="' + Lm + '" y1="' + (Tm + ih) + '" x2="' + (w - Rm) + '" y2="' + (Tm + ih) + '"/>' +
         '<line class="kp-sim-base" x1="' + Lm + '" y1="' + yBase.toFixed(1) + '" x2="' + (w - Rm) + '" y2="' + yBase.toFixed(1) + '"/>' +
         '<text class="kp-sim-baselbl" x="' + (Lm + 6) + '" y="' + (yBase - 6).toFixed(1) + '">Desembolso ' + fmtBRLc(r.desembolso) + '</text>' +
         '<polyline class="kp-sim-line" points="' + pts + '"/>' +
         '<circle class="kp-sim-dot" cx="' + X(r.H).toFixed(1) + '" cy="' + Y(r.vH).toFixed(1) + '" r="4.5"/>' +
         '<text class="kp-sim-endlbl" x="' + (X(r.H) - 8).toFixed(1) + '" y="' + (Y(r.vH) - 11).toFixed(1) + '" text-anchor="end">' + fmtBRLc(r.vH) + '</text>' +
         '<line class="kp-sim-cross" data-cross x1="0" y1="' + Tm + '" x2="0" y2="' + (Tm + ih) + '"/>' +
         '<circle class="kp-sim-cursor" data-cursor r="4.5" cx="0" cy="0"/>' +
         '<rect data-hit x="' + Lm + '" y="' + Tm + '" width="' + iw + '" height="' + ih + '" fill="transparent"/>';

    var lbl = 'Escenario hipotético del valor del terreno con un supuesto de ' + fmtPct(r.g) +
              ' anual: parte de ' + fmtBRL(r.precio) + ' hoy y llega a ' + fmtBRL(r.vH) +
              ' en ' + (YEAR0 + r.H) + '. Los mismos números están en la tabla.';

    return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(lbl) + '" data-geo=\'' +
           JSON.stringify({ L: Lm, iw: iw, T: Tm, ih: ih, yMax: yMax, H: r.H }) + '\'>' + g + '</svg>';
  }

  /* ================================================================
     6. RENDER DE RESULTADOS
     ================================================================ */
  function tblHTML(r) {
    if (!r.valido) return '';
    var filas = '';
    for (var t = 0; t <= r.H; t++) {
      var res = resEn(t, r);
      var cls = res >= 0 ? 'sube' : 'baja';
      var sig = res >= 0 ? '▲ +' : '▼ −';
      filas += '<tr><th scope="row">' + (t === 0 ? 'Hoy (' + YEAR0 + ')' : YEAR0 + t) + '</th>' +
               '<td>' + fmtBRL(r.serie[t]) + '</td>' +
               '<td class="' + cls + '">' + sig + fmtBRL(Math.abs(res)) + '</td>' +
               '<td class="' + cls + '">' + sig + fmtPct(r.desembolso > 0 ? Math.abs(res / r.desembolso * 100) : 0) + '</td></tr>';
    }
    return '<div class="kp-sim-tblwrap"><table class="kp-sim-tbl">' +
      '<caption>Escenario hipotético año a año con un supuesto de <b>' + fmtPct(r.g) + ' anual</b>. ' +
      'El resultado neto descuenta todo lo desembolsado y el impuesto del 15% sobre la ganancia al vender.</caption>' +
      '<thead><tr><th scope="col">Año</th><th scope="col">Valor del terreno</th>' +
      '<th scope="col">Resultado neto si vendes</th><th scope="col">Sobre lo desembolsado</th></tr></thead>' +
      '<tbody>' + filas + '</tbody></table></div>';
  }

  function statsHTML(r, st) {
    var f = [];
    var signo = function (x) { return x >= 0 ? '▲ +' : '▼ −'; };
    var clase = function (x) { return x >= 0 ? '' : ' baja'; };

    if (st.modo === 'terreno' && r.lote) {
      f.push({ k: 'Precio del terreno', v: fmtBRL(r.precio), s: nf0.format(r.lote.m2) + ' m² · ' + fmtBRL(Math.round(r.precio / r.lote.m2)) + '/m²', c: ' gold' });
    } else {
      f.push({ k: 'Terreno alcanzable', v: fmtBRL(r.precio), s: 'con ' + fmtPEN(st.pen) + ' al cambio ' + nf1.format(st.fx), c: ' gold' });
    }
    f.push({ k: 'Desembolso total', v: fmtBRL(r.desembolso), s: '≈ ' + fmtPEN(r.desembolso / r.fx) + ' · ≈ ' + usd(r.desembolso), c: ' gold' });
    f.push({ k: 'Valor en ' + (YEAR0 + r.H), v: fmtBRL(r.vH), s: 'solo bajo el supuesto de ' + fmtPct(r.g) + ' anual', c: ' neutro' });
    f.push({ k: 'Impuesto al vender', v: fmtBRL(r.imp), s: '15% sobre la ganancia · no residente', c: ' neutro' });
    f.push({ k: 'Resultado neto', v: signo(r.res) + fmtBRL(Math.abs(r.res)), s: '≈ ' + fmtPEN(Math.abs(r.res) / r.fx) + ' tras impuesto y costos', c: clase(r.res) });
    f.push({ k: 'Sobre lo desembolsado', v: signo(r.roi) + fmtPct(Math.abs(r.roi * 100)), s: r.tae !== null ? '≈ ' + fmtPct(r.tae * 100) + ' anual equivalente' : 'en ' + r.H + (r.H === 1 ? ' año' : ' años'), c: clase(r.roi) });
    if (r.fin) {
      f.push({ k: 'Cuota mensual', v: fmtBRL(r.fin.cuota), s: '≈ ' + fmtPEN(r.fin.cuota / r.fx) + ' · ' + r.fin.n + ' cuotas', c: ' gold' });
      f.push({ k: 'Costo del crédito', v: fmtBRL(r.fin.costoCredito), s: 'intereses del plan a ' + r.fin.n + ' meses', c: ' neutro' });
    }
    return '<div class="sm-stats">' + f.map(function (x) {
      return '<div class="sm-stat"><div class="k">' + x.k + '</div>' +
             '<div class="v' + (x.c || '') + '">' + x.v + '</div>' +
             '<div class="s">' + x.s + '</div></div>';
    }).join('') + '</div>';
  }

  function desgloseHTML(r, st) {
    var d = '<div class="kp-sim-card"><h4>Desglose del desembolso</h4>' +
      '<div class="kp-sim-row"><span>Precio del terreno</span><b>' + fmtBRL(r.precio) + '</b></div>' +
      '<div class="kp-sim-row"><span>ITBI municipal (estimado 3%; varía 2–4% según municipio)</span><b>' + fmtBRL(r.c.itbi) + '</b></div>' +
      '<div class="kp-sim-row"><span>Escritura + registro (≈1,75%)</span><b>' + fmtBRL(r.c.escr) + '</b></div>' +
      '<div class="kp-sim-row"><span>Asesoría legal</span><b>' + fmtBRL(r.c.legal) + '</b></div>' +
      '<div class="kp-sim-row"><span>Cambio y remesa (≈1%)</span><b>' + fmtBRL(r.c.cambio) + '</b></div>' +
      '<div class="kp-sim-row tot"><span>Total al contado</span><b>' + fmtBRL(r.contado) + ' · ≈ ' + fmtPEN(r.contado / r.fx) + '</b></div>';
    if (r.fin) {
      d += '<div class="kp-sim-row" style="margin-top:8px"><span>Caja el día de la firma: inicial (' + st.entrada + '%) + costos de cierre</span><b>' + fmtBRL(r.fin.cajaInicio) + '</b></div>' +
           '<div class="kp-sim-row"><span>' + r.fin.n + ' cuotas de ' + fmtBRL(r.fin.cuota) + ' (interés ' + nf1.format(st.interes) + '% anual)</span><b>' + fmtBRL(r.fin.totalCuotas) + '</b></div>' +
           '<div class="kp-sim-row tot"><span>Total pagado con financiación</span><b>' + fmtBRL(r.fin.total) + ' · ≈ ' + fmtPEN(r.fin.total / r.fx) + '</b></div>';
    }
    return d + '</div>';
  }

  function alcanceHTML(r, st) {
    /* Modo presupuesto: qué lotes del catálogo entran con esa caja.
       Al financiar solo se compara contra la inicial + cierre de los
       lotes que publican financiación; el resto se mide al contado. */
    var L = lotes();
    if (!L.length) return '';
    var fin = st.pago === 'cuotas', e = st.entrada / 100;
    var entran = L.filter(function (l) {
      var k = (fin && l.financiable) ? e : 1;
      return l.precio * k + cierreDe(l.precio).total <= r.capBRL;
    }).sort(function (a, b) { return b.precio - a.precio; });

    var txt = 'Con <b>' + fmtPEN(st.pen) + '</b> (≈ ' + fmtBRL(r.capBRL) + ') entran <b>' + entran.length +
      ' de ' + L.length + '</b> terrenos del catálogo, con costos de cierre incluidos' +
      (fin ? ' y contando solo la cuota inicial en los lotes que publican financiación directa.' : '.');

    var chips = entran.length
      ? '<div class="kp-sim-chips">' + entran.map(function (l) {
          return '<button type="button" data-lote="' + l.id + '">' + esc(l.ciudad) + ' · ' +
                 nf0.format(l.m2) + ' m² — ' + fmtBRLc(l.precio) +
                 (fin && l.financiable ? ' · hasta ' + l.financiable + ' cuotas' : '') + '</button>';
        }).join('') + '</div>'
      : '';

    return '<div class="kp-sim-alcance">' + txt + chips + '</div>';
  }

  function resultadosHTML(r, st, tabla) {
    var yearH = YEAR0 + r.H;
    var head;

    if (!r.valido) {
      head = '<div class="kp-sim-hero"><div class="k">Escenario hipotético</div>' +
        '<div class="v">—</div><div class="sub">Ese presupuesto todavía no cubre un terreno del rango del ' +
        'catálogo una vez sumados los costos de cierre. El lote más accesible parte de <b>' +
        fmtBRL(Math.min.apply(null, lotes().map(function (l) { return l.precio; }) || [0])) +
        '</b>. Prueba desde <b>S/ 200.000</b> o cambia a financiación directa.</div></div>';
    } else {
      var sobre = r.precio > 0 ? (r.vH / r.precio - 1) * 100 : 0;
      head =
        ((st.modo === 'terreno' && r.lote && KP.sceneSVG) ? '<div class="kp-sim-scene">' + KP.sceneSVG(r.lote, true) + '</div>' : '') +
        '<div class="kp-sim-hero">' +
          '<div class="k">Valor del terreno en ' + yearH + ' · escenario hipotético</div>' +
          '<div class="v">' + fmtBRL(r.vH) + '</div>' +
          '<div class="sub">' + (sobre >= 0 ? '+' : '−') + fmtPct(Math.abs(sobre)) + ' sobre el precio de compra ' +
            'si —y solo si— se cumpliera ese supuesto todos los años. Resultado neto tras el impuesto del 15% ' +
            'y los costos: <b>' + (r.res >= 0 ? '▲ +' : '▼ −') + fmtBRL(Math.abs(r.res)) + '</b> (≈ ' +
            fmtPEN(Math.abs(r.res) / r.fx) + ').</div>' +
          '<div class="kp-sim-badges">' +
            '<span class="badge gold">◆ Supuesto: ' + fmtPct(r.g) + ' anual</span>' +
            '<span class="badge gold">Horizonte: ' + r.H + (r.H === 1 ? ' año' : ' años') + '</span>' +
            '<span class="badge gold">' + (r.fin ? 'Financiado · ' + r.fin.n + ' cuotas' : 'Al contado') + '</span>' +
          '</div>' +
        '</div>' +
        (st.modo === 'presupuesto' ? alcanceHTML(r, st) : '');
    }

    var waTxt = 'Hola KIPU, armé un escenario hipotético en el simulador de Santa Catarina OS: ' +
      (st.modo === 'terreno' && r.lote ? 'terreno ' + r.lote.barrio + ' · ' + r.lote.ciudad + ' (' + fmtBRL(r.precio) + ')'
                                       : 'presupuesto ' + fmtPEN(st.pen)) +
      ', horizonte ' + r.H + ' años, supuesto de valorización ' + fmtPct(r.g) + ' anual, ' +
      (r.fin ? 'pago financiado en ' + r.fin.n + ' cuotas' : 'pago al contado') +
      '. Quiero contrastarlo con datos reales y con la documentación del lote.';

    return head + statsHTML(r, st) +
      '<div class="kp-sim-card">' +
        '<div class="kp-sim-card-head">' +
          '<h4>Evolución del escenario · supuesto ' + fmtPct(r.g) + ' anual</h4>' +
          '<button type="button" class="kp-sim-toggle" data-tabla aria-expanded="' + (tabla ? 'true' : 'false') + '">' +
            (tabla ? 'Ver gráfico' : 'Ver tabla') + '</button>' +
        '</div>' +
        '<div class="kp-sim-chart" data-chart tabindex="0" ' + (tabla ? 'hidden' : '') +
          ' aria-describedby="' + st.uid + '-read"></div>' +
        '<p class="kp-sim-read" id="' + st.uid + '-read" data-read aria-live="polite" ' + (tabla ? 'hidden' : '') + '>' +
          'Pasa el cursor por el gráfico —o usa las flechas ← → con el gráfico enfocado— para leer año por año.</p>' +
        '<div data-tblwrap ' + (tabla ? '' : 'hidden') + '>' + tblHTML(r) + '</div>' +
      '</div>' +
      desgloseHTML(r, st) +
      '<p class="sm-pie">' +
        '<b style="color:var(--gold-hi)">Lee esto antes de usar cualquier número de arriba.</b> ' +
        'La cifra de salida es aritmética sobre el supuesto que elegiste: no es una previsión de KIPU, ' +
        'ni una promesa de rentabilidad, ni asesoría financiera, legal o tributaria. Los datos históricos ' +
        'citados describen el pasado y el pasado no anticipa el futuro. El mercado inmobiliario puede bajar: ' +
        'escribe un supuesto negativo arriba y verás ese escenario también. La inversión inmobiliaria es ' +
        'ilíquida: vender un terreno puede tomar meses o años, y el precio de venta lo pone el mercado, no ' +
        'esta simulación. Los costos de cierre son estimados y varían según municipio (ITBI 2–4%), cartório ' +
        'y notaría; el 15% de ganancia de capital corresponde al régimen de no residentes vigente al momento ' +
        'de escribir esto: verifícalo con un abogado habilitado en Brasil antes de comprometer capital.' +
      '</p>' +
      '<div class="kp-sim-cta">' +
        '<a class="btn btn-wa" target="_blank" rel="noopener" href="' + wa(waTxt) + '">◉ Contrastar este escenario por WhatsApp</a>' +
        '<a class="btn btn-ghost" href="mailto:contacto@kippuu.com?subject=' +
          encodeURIComponent('Simulación de terreno — Santa Catarina') + '">Pedir el detalle por correo</a>' +
      '</div>';
  }

  /* ================================================================
     7. INICIALIZADOR
     ================================================================ */
  KP.init.simulador = function (root) {
    var el = (root && root.classList && root.classList.contains('kp-sim'))
      ? root : (root && root.querySelector ? root.querySelector('.kp-sim') : null);
    if (!el || el.dataset.listo === '1') return;   // idempotente: reabrir la ventana no duplica handlers
    el.dataset.listo = '1';

    var id = el.dataset.sim;
    var q  = function (sel) { return el.querySelector(sel); };
    var qa = function (sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); };

    var L = lotes();
    var salida = q('[data-out="res"]');

    if (!L.length) {
      salida.innerHTML = '<div class="sm-aviso" role="alert">No se pudo leer el catálogo de terrenos ' +
        '(KP.LOTES). Abre la ventana de Catálogo o recarga la página.</div>';
      return;
    }

    /* ---- estado ---- */
    var st = {
      uid: id, modo: 'presupuesto', pen: PEN_DEF, fx: FX_DEF, anios: ANIOS_DEF,
      preset: 'intermedio', g: presetsDe(medianaValPct()).intermedio,
      pago: 'contado', entrada: 30, plazo: 36, interes: 10,
      loteId: L[0].id, tabla: false
    };

    var geo = null, idxFoco = 0, ro = null, mo = null;

    /* ---- lectura de controles ---- */
    function num(sel, def, min, max) {
      var v = parseFloat(q(sel).value);
      if (!isFinite(v)) v = def;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      return v;
    }

    function leer() {
      st.pen     = num('#' + id + '-pen', PEN_DEF, 0);
      st.fx      = num('#' + id + '-fx', FX_DEF, 0.5, 4);
      st.anios   = num('#' + id + '-anios', ANIOS_DEF, 1, 15);
      st.entrada = num('#' + id + '-entrada', 30, 20, 60);
      st.plazo   = num('#' + id + '-plazo', 36, 12, 60);
      st.interes = num('#' + id + '-interes', 10, 0, 30);
      st.loteId  = (function () { var v = parseInt(q('#' + id + '-lote').value, 10); return isNaN(v) ? L[0].id : v; })();
      st.g       = num('#' + id + '-g', 10, -10, 30);
    }

    /* Los presets se recalculan sobre el dato histórico vigente (el del
       lote elegido o la mediana del catálogo). Si el usuario está en un
       preset, su % se actualiza; si escribió el suyo, se respeta. */
    function refrescarPresets() {
      var ref = refPctDe(st), pre = presetsDe(ref);
      qa('[data-scen] button').forEach(function (b) {
        var k = b.dataset.preset;
        b.querySelector('.p').textContent = fmtPct(pre[k]);
        b.setAttribute('aria-pressed', String(st.preset === k));
        b.setAttribute('aria-label', PRESET_LBL[k].t + ': supuesto de ' + fmtPct(pre[k]) + ' anual, ' + PRESET_LBL[k].s);
      });
      if (st.preset && pre[st.preset] !== undefined) {
        st.g = pre[st.preset];
        q('#' + id + '-g').value = st.g;
      }
      var fuente = (st.modo === 'terreno')
        ? 'Referencia de este lote: <b>' + fmtPct(ref) + ' anual</b> (dato histórico de su zona declarado en la ficha).'
        : 'Referencia del catálogo: <b>' + fmtPct(ref) + ' anual</b> (mediana de los 10 lotes).';
      q('[data-out="refnota"]').innerHTML = fuente +
        ' Datos publicados: Florianópolis +8,65% (2025) · Blumenau +12,96% (2024) · retorno efectivo en ' +
        'Itapema, Itajaí y Balneário Camboriú 19–22% anual (2019–2024). Fuentes: FipeZAP/MySide y Gazeta do Povo. ' +
        'Describen el pasado; el pasado no anticipa el futuro.';
    }

    function notaFinanciacion() {
      var n = q('[data-out="finnota"]');
      if (st.pago !== 'cuotas') { n.textContent = ''; return; }
      var l = (st.modo === 'terreno') ? loteDe(st.loteId) : null;
      if (l && l.financiable) {
        n.innerHTML = 'Este lote publica financiación directa hasta <b>' + l.financiable + ' cuotas</b>.' +
          (st.plazo > l.financiable ? ' Estás simulando ' + st.plazo + ': confirma el plazo con el desarrollador.' : '');
      } else if (l) {
        n.innerHTML = 'Este lote <b>no publica financiación directa</b>: la simulación usa condiciones genéricas y ' +
          'habría que negociarlas con el vendedor.';
      } else {
        n.innerHTML = 'En modo presupuesto, tu capital cubre la <b>cuota inicial + los costos de cierre</b>. ' +
          'Las cuotas siguientes son un compromiso futuro que este presupuesto no incluye.';
      }
    }

    /* ---- dibujo del gráfico ---- */
    var ultimo = null;   // último resultado calculado, para redibujar sin recalcular

    function pintarChart() {
      var cont = q('[data-chart]');
      if (!cont || !ultimo) return;
      var w = Math.max(240, Math.round(cont.clientWidth || cont.getBoundingClientRect().width || 320));
      cont.innerHTML = chartSVG(ultimo, w);
      var svg = cont.querySelector('svg');
      geo = (svg && svg.dataset.geo) ? JSON.parse(svg.dataset.geo) : null;
      engancharChart(cont);
    }

    function leerAnio(t) {
      var r = ultimo; if (!r || !r.valido) return;
      t = Math.max(0, Math.min(r.H, t));
      idxFoco = t;
      var res = resEn(t, r);
      q('[data-read]').innerHTML =
        '<b>' + (t === 0 ? 'Hoy (' + YEAR0 + ')' : YEAR0 + t + ' · +' + t + (t === 1 ? ' año' : ' años')) + '</b> — ' +
        'valor ' + fmtBRL(r.serie[t]) + ' bajo el supuesto de ' + fmtPct(r.g) + ' anual · ' +
        'resultado neto si vendieras ese año: <b>' + (res >= 0 ? '▲ +' : '▼ −') + fmtBRL(Math.abs(res)) +
        '</b> (≈ ' + fmtPEN(Math.abs(res) / r.fx) + ').';
      var cont = q('[data-chart]');
      var cross = cont.querySelector('[data-cross]'), cur = cont.querySelector('[data-cursor]');
      if (geo && cross && cur) {
        var x = geo.L + (geo.H ? t / geo.H : 0) * geo.iw;
        var y = geo.T + geo.ih - (r.serie[t] / geo.yMax) * geo.ih;
        cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('opacity', '.65');
        cur.setAttribute('cx', x); cur.setAttribute('cy', y); cur.setAttribute('opacity', '1');
      }
    }

    function engancharChart(cont) {
      var svg = cont.querySelector('svg'); if (!svg || !geo) return;
      var mover = function (ev) {
        var r = ultimo; if (!r || !r.valido) return;
        var caja = svg.getBoundingClientRect();
        var cx = (ev.touches && ev.touches[0]) ? ev.touches[0].clientX : ev.clientX;
        var px = (cx - caja.left) * (svg.viewBox.baseVal.width / caja.width);
        leerAnio(Math.round((px - geo.L) / geo.iw * r.H));
      };
      svg.addEventListener('pointermove', mover);
      svg.addEventListener('touchmove', mover, { passive: true });
    }

    /* ---- ciclo principal ---- */
    function recalcular() {
      leer();
      q('[data-out="anios"]').textContent = st.anios + (st.anios === 1 ? ' año' : ' años');
      q('[data-out="entrada"]').textContent = st.entrada + '%';
      notaFinanciacion();

      ultimo = calcular(st);
      salida.innerHTML = resultadosHTML(ultimo, st, st.tabla);
      pintarUSD();                 // el shell rellena los <span class="usd-lbl">
      if (!st.tabla) { pintarChart(); idxFoco = ultimo.H; leerAnio(ultimo.H); }
      engancharSalida();
    }

    /* Los eventos de la columna de resultados se re-enganchan tras cada
       render porque el HTML se reemplaza entero (más simple y barato que
       un diff, y el volumen de nodos es pequeño). */
    function engancharSalida() {
      var tgl = q('[data-tabla]');
      if (tgl) tgl.addEventListener('click', function () {
        st.tabla = !st.tabla;
        salida.innerHTML = resultadosHTML(ultimo, st, st.tabla);
        pintarUSD();
        if (!st.tabla) { pintarChart(); leerAnio(idxFoco); }
        engancharSalida();
        var b = q('[data-tabla]'); if (b) b.focus();
      });

      /* chips de "qué lotes entran": saltan al modo terreno con ese lote */
      qa('[data-lote]').forEach(function (b) {
        b.addEventListener('click', function () {
          q('#' + id + '-lote').value = b.dataset.lote;
          setModo('terreno');
        });
      });

      var cont = q('[data-chart]');
      if (cont) cont.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { leerAnio(idxFoco + 1); e.preventDefault(); }
        if (e.key === 'ArrowLeft')  { leerAnio(idxFoco - 1); e.preventDefault(); }
        if (e.key === 'Home')       { leerAnio(0); e.preventDefault(); }
        if (e.key === 'End' && ultimo) { leerAnio(ultimo.H); e.preventDefault(); }
      });
    }

    /* ---- conmutadores ---- */
    function setModo(m) {
      st.modo = m;
      qa('[data-modo]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.modo === m)); });
      q('[data-fld="presupuesto"]').hidden = (m !== 'presupuesto');
      q('[data-fld="terreno"]').hidden     = (m !== 'terreno');
      refrescarPresets();
      recalcular();
    }
    function setPago(p) {
      st.pago = p;
      qa('[data-pago]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.pago === p)); });
      q('[data-fld="fin"]').hidden = (p !== 'cuotas');
      recalcular();
    }

    /* ---- enganche de controles ---- */
    qa('[data-modo]').forEach(function (b) { b.addEventListener('click', function () { setModo(b.dataset.modo); }); });
    qa('[data-pago]').forEach(function (b) { b.addEventListener('click', function () { setPago(b.dataset.pago); }); });
    qa('[data-scen] button').forEach(function (b) {
      b.addEventListener('click', function () { st.preset = b.dataset.preset; refrescarPresets(); recalcular(); });
    });
    q('#' + id + '-g').addEventListener('input', function () {
      st.preset = null;                                   // supuesto propio: ningún preset queda marcado
      qa('[data-scen] button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      recalcular();
    });

    var pen = q('#' + id + '-pen'), penr = q('#' + id + '-penr');
    pen.addEventListener('input', function () { penr.value = pen.value; recalcular(); });
    penr.addEventListener('input', function () { pen.value = penr.value; recalcular(); });

    ['-fx', '-anios', '-entrada', '-plazo', '-interes'].forEach(function (sfx) {
      q('#' + id + sfx).addEventListener('input', recalcular);
    });
    q('#' + id + '-lote').addEventListener('change', function () { setModo('terreno'); });

    /* ---- responsive: redibujar el gráfico al cambiar el ancho ---- */
    if (typeof ResizeObserver === 'function') {
      var ancho = 0;
      ro = new ResizeObserver(function (entradas) {
        if (!el.isConnected) { limpiar(); return; }
        var w = Math.round(entradas[0].contentRect.width);
        if (Math.abs(w - ancho) < 8) return;              // evita redibujos por 1px
        ancho = w;
        if (!st.tabla) { pintarChart(); leerAnio(idxFoco); }
      });
      ro.observe(el);
    } else {
      addEventListener('resize', alRedimensionar);
    }
    function alRedimensionar() { if (!st.tabla) { pintarChart(); leerAnio(idxFoco); } }

    /* El shell destruye la ventana con .remove() y no expone un hook de
       cierre: se vigila el DOM para soltar los observers y no dejar
       trabajo colgado tras cerrar la ventana. */
    function limpiar() {
      if (ro) { ro.disconnect(); ro = null; }
      if (mo) { mo.disconnect(); mo = null; }
      removeEventListener('resize', alRedimensionar);
    }
    el._kpSimDestroy = limpiar;
    if (typeof MutationObserver === 'function') {
      mo = new MutationObserver(function () { if (!el.isConnected) limpiar(); });
      mo.observe(document.body, { childList: true, subtree: true });
    }

    /* ---- arranque ---- */
    refrescarPresets();
    recalcular();
  };
})();
