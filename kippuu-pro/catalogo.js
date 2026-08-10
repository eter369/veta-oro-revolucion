/* ============================================================
   KIPU · SANTA CATARINA OS — catalogo.js
   ------------------------------------------------------------
   DATOS + VENTANAS DE CATÁLOGO Y FICHA.

   Este archivo carga PRIMERO (antes del script principal del OS),
   así que es el que DEFINE el espacio común window.KP que usan
   los demás módulos. Todo lo que cuelga de KP aquí es contrato:
   otros archivos lo consumen y no deben redefinirlo.

   Origen del contenido: terrenos.html (catálogo de 10 lotes de
   Santa Catarina). Los datos numéricos se copiaron sin cambios;
   las descripciones se reescribieron donde insinuaban un
   resultado futuro, porque la regla de la casa es que ninguna
   cifra puede presentarse como rentabilidad prometida. Los datos
   históricos se mantienen SOLO cuando se puede nombrar la fuente
   y aclarar que el pasado no anticipa el futuro.

   Depende del shell (index.html) para: waLink(), renderPrices()
   y el relleno automático de <span class="usd-lbl" data-brl>.
   No calcula dólares por su cuenta a propósito: el tipo de
   cambio llega en vivo y puede cambiar después de pintar.
   ============================================================ */
(function (window, document) {
'use strict';

/* Espacio común compartido por los tres archivos del OS. */
var KP = window.KP = window.KP || {};
KP.tpl  = KP.tpl  || {};   // plantillas: devuelven un string de HTML
KP.init = KP.init || {};   // inicializadores: reciben el elemento ya en el DOM


/* ============================================================
   1. DATOS — inventario de Santa Catarina
   ------------------------------------------------------------
   Forma de cada lote (idéntica a terrenos.html, no cambiar):
   { id, ciudad, barrio, tipo, m2, precio, valPct, val, dist,
     scene, desc, extras[], financiable? }
   · precio en REALES (R$)
   · valPct: % de valorización ANUAL HISTÓRICA de la zona
     (referencias FipeZAP / MySide 2019–2026). Es el
     comportamiento pasado del mercado, nunca una previsión
     sobre el lote: así se rotula en todas las vistas.
   · financiable: nº máximo de cuotas de financiación directa
     del desarrollador, cuando el lote la admite.
   ============================================================ */
KP.LOTES = [
  { id:1, ciudad:'Itapema', barrio:'Meia Praia', tipo:'urbano', m2:450, precio:2900000,
    valPct:19, val:'Alta', dist:'A 350 m del mar', scene:'playa',
    desc:'Lote plano en Meia Praia, dentro del área de edificación vertical de la ciudad, con obra activa y servicios completos. Dato de contexto del mercado: Itapema registra el m² residencial más caro de Brasil, R$ 15.226 (Gazeta do Povo, may. 2026). Es una referencia de la zona, no una previsión sobre este terreno.',
    extras:['m² más caro de Brasil (may. 2026)','Zona de edificación vertical','Frente de 15 m','Servicios completos'] },

  { id:2, ciudad:'Balneário Camboriú', barrio:'Barra Norte', tipo:'urbano', m2:400, precio:3350000,
    valPct:19, val:'Alta', dist:'A 500 m de la playa', scene:'ciudad',
    desc:'Lote cerca de la Avenida Brasil, en la ciudad del skyline más alto de Latinoamérica. Zonificación de alta densidad: lo que se puede construir depende del plan director municipal vigente y se verifica en la municipalidad antes de comprar.',
    extras:['Skyline icónico','Zonificación de alta densidad','Infraestructura urbana completa'] },

  { id:3, ciudad:'Porto Belo', barrio:'Perequê', tipo:'condominio', m2:600, precio:890000,
    valPct:15, val:'Alta', dist:'A 5 min del Outlet Premium', scene:'condominio',
    desc:'Lote en condominio cerrado con portería, en el eje de expansión entre Porto Belo e Itapema. Zona impulsada por el Outlet Premium y por nuevos desarrollos residenciales.',
    extras:['Condominio con portería 24 h','Eje de expansión','Áreas verdes'], financiable:60 },

  { id:4, ciudad:'Penha', barrio:'Armação', tipo:'urbano', m2:384, precio:320000,
    valPct:12, val:'Media', dist:'A 10 min de Beto Carrero World', scene:'playa',
    desc:'Ticket de entrada al litoral norte: lote urbano a minutos del parque temático más grande de Latinoamérica, que sostiene el flujo turístico de la zona durante todo el año.',
    extras:['Cerca de Beto Carrero','Turismo todo el año','Zona de uso vacacional'], financiable:48 },

  { id:5, ciudad:'Barra Velha', barrio:'Itajuba', tipo:'urbano', m2:360, precio:265000,
    valPct:12, val:'Media', dist:'A 900 m del mar', scene:'playa',
    desc:'El lote de menor precio del catálogo, en una ciudad-balneario en expansión sobre la BR-101. Admite financiación directa del desarrollador hasta en 60 cuotas.',
    extras:['Menor ticket de entrada','Sobre eje BR-101','Ciudad en expansión'], financiable:60 },

  { id:6, ciudad:'Navegantes', barrio:'Meia Praia', tipo:'urbano', m2:420, precio:390000,
    valPct:13, val:'Media', dist:'A 15 min del aeropuerto NVT', scene:'playa',
    desc:'Lote a minutos del aeropuerto internacional y del complejo portuario. Ciudad logística con playa: demanda residencial y corporativa en el mismo entorno.',
    extras:['Cerca del aeropuerto','Polo portuario-logístico','Playa amplia'], financiable:36 },

  { id:7, ciudad:'Itajaí', barrio:'Praia Brava (alto)', tipo:'urbano', m2:500, precio:1850000,
    valPct:19, val:'Alta', dist:'Vista al mar', scene:'colina',
    desc:'Lote en altura con vista a Praia Brava, uno de los balnearios más exclusivos del sur. Dato histórico de la ciudad: 19,6% de retorno anual efectivo entre 2019 y 2024 (FipeZAP / MySide). Describe lo que ya ocurrió en la zona; no anticipa lo que hará este lote.',
    extras:['Vista al mar','Balneario exclusivo','Histórico de zona: 19,6% anual (2019–24)'] },

  { id:8, ciudad:'Blumenau', barrio:'Itoupava Central', tipo:'urbano', m2:700, precio:480000,
    valPct:12, val:'Media', dist:'Polo industrial y tecnológico', scene:'valle',
    desc:'Terreno amplio en la capital textil-tecnológica del estado, sede de la Oktoberfest y de la operación de KIPU en Brasil. El índice de la ciudad subió 12,96% en 2024 (FipeZAP): dato histórico publicado, no una previsión.',
    extras:['Sede de operación KIPU','Polo tecnológico','Índice de ciudad: +12,96% en 2024'], financiable:48 },

  { id:9, ciudad:'Florianópolis', barrio:'Rio Vermelho', tipo:'condominio', m2:750, precio:690000,
    valPct:11, val:'Media', dist:'Norte de la isla', scene:'bosque',
    desc:'Lote arbolado en condominio del norte de la isla, entre la laguna y las playas de Moçambique. Florianópolis concentra polo tecnológico y una de las mejores calidades de vida del país.',
    extras:['Entorno nativo','Cerca de playas del norte','Capital tecnológica'], financiable:36 },

  { id:10, ciudad:'Porto Belo', barrio:'Santa Luzia', tipo:'inversion', m2:7000, precio:3000000,
    valPct:15, val:'Alta', dist:'Área para desarrollo o loteo', scene:'valle',
    desc:'Área de 7.000 m² para desarrollo: loteo, condominio o proyecto turístico, en el interior verde de Porto Belo con acceso a la península.',
    extras:['Apta para loteo','Escala de desarrollo','Entorno natural'] }
];

/* Etiquetas legibles de cada tipo de lote (contrato compartido). */
KP.TIPO_LBL = { urbano:'Lote urbano', condominio:'Condominio cerrado', inversion:'Área de inversión' };


/* ============================================================
   2. FORMATO Y CÁLCULO — portado de terrenos.html
   ------------------------------------------------------------
   Locale es-ES en vez del es-PE del original: el CLDR de es-PE
   agrupa con coma ("R$ 2,900,000"), y tanto el contrato del OS
   ("R$ 1.234.567", "19,0%") como el shell de index.html —que ya
   formatea reales con pt-BR— usan punto para los miles y coma
   para el decimal. Mezclar los dos estilos en la misma ventana
   se leería como un error de datos.
   ============================================================ */
var nf0  = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
var nf1  = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
/* El porcentaje fuerza siempre un decimal para que 19 y 19,6 se
   alineen visualmente en la misma columna de fichas. */
var nfPct = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/* Escapa & y < para poder interpolar texto de datos dentro de HTML
   sin romper el marcado ni permitir inyección accidental. */
KP.esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };

KP.fmtBRL  = function (v) { return 'R$ ' + nf0.format(Math.round(v)); };
KP.fmtPEN  = function (v) { return 'S/ ' + nf0.format(Math.round(v)); };
KP.fmtPct  = function (v) { return nfPct.format(v) + '%'; };
/* Compacto para etiquetas estrechas (el control deslizante de precio). */
KP.fmtBRLc = function (v) {
  if (v >= 1e6) return 'R$ ' + nf1.format(v / 1e6) + ' M';
  if (v >= 1e3) return 'R$ ' + nf0.format(Math.round(v / 1e3)) + ' mil';
  return 'R$ ' + nf0.format(v);
};

/* Costos de cierre estimados de una compra en Brasil.
   Mismos porcentajes que terrenos.html: ITBI 3%, escritura y
   registro 1,75%, asesoría legal R$ 8.000 fijos y 1% de cambio
   y remesa calculado SOBRE LA SUMA anterior (el spread cambiario
   se paga sobre todo el dinero que entra al país, no solo sobre
   el precio del lote). */
KP.cierreDe = function (precio) {
  var itbi   = precio * 0.03;
  var escr   = precio * 0.0175;
  var legal  = 8000;
  var cambio = (precio + itbi + escr + legal) * 0.01;
  return { itbi: itbi, escr: escr, legal: legal, cambio: cambio,
           total: itbi + escr + legal + cambio };
};


/* ============================================================
   3. ESCENAS SVG — arte generado por lote
   ------------------------------------------------------------
   El OS solo tiene 3 fotografías y aquí hay 10 lotes. En vez de
   repetir imágenes (que daría la falsa impresión de que dos
   terrenos distintos son el mismo), cada lote dibuja su propia
   escena según lote.scene. Es determinista por id: el mismo lote
   se ve siempre igual, en la tarjeta y en la ficha.

   Los acentos dorado y verde se pintan con style="fill:var(--gold)"
   porque los atributos de presentación de SVG no resuelven
   variables CSS; así el arte sigue la paleta del OS. Los tonos
   oscuros de profundidad son literales: son pigmento de la
   ilustración, no color de interfaz.
   ============================================================ */
KP.sceneSVG = function (l, grande) {
  var u = 'kp' + l.id + (grande ? 'b' : '');   // sufijo único: tarjeta y ficha conviven en el DOM
  var h = grande ? 175 : 210;

  var cielo = { playa:'#1A2B3F', ciudad:'#141B2E', condominio:'#18263A',
                colina:'#152238', valle:'#16233A', bosque:'#132030' }[l.scene] || '#16233A';

  /* El sol se desplaza con el id: variación estable, sin azar. */
  var cx = 300 + (l.id * 13) % 60;
  var sol = '<circle cx="' + cx + '" cy="52" r="16" fill="url(#' + u + 's)"/>' +
            '<circle cx="' + cx + '" cy="52" r="34" style="fill:var(--gold);opacity:.10"/>';

  var mid;
  if (l.scene === 'playa') {
    mid =
      '<rect x="0" y="92" width="400" height="46" fill="url(#' + u + 'm)"/>' +
      '<path d="M0 92h400" style="stroke:var(--gold);opacity:.5" stroke-width="1"/>' +
      '<path d="M20 106h58M96 114h44M300 104h64M210 118h40" stroke="rgba(255,255,255,.14)" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M0 138q120 -14 400 0v80H0z" fill="#20283A"/>' +
      '<path d="M0 148q140 -10 400 -2" style="stroke:var(--gold);opacity:.18" stroke-width="1.5" fill="none"/>' +
      '<g stroke="#0D1420" stroke-width="4" stroke-linecap="round"><path d="M58 140v-26"/><path d="M338 146v-22"/></g>' +
      '<g style="stroke:var(--green)" stroke-width="3" stroke-linecap="round" opacity=".75">' +
        '<path d="M58 114q-12 -8 -20 -4M58 114q2 -13 12 -15M58 114q13 -6 19 2M58 114q-4 -12 -14 -12"/>' +
        '<path d="M338 124q-11 -7 -18 -3M338 124q2 -11 11 -13M338 124q12 -5 17 2"/></g>';
  } else if (l.scene === 'ciudad') {
    mid =
      '<g fill="#1B2438">' +
        '<rect x="36" y="52" width="30" height="86"/><rect x="76" y="30" width="36" height="108"/><rect x="122" y="64" width="26" height="74"/>' +
        '<rect x="158" y="42" width="34" height="96"/><rect x="242" y="56" width="30" height="82"/><rect x="282" y="72" width="24" height="66"/></g>' +
      '<g style="fill:var(--gold);opacity:.55">' +
        '<rect x="82" y="40" width="5" height="5"/><rect x="94" y="40" width="5" height="5"/><rect x="82" y="56" width="5" height="5"/><rect x="100" y="72" width="5" height="5"/>' +
        '<rect x="164" y="52" width="5" height="5"/><rect x="176" y="66" width="5" height="5"/><rect x="164" y="84" width="5" height="5"/>' +
        '<rect x="44" y="64" width="4" height="4"/><rect x="54" y="80" width="4" height="4"/><rect x="248" y="66" width="4" height="4"/><rect x="260" y="84" width="4" height="4"/></g>' +
      '<rect x="0" y="138" width="400" height="80" fill="#20283A"/>' +
      '<path d="M0 138h400" style="stroke:var(--gold);opacity:.35"/>';
  } else if (l.scene === 'condominio') {
    mid =
      '<path d="M0 118q200 -22 400 0v100H0z" fill="#1D2637"/>' +
      '<g fill="#242F44" stroke="#0F1524" stroke-width="1.5">' +
        '<path d="M60 120l16 -12 16 12v18H60zM150 116l16 -12 16 12v20h-32zM250 120l16 -12 16 12v18h-32z"/></g>' +
      '<g style="fill:var(--gold);opacity:.6"><rect x="72" y="126" width="7" height="7"/><rect x="162" y="124" width="7" height="7"/><rect x="262" y="126" width="7" height="7"/></g>' +
      '<g style="stroke:var(--green)" stroke-width="3" stroke-linecap="round" opacity=".7">' +
        '<path d="M110 138v-14M110 126q-8 -7 -13 -4M110 126q8 -8 14 -5"/>' +
        '<path d="M212 140v-14M212 128q-8 -7 -13 -4M212 128q8 -8 14 -5"/>' +
        '<path d="M312 138v-12M312 128q-7 -6 -11 -3M312 128q7 -7 12 -4"/></g>' +
      '<path d="M20 156h360" style="stroke:var(--gold);opacity:.25" stroke-width="1.5" stroke-dasharray="2 6"/>';
  } else if (l.scene === 'colina') {
    mid =
      '<rect x="0" y="96" width="400" height="30" fill="url(#' + u + 'm)"/>' +
      '<path d="M0 96h400" style="stroke:var(--gold);opacity:.45"/>' +
      '<path d="M0 126C90 66 180 92 260 112s110 10 140 4v104H0z" fill="#1E2839"/>' +
      '<path d="M0 126C90 66 180 92 260 112" style="stroke:var(--gold);opacity:.2" stroke-width="1.5" fill="none"/>' +
      '<g style="stroke:var(--green)" stroke-width="2.6" stroke-linecap="round" opacity=".6">' +
        '<path d="M96 96v-10M96 88q-6 -5 -10 -3M96 88q6 -6 10 -4"/>' +
        '<path d="M150 104v-9M150 97q-5 -5 -9 -3M150 97q6 -5 9 -3"/></g>';
  } else if (l.scene === 'valle') {
    mid =
      '<path d="M0 122L70 58l64 64zM96 122l74 -74 86 74zM230 122l58 -50 72 50z" fill="#1B2536"/>' +
      '<path d="M70 58l16 16 -10 4 14 12M170 48l18 18 -12 4 16 14" style="stroke:var(--gold);opacity:.35" stroke-width="1.5" fill="none"/>' +
      '<rect x="0" y="122" width="400" height="96" fill="#20293B"/>' +
      '<path d="M0 150q90 -14 190 0t210 -6" style="stroke:var(--green);opacity:.35" stroke-width="6" fill="none" stroke-linecap="round"/>';
  } else {  /* bosque */
    mid =
      '<rect x="0" y="118" width="400" height="100" fill="#1A2434"/>' +
      '<g fill="#1F3A31">' +
        '<path d="M50 130l14 -34 14 34zM92 132l12 -28 12 28zM160 128l15 -36 15 36zM220 132l12 -26 12 26zM286 128l14 -32 14 32zM340 132l11 -24 11 24z"/></g>' +
      '<g fill="#254A3C" opacity=".8"><path d="M72 138l13 -30 13 30zM136 138l12 -26 12 26zM196 138l13 -30 13 30zM256 138l12 -26 12 26zM318 138l12 -26 12 26z"/></g>' +
      '<rect x="0" y="112" width="400" height="8" fill="rgba(255,255,255,.05)"/>';
  }

  /* La parcela punteada en primer plano: recuerda que lo que se
     vende es SUELO, no la construcción que se ve al fondo. */
  var parcela =
    '<g transform="translate(0,' + (grande ? -14 : 0) + ')">' +
      '<path d="M150 200 L250 200 L272 166 L172 166 Z" style="fill:var(--gold);fill-opacity:.10;stroke:var(--gold)" stroke-width="1.6" stroke-dasharray="7 5"/>' +
      '<g style="fill:var(--gold)"><circle cx="150" cy="200" r="3"/><circle cx="250" cy="200" r="3"/><circle cx="272" cy="166" r="3"/><circle cx="172" cy="166" r="3"/></g>' +
      '<text x="211" y="188" text-anchor="middle" font-size="11" font-weight="700" style="fill:var(--gold)" font-family="Space Grotesk,system-ui,sans-serif" letter-spacing="2">LOTE</text>' +
    '</g>';

  return '<svg viewBox="0 0 400 ' + h + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
    '<defs>' +
      '<linearGradient id="' + u + 'k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0D111C"/><stop offset="1" stop-color="' + cielo + '"/></linearGradient>' +
      '<linearGradient id="' + u + 'm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E4B55"/><stop offset="1" stop-color="#12293A"/></linearGradient>' +
      '<radialGradient id="' + u + 's"><stop offset="0" style="stop-color:var(--gold-hi)"/><stop offset="1" style="stop-color:var(--gold)"/></radialGradient>' +
    '</defs>' +
    '<rect width="400" height="' + h + '" fill="url(#' + u + 'k)"/>' +
    sol + mid + parcela +
  '</svg>';
};


/* ============================================================
   4. AUXILIARES INTERNOS (no forman parte del contrato)
   ============================================================ */
var esc = KP.esc, fmtBRL = KP.fmtBRL, fmtBRLc = KP.fmtBRLc;

/* Enlace de WhatsApp: el shell define waLink(). El respaldo existe
   solo para que la ficha no quede con un enlace roto si este
   archivo se carga aislado (p. ej. en una prueba suelta). */
function wa(txt) {
  return (typeof window.waLink === 'function')
    ? window.waLink(txt)
    : 'https://wa.me/51918616580?text=' + encodeURIComponent(txt);
}

/* Equivalente en dólares: NO se calcula aquí. Se emite el hueco
   que el shell rellena con renderPrices(), para que el importe se
   recalcule solo cuando llega la cotización en vivo. */
function usd(brl) { return '<span class="usd-lbl" data-brl="' + Math.round(brl) + '"></span>'; }

/* Límites del control de precio derivados de los datos, no
   escritos a mano: si mañana entra un lote más caro, el filtro
   sigue alcanzándolo. Se redondean a saltos de 50.000. */
var PASO = 50000;
var PRECIOS = KP.LOTES.map(function (l) { return l.precio; });
var PRECIO_MIN = Math.floor(Math.min.apply(null, PRECIOS) / PASO) * PASO;
var PRECIO_MAX = Math.ceil(Math.max.apply(null, PRECIOS) / PASO) * PASO;

/* Ciudades únicas, ordenadas con criterio español (acentos). */
var CIUDADES = KP.LOTES.map(function (l) { return l.ciudad; })
  .filter(function (c, i, a) { return a.indexOf(c) === i; })
  .sort(function (a, b) { return a.localeCompare(b, 'es'); });

/* ---- Estado de los filtros ----
   Vive en el módulo, NO en el DOM: la ventana del catálogo puede
   cerrarse y reabrirse (el shell destruye el nodo) y el usuario
   debe reencontrar su selección tal como la dejó. */
var filtros = { ciudad:'all', tipo:'all', precioMax: PRECIO_MAX };

function filtrados() {
  return KP.LOTES.filter(function (l) {
    return (filtros.ciudad === 'all' || l.ciudad === filtros.ciudad) &&
           (filtros.tipo   === 'all' || l.tipo   === filtros.tipo) &&
           (l.precio <= filtros.precioMax);
  }).sort(function (a, b) { return a.precio - b.precio; });  // de menor a mayor: acompaña al tope de precio
}


/* ============================================================
   5. ESTILOS PROPIOS
   ------------------------------------------------------------
   Todo lo que no existe ya en index.html va aquí, con prefijo
   .kp- para no chocar con el shell ni con los otros módulos.
   Se inyecta dentro del string de la plantilla: si la ventana
   nunca se abre, el CSS nunca entra al documento.
   ============================================================ */
var CSS = '<style>' +
  /* — barra de filtros — */
  '.kp-cat-filtros{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px 14px;align-items:end;' +
    'margin-bottom:18px;padding:14px 15px;border-radius:12px;background:rgba(255,255,255,.045);border:1px solid var(--line)}' +
  '.kp-cat-f{display:flex;flex-direction:column;gap:7px;min-width:0}' +
  '.kp-cat-f label{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--txt-dim)}' +
  '.kp-cat-f label b{font-size:11px;letter-spacing:.04em;color:var(--gold-hi);font-weight:600}' +
  '.kp-cat-f select{width:100%;max-width:100%;color-scheme:dark;font-family:inherit;font-size:12px;color:var(--txt);' +
    'background:var(--glass-hi);border:1px solid var(--line);border-radius:9px;padding:9px 10px}' +
  '.kp-cat-f input[type=range]{width:100%;accent-color:var(--gold);background:transparent}' +
  '.kp-cat-filtros :focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:6px}' +
  '.kp-cat-count{align-self:end;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--txt-dim);padding-bottom:8px}' +
  '.kp-cat-count b{font-family:"Space Grotesk",sans-serif;font-size:15px;color:var(--gold-hi)}' +
  /* — tarjetas con escena SVG en vez de fotografía — */
  '.kp-cat-grid .card{cursor:default}' +
  '.kp-cat-grid .ph svg{width:100%;height:100%;display:block;transition:transform .6s ease}' +
  '.kp-cat-grid .card:hover .ph svg{transform:scale(1.06)}' +
  '.kp-cat-grid .card .price{gap:10px;flex-wrap:wrap}' +
  '.kp-cat-vacio{grid-column:1/-1;padding:34px 18px;text-align:center;font-size:12.5px;line-height:1.7;' +
    'color:var(--txt-dim);border:1px dashed var(--line);border-radius:12px}' +
  '.kp-cat-pie{margin-top:18px;font-size:10.5px;line-height:1.75;color:var(--txt-dim)}' +
  /* — ficha del lote — */
  '.kp-lote-hero svg{width:100%;height:100%;display:block}' +
  '.kp-lote-aviso{margin:18px 24px 0}' +
  '.kp-lote-extras{display:flex;flex-wrap:wrap;gap:8px;padding:16px 24px 0;list-style:none}' +
  '.kp-lote-extras li{font-size:10.5px;letter-spacing:.04em;color:var(--txt-dim);' +
    'background:rgba(255,255,255,.045);border:1px solid var(--line);border-radius:20px;padding:6px 12px}' +
  /* — tabla de costos de cierre — */
  '.kp-cierre{margin:20px 24px 0}' +
  '.kp-cierre h3{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--txt-dim);margin-bottom:10px}' +
  '.kp-cierre-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:rgba(14,16,20,.55)}' +
  '.kp-cierre table{width:100%;min-width:320px;border-collapse:collapse;font-size:12px}' +
  '.kp-cierre th,.kp-cierre td{padding:10px 12px;text-align:right;border-bottom:1px solid var(--line)}' +
  '.kp-cierre thead th{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--txt-dim);font-weight:600}' +
  '.kp-cierre th[scope=row]{text-align:left;font-weight:400;color:var(--txt)}' +
  '.kp-cierre td{color:rgba(238,241,244,.82);font-variant-numeric:tabular-nums;white-space:nowrap}' +
  '.kp-cierre tfoot th,.kp-cierre tfoot td{border-bottom:none;border-top:1px solid var(--line);font-weight:600;color:var(--txt)}' +
  '.kp-cierre tfoot tr:last-child th{color:var(--gold-hi)}' +
  '.kp-cierre tfoot tr:last-child td{color:var(--gold-hi);font-family:"Space Grotesk",sans-serif;font-size:13px}' +
  '.kp-cierre-pie{margin-top:10px;font-size:10.5px;line-height:1.7;color:var(--txt-dim)}' +
  '.kp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
  '.kp-lote-hero .h-txt h2,.kp-cat-grid .card h3{overflow-wrap:anywhere}' +
  /* — móvil: a 375 px una sola columna y nada que desborde — */
  '@media(max-width:520px){' +
    '.kp-cat-filtros{grid-template-columns:1fr}' +
    '.kp-cat-count{padding-bottom:0}' +
    '.kp-cierre,.kp-lote-aviso{margin-left:16px;margin-right:16px}' +
  '}' +
'</style>';


/* ============================================================
   6. VENTANA · CATÁLOGO
   ============================================================ */

/* Una tarjeta. La escena SVG sustituye a la fotografía; el sello
   superior izquierdo lleva el tipo de lote (dato real) en vez de
   una referencia inventada. */
function tarjeta(l) {
  var msg = 'Hola KIPU, me interesa el lote de ' + l.barrio + ', ' + l.ciudad +
            ' (' + nf0.format(l.m2) + ' m², ' + fmtBRL(l.precio) + '). ¿Me envían más información?';
  return '<article class="card">' +
    '<div class="ph">' + KP.sceneSVG(l) +
      '<span class="ref">' + esc(KP.TIPO_LBL[l.tipo]) + '</span>' +
      '<span class="m2">' + nf0.format(l.m2) + ' m²</span>' +
    '</div>' +
    '<div class="info">' +
      '<h3>' + esc(l.barrio) + '</h3>' +
      '<div class="loc">◈ ' + esc(l.ciudad) + ' · ' + esc(l.dist) + '</div>' +
      '<div class="price"><b>' + fmtBRL(l.precio) + '</b><span>≈ ' + usd(l.precio) + '</span></div>' +
      '<div class="cta-row">' +
        '<button class="btn btn-gold" data-open="lote:' + l.id + '">Ver ficha</button>' +
        '<a class="btn btn-wa" target="_blank" rel="noopener" href="' + esc(wa(msg)) + '">WhatsApp</a>' +
      '</div>' +
    '</div>' +
  '</article>';
}

function tarjetas(ls) {
  if (!ls.length) {
    return '<p class="kp-cat-vacio">Ningún terreno coincide con esos filtros.<br>' +
           'Sube el tope de precio o vuelve a «Todas las ciudades».</p>';
  }
  return ls.map(tarjeta).join('');
}

function contadorHTML(n) {
  return '<b>' + n + '</b> terreno' + (n === 1 ? '' : 's') +
         (n < KP.LOTES.length ? ' de ' + KP.LOTES.length : '');
}

function opciones(lista, valorActual) {
  return lista.map(function (o) {
    return '<option value="' + esc(o.v) + '"' + (o.v === valorActual ? ' selected' : '') + '>' + esc(o.t) + '</option>';
  }).join('');
}

KP.tpl.catalogo = function () {
  var ls = filtrados();

  var optCiudad = opciones(
    [{ v:'all', t:'Todas las ciudades' }].concat(CIUDADES.map(function (c) { return { v:c, t:c }; })),
    filtros.ciudad);

  var optTipo = opciones(
    [{ v:'all', t:'Todos los tipos' }].concat(Object.keys(KP.TIPO_LBL).map(function (k) {
      return { v:k, t:KP.TIPO_LBL[k] };
    })), filtros.tipo);

  return CSS + '<div class="pad">' +
    '<div class="sec-head">' +
      '<h2>Catálogo de <em>terrenos</em></h2>' +
      '<p>Santa Catarina, Brasil · ' + KP.LOTES.length + ' lotes · precio en reales y su equivalente en dólares al cambio del día</p>' +
    '</div>' +

    '<div class="kp-cat-filtros" role="group" aria-label="Filtros del catálogo">' +
      '<div class="kp-cat-f">' +
        '<label for="kp-f-ciudad">Ciudad</label>' +
        '<select id="kp-f-ciudad">' + optCiudad + '</select>' +
      '</div>' +
      '<div class="kp-cat-f">' +
        '<label for="kp-f-tipo">Tipo</label>' +
        '<select id="kp-f-tipo">' + optTipo + '</select>' +
      '</div>' +
      '<div class="kp-cat-f">' +
        '<label for="kp-f-precio">Precio máximo <b id="kp-f-precio-v">' + fmtBRLc(filtros.precioMax) + '</b></label>' +
        '<input type="range" id="kp-f-precio" min="' + PRECIO_MIN + '" max="' + PRECIO_MAX + '" step="' + PASO + '" ' +
          'value="' + filtros.precioMax + '" aria-describedby="kp-f-precio-v">' +
      '</div>' +
      '<p class="kp-cat-count" id="kp-cat-count" role="status" aria-live="polite">' + contadorHTML(ls.length) + '</p>' +
    '</div>' +

    '<div class="grid kp-cat-grid" id="kp-cat-grid">' + tarjetas(ls) + '</div>' +

    '<p class="kp-cat-pie">Precios referenciales del mercado catarinense (jul. 2026), sujetos a verificación de matrícula y medidas antes de cualquier reserva. ' +
      'Los porcentajes de valorización que aparecen en las fichas son datos históricos de cada zona (FipeZAP / MySide, 2019–2026): ' +
      'describen lo que ya ocurrió y no anticipan resultados futuros. KIPU no garantiza revalorización de ningún terreno.</p>' +
  '</div>';
};

/* ---- Enganche de eventos ----
   El shell (index.html) asocia los [data-open] UNA sola vez, al
   crear la ventana. Como aquí se repinta la rejilla, los botones
   nuevos nacen sin ese enganche: hay que volver a asociarlos.
   Se marcan los ya asociados para no duplicar el del shell. */
function engancharOpen(scope) {
  scope.querySelectorAll('[data-open]').forEach(function (el) {
    if (el.dataset.kpOpen) return;
    el.dataset.kpOpen = '1';
    if (typeof window.openWindow !== 'function') return;
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      window.openWindow(el.dataset.open);
    });
  });
}

KP.init.catalogo = function (root) {
  if (!root) return;
  var grid  = root.querySelector('#kp-cat-grid');
  var cuenta = root.querySelector('#kp-cat-count');
  var selCiudad = root.querySelector('#kp-f-ciudad');
  var selTipo   = root.querySelector('#kp-f-tipo');
  var rgPrecio  = root.querySelector('#kp-f-precio');
  var lblPrecio = root.querySelector('#kp-f-precio-v');
  if (!grid) return;

  /* Lo que ya está en el DOM lo enganchó el shell: se marca para
     no añadirle un segundo escuchador. */
  root.querySelectorAll('[data-open]').forEach(function (el) { el.dataset.kpOpen = '1'; });

  /* Repinta SOLO la rejilla y el contador, nunca la ventana
     entera: así el foco del teclado no salta fuera del control
     que el usuario está manipulando. */
  function pintar() {
    var ls = filtrados();
    grid.innerHTML = tarjetas(ls);
    if (cuenta) cuenta.innerHTML = contadorHTML(ls.length);
    engancharOpen(grid);
    /* Los dólares los pone el shell: hay que pedírselo tras repintar. */
    if (typeof window.renderPrices === 'function') window.renderPrices();
  }

  if (selCiudad) selCiudad.addEventListener('change', function () { filtros.ciudad = this.value; pintar(); });
  if (selTipo)   selTipo.addEventListener('change',   function () { filtros.tipo   = this.value; pintar(); });
  if (rgPrecio)  rgPrecio.addEventListener('input',   function () {
    filtros.precioMax = +this.value;
    if (lblPrecio) lblPrecio.textContent = fmtBRLc(filtros.precioMax);
    pintar();
  });
};


/* ============================================================
   7. VENTANA · FICHA DE UN LOTE
   ------------------------------------------------------------
   El shell abre las fichas con data-open="lote:ID"; aquí se
   acepta tanto "lote:7" como 7 para que el enrutado del shell
   pueda pasar cualquiera de los dos.
   ============================================================ */
KP.tpl.lote = function (ref) {
  var id = parseInt(String(ref).replace(/^lote:/, ''), 10);
  var l = KP.LOTES.filter(function (x) { return x.id === id; })[0];

  if (!l) {
    return CSS + '<div class="pad"><div class="sec-head"><h2>Terreno <em>no encontrado</em></h2>' +
      '<p>Ese lote ya no está en el catálogo.</p></div>' +
      '<div class="actions" style="padding-left:0;padding-right:0">' +
      '<button class="btn btn-ghost" data-open="catalogo">← Volver al catálogo</button></div></div>';
  }

  var c        = KP.cierreDe(l.precio);
  var total    = l.precio + c.total;
  var precioM2 = Math.round(l.precio / l.m2);
  var msgWA    = 'Hola KIPU, quiero información del lote de ' + l.barrio + ', ' + l.ciudad +
                 ' (' + nf0.format(l.m2) + ' m², ' + fmtBRL(l.precio) + '). ¿Me envían la matrícula y las medidas?';

  /* Fila de la tabla de cierre: concepto, base de cálculo (para
     que el número sea auditable) e importe. */
  function fila(concepto, base, monto) {
    return '<tr><th scope="row">' + concepto + '</th><td>' + base + '</td><td>' + fmtBRL(monto) + '</td></tr>';
  }

  return CSS +
  '<div class="hero kp-lote-hero">' + KP.sceneSVG(l, true) +
    '<div class="h-txt">' +
      '<div class="ref">' + esc(KP.TIPO_LBL[l.tipo]) + ' · ' + esc(l.ciudad) + '</div>' +
      '<h2>' + esc(l.barrio) + '</h2>' +
    '</div>' +
  '</div>' +

  '<div class="badges">' +
    '<span class="badge gold">◆ ' + esc(KP.TIPO_LBL[l.tipo]) + '</span>' +
    '<span class="badge">◈ ' + esc(l.dist) + '</span>' +
    '<span class="badge">▲ ' + KP.fmtPct(l.valPct) + ' anual · histórico de zona</span>' +
    (l.financiable ? '<span class="badge">◷ Hasta ' + l.financiable + ' cuotas</span>' : '') +
  '</div>' +

  '<div class="specs">' +
    '<div class="spec"><div class="k">Área</div><div class="v">' + nf0.format(l.m2) + ' m²</div></div>' +
    '<div class="spec"><div class="k">Precio por m²</div><div class="v">' + fmtBRL(precioM2) + '</div></div>' +
    '<div class="spec"><div class="k">Tipo</div><div class="v">' + esc(KP.TIPO_LBL[l.tipo]) + '</div></div>' +
    '<div class="spec"><div class="k">Ubicación</div><div class="v">' + esc(l.dist) + '</div></div>' +
    '<div class="spec"><div class="k">Financiación</div><div class="v">' +
      (l.financiable ? 'Hasta ' + l.financiable + ' cuotas' : 'Al contado') + '</div></div>' +
  '</div>' +

  '<div class="pricebox">' +
    '<div>' +
      '<div class="p-brl">' + fmtBRL(l.precio) + '</div>' +
      '<div class="p-usd">≈ <b class="usd-lbl" data-brl="' + l.precio + '"></b> al tipo de cambio de hoy</div>' +
    '</div>' +
    '<div class="per-m2">Precio por m²<b>' + fmtBRL(precioM2) + '</b></div>' +
  '</div>' +

  '<p class="desc">' + esc(l.desc) + '</p>' +

  '<ul class="kp-lote-extras">' +
    (l.extras || []).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') +
  '</ul>' +

  /* Aviso obligatorio: el % que aparece arriba es historia de la
     zona, con fuente, y no una promesa sobre este lote. */
  '<p class="sm-aviso kp-lote-aviso">▲ <b>El ' + KP.fmtPct(l.valPct) + ' anual es un dato histórico de la zona</b> ' +
    '(FipeZAP / MySide, 2019–2026), no una previsión ni un compromiso sobre este terreno. ' +
    'El mercado inmobiliario puede subir o bajar y la inversión en suelo es ilíquida: vender puede tomar meses.</p>' +

  '<section class="kp-cierre">' +
    '<h3>Costos de cierre estimados</h3>' +
    '<div class="kp-cierre-wrap">' +
      '<table>' +
        '<caption class="kp-sr">Desglose de los costos de cierre del lote de ' + esc(l.barrio) + ', ' + esc(l.ciudad) + '</caption>' +
        '<thead><tr><th scope="col">Concepto</th><th scope="col">Base de cálculo</th><th scope="col">Importe</th></tr></thead>' +
        '<tbody>' +
          fila('ITBI (transferencia municipal)', '3% del precio', c.itbi) +
          fila('Escritura y registro', '1,75% del precio', c.escr) +
          fila('Asesoría legal', 'monto fijo', c.legal) +
          fila('Cambio y remesa', '1% de la suma anterior', c.cambio) +
        '</tbody>' +
        '<tfoot>' +
          '<tr><th scope="row">Total de cierre</th><td></td><td>' + fmtBRL(c.total) + '</td></tr>' +
          '<tr><th scope="row">Necesario en total (precio + cierre)</th><td></td><td>' + fmtBRL(total) + '</td></tr>' +
        '</tfoot>' +
      '</table>' +
    '</div>' +
    '<p class="kp-cierre-pie">Equivalente del desembolso total: ≈ ' + usd(total) + ' al cambio de hoy. ' +
      'Estimación con los porcentajes habituales en Santa Catarina; el ITBI y los aranceles del cartório varían por municipio y por operación. ' +
      'Confirma cada importe con tu abogado en Brasil antes de firmar.</p>' +
  '</section>' +

  '<div class="actions">' +
    '<a class="btn btn-wa" target="_blank" rel="noopener" href="' + esc(wa(msgWA)) + '">◉ Consultar este lote por WhatsApp</a>' +
    '<button class="btn btn-gold" data-open="simulador">Ver en el simulador</button>' +
    '<button class="btn btn-ghost" data-open="catalogo">← Volver al catálogo</button>' +
  '</div>';
};

})(window, document);
