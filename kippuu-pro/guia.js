/* ============================================================
   KIPU PRO — Santa Catarina OS
   guia.js · Ventanas "Guía del proceso" y "Preguntas frecuentes"
   ------------------------------------------------------------
   Portado desde terrenos.html (secciones #proceso y #faq).
   Este archivo NO define datos ni depende de KP.LOTES: los dos
   contenidos son estáticos. Se carga con <script src> antes del
   motor del OS y solo cuelga plantillas e inicializadores de
   window.KP, que el gestor de ventanas invoca cuando toca.

   Contrato:
     KP.tpl.proceso()      -> string HTML
     KP.tpl.faq()          -> string HTML
     KP.init.proceso(root) -> sin eventos (definido igualmente)
     KP.init.faq(root)     -> engancha el acordeón accesible

   Del shell (index.html) se usan, y solo en tiempo de ejecución
   —cuando la ventana se abre, no al cargar el archivo—:
     waLink(texto)   -> URL de WhatsApp
     renderPrices()  -> rellena los <span class="usd-lbl" data-brl>
   Por eso los precios en dólares NUNCA se calculan aquí: se emite
   el span con data-brl y el shell lo rellena y lo reajusta cuando
   llega la cotización real.
   ============================================================ */
window.KP = window.KP || {};
window.KP.tpl  = window.KP.tpl  || {};
window.KP.init = window.KP.init || {};

(function () {
  'use strict';

  /* Alias local al espacio común: se escribe siempre sobre el mismo
     objeto que ya crearon (o crearán) los otros archivos del OS. */
  var KP = window.KP;

  /* ----------------------------------------------------------
     Utilidad interna: enlace de WhatsApp con red de seguridad.
     El shell define waLink() en un <script> posterior al nuestro;
     como las plantillas se ejecutan al abrir la ventana, para
     entonces ya existe. El fallback cubre el caso de que este
     archivo se reutilice en una página sin el motor del OS.
     ---------------------------------------------------------- */
  function wa(texto) {
    if (typeof window.waLink === 'function') return window.waLink(texto);
    return 'https://wa.me/51918616580?text=' + encodeURIComponent(texto);
  }

  /* Contador para IDs únicos del acordeón: si la ventana se cierra
     y se vuelve a abrir, la instancia nueva no hereda IDs viejos. */
  var faqSeq = 0;

  /* ==========================================================
     ESTILOS DE LA GUÍA
     Van dentro del string de la plantilla (no hay hoja aparte) y
     con prefijo .kp-gp-* para no chocar con nada del OS. Solo
     variables CSS del sistema; ningún hexadecimal suelto.
     ========================================================== */
  var CSS_PROCESO = [
    '<style>',
    /* Rejilla: pasos a la izquierda, tarjetas laterales a la derecha.
       A 760px (mismo corte que usa el OS para poner la ventana a
       pantalla completa) colapsa a una columna y las tarjetas caen
       debajo de la línea de tiempo. */
    '.kp-gp-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,.9fr);gap:20px;align-items:start}',
    '.kp-gp-steps{position:relative;min-width:0}',
    /* Cada paso: círculo numerado + cuerpo. El ::before dibuja la
       línea que conecta un círculo con el siguiente; el último no
       la lleva para que la línea no quede colgando. */
    '.kp-gp-step{display:grid;grid-template-columns:46px minmax(0,1fr);gap:14px;position:relative;padding-bottom:22px}',
    '.kp-gp-step:last-child{padding-bottom:0}',
    '.kp-gp-step::before{content:"";position:absolute;left:22px;top:52px;bottom:4px;width:2px;background:linear-gradient(180deg,var(--gold-dim),var(--line))}',
    '.kp-gp-step:last-child::before{display:none}',
    '.kp-gp-num{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;',
    'font-family:"Space Grotesk",sans-serif;font-size:16px;font-weight:600;color:var(--gold-hi);',
    'background:linear-gradient(140deg,rgba(227,184,92,.18),rgba(227,184,92,.04));',
    'border:1px solid rgba(227,184,92,.45);box-shadow:0 0 22px rgba(227,184,92,.14);position:relative;z-index:1}',
    '.kp-gp-body{background:rgba(255,255,255,.045);border:1px solid var(--line);border-radius:14px;padding:15px 17px;min-width:0}',
    '.kp-gp-body h3{font-size:14px;font-weight:600;letter-spacing:.02em;color:var(--txt);overflow-wrap:anywhere}',
    '.kp-gp-body p{font-size:12.8px;line-height:1.72;color:rgba(238,241,244,.82);font-weight:300;overflow-wrap:anywhere}',
    '.kp-gp-body p b{color:var(--txt);font-weight:600}',
    /* Metadatos del paso (plazo, costo, requisito). Chips neutras,
       la del plazo en dorado — igual que en la página antigua. */
    '.kp-gp-meta{display:flex;flex-wrap:wrap;gap:7px;margin:9px 0 10px}',
    '.kp-gp-chip{font-size:10.5px;letter-spacing:.06em;padding:5px 11px;border-radius:20px;',
    'background:rgba(255,255,255,.05);border:1px solid var(--line);color:var(--txt-dim);white-space:nowrap}',
    '.kp-gp-chip.gold{background:rgba(227,184,92,.1);border-color:rgba(227,184,92,.3);color:var(--gold-hi);font-weight:600}',
    /* Columna de tarjetas laterales */
    '.kp-gp-side{min-width:0}',
    '.kp-gp-card{background:rgba(255,255,255,.045);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:14px}',
    '.kp-gp-card:last-child{margin-bottom:0}',
    '.kp-gp-card h3{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:var(--gold-hi);margin-bottom:10px}',
    '.kp-gp-card ul{list-style:none;margin:0;padding:0}',
    /* El marcador ✓ / ! distingue dato de advertencia por FORMA,
       no solo por color: quien no percibe el matiz igual lo lee. */
    '.kp-gp-card li{font-size:12px;line-height:1.6;color:var(--txt-dim);padding:7px 0;border-bottom:1px dashed var(--line);',
    'display:grid;grid-template-columns:14px minmax(0,1fr);gap:9px;align-items:start;overflow-wrap:anywhere}',
    '.kp-gp-card li:last-child{border-bottom:none}',
    '.kp-gp-card li::before{content:"\\2713";color:var(--gold);font-weight:700}',
    '.kp-gp-card li.kp-gp-warn::before{content:"!";color:var(--gold-hi);font-weight:800;text-align:center}',
    '.kp-gp-card li b{color:var(--txt);font-weight:600}',
    '.kp-gp-card p{font-size:12px;line-height:1.65;color:var(--txt-dim);overflow-wrap:anywhere}',
    '.kp-gp-card p b{color:var(--txt);font-weight:600}',
    '.kp-gp-big{font-family:"Space Grotesk",sans-serif;font-size:19px;font-weight:600;color:var(--gold-hi)}',
    '.kp-gp-cta{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}',
    '.kp-gp-cta .btn{flex:1 1 220px;padding:12px;display:inline-flex;align-items:center;justify-content:center;gap:8px}',
    /* Móvil: una sola columna, círculos algo menores. A 375px nada
       desborda porque todas las celdas son minmax(0,1fr). */
    '@media (max-width:760px){',
    '.kp-gp-grid{grid-template-columns:minmax(0,1fr);gap:16px}',
    '.kp-gp-step{grid-template-columns:38px minmax(0,1fr);gap:11px}',
    '.kp-gp-num{width:38px;height:38px;font-size:14px}',
    '.kp-gp-step::before{left:18px;top:44px}',
    '}',
    '</style>'
  ].join('');

  /* ==========================================================
     DATOS DE LOS 7 PASOS
     Textos copiados de terrenos.html #proceso. Solo se tocaron los
     dos puntos donde la redacción daba por hecho que habrá ganancia
     ("repatriar la ganancia" -> "y, si la hubiera, la ganancia"),
     porque la casa no promete retorno de ninguna forma, ni implícita.
     ========================================================== */
  var PASOS = [
    {
      n: 1,
      titulo: 'Obtén tu CPF (Cadastro de Pessoa Física)',
      meta: [{ t: '1–5 días', gold: true }, { t: 'Gratuito o costo mínimo' }, { t: 'Solo pasaporte' }],
      texto: 'Es tu número de identificación tributaria en Brasil, <b>indispensable para comprar</b>. Se tramita ante la Receita Federal — también desde el consulado de Brasil en Lima o en línea, sin viajar.'
    },
    {
      n: 2,
      titulo: 'Elige el terreno y haz la verificación (due diligence)',
      meta: [{ t: '1–2 semanas', gold: true }, { t: 'Abogado local recomendado' }],
      texto: 'Se solicita la <b>matrícula actualizada</b> del inmueble en el Registro de Imóveis y las <b>certidões negativas</b> (deudas, embargos, litigios) del terreno y del vendedor. También se confirma zonificación y potencial constructivo en la municipalidad.'
    },
    {
      n: 3,
      titulo: 'Reserva y contrato de compromiso',
      meta: [{ t: '2–4 semanas', gold: true }, { t: 'Señal típica: 10–20%' }],
      texto: 'Se firma el <b>contrato de promessa de compra e venda</b> con el precio, plazos y penalidades. En lotes nuevos es común la <b>financiación directa del desarrollador</b>: cuota inicial + cuotas mensuales hasta en 60 meses.'
    },
    {
      n: 4,
      titulo: 'Envía el dinero por canal regulado',
      meta: [{ t: '5–10 días útiles', gold: true }, { t: 'Remesa registrada' }],
      /* Reescrito el final: la versión antigua decía "repatriar la
         ganancia", que presupone que la habrá. El trámite habilita a
         repatriar; no anticipa resultado. */
      texto: 'El ingreso de fondos debe hacerse por <b>canales cambiarios regulados</b> y quedar registrado ante el Banco Central do Brasil (contrato de câmbio): eso documenta el origen de tu capital y te habilita a <b>repatriar tu capital y, si la hubiera, la ganancia</b> al vender. KIPU acompaña la ruta S/ → USDT → R$ con trazabilidad completa.'
    },
    {
      n: 5,
      titulo: 'Escritura pública y pago del ITBI',
      meta: [{ t: '1–2 semanas', gold: true }, { t: 'ITBI: 2–4% del valor' }],
      texto: 'Antes de escriturar se paga el <b>ITBI</b> (impuesto municipal de transferencia). Luego se firma la <b>escritura pública</b> en el Cartório de Notas — presencialmente o mediante poder.'
    },
    {
      n: 6,
      titulo: 'Registro del inmueble a tu nombre',
      meta: [{ t: '10–20 días', gold: true }, { t: 'Cartório de Registro de Imóveis' }],
      texto: 'En Brasil, <b>solo es dueño quien registra</b>: la escritura se inscribe en la matrícula del inmueble y desde ese momento el terreno está legalmente a tu nombre, con efectos frente a terceros.'
    },
    {
      n: 7,
      titulo: 'Administra tu inversión',
      meta: [{ t: 'IPTU anual' }, { t: 'Venta: 15% sobre la ganancia' }],
      /* Mismo ajuste que el paso 4, por la misma razón. */
      texto: 'Pagarás el <b>IPTU</b> (impuesto predial) cada año. Al vender, el no residente tributa <b>15% sobre la ganancia de capital</b>; con la remesa registrada del paso 4, puedes repatriar a Perú tu capital y, si la hubiera, la utilidad, por vía formal.'
    }
  ];

  /* ==========================================================
     KP.tpl.proceso()
     Línea de tiempo vertical + columna de tarjetas laterales.
     ========================================================== */
  KP.tpl.proceso = function () {
    var pasos = PASOS.map(function (p) {
      var chips = p.meta.map(function (m) {
        return '<span class="kp-gp-chip' + (m.gold ? ' gold' : '') + '">' + m.t + '</span>';
      }).join('');
      return '' +
        '<li class="kp-gp-step">' +
          '<span class="kp-gp-num" aria-hidden="true">' + p.n + '</span>' +
          '<div class="kp-gp-body">' +
            /* El número también va en el texto del encabezado para
               quien navega con lector de pantalla: el círculo es
               decorativo (aria-hidden) y no debe ser el único dato. */
            '<h3>Paso ' + p.n + '. ' + p.titulo + '</h3>' +
            '<div class="kp-gp-meta">' + chips + '</div>' +
            '<p>' + p.texto + '</p>' +
          '</div>' +
        '</li>';
    }).join('');

    return CSS_PROCESO +
    '<div class="pad">' +
      '<div class="sec-head">' +
        '<h2>Cómo comprar un terreno en Brasil siendo <em>peruano</em></h2>' +
        '<p>No necesitas visa ni residencia: con pasaporte vigente y un CPF puedes comprar propiedad urbana a tu nombre. Este es el camino completo, paso a paso.</p>' +
      '</div>' +

      '<div class="kp-gp-grid">' +

        /* --- Columna 1: los 7 pasos, como lista ordenada real --- */
        '<ol class="kp-gp-steps">' + pasos + '</ol>' +

        /* --- Columna 2: tarjetas de apoyo --- */
        '<div class="kp-gp-side">' +

          '<section class="kp-gp-card">' +
            '<h3>Documentos que necesitas</h3>' +
            '<ul>' +
              '<li><span>Pasaporte peruano vigente</span></li>' +
              '<li><span>CPF brasileño (paso 1)</span></li>' +
              '<li><span>Comprobante de origen de fondos (extractos, declaración de renta)</span></li>' +
              '<li><span>Documentos traducidos por traductor juramentado + apostilla de La Haya</span></li>' +
              '<li><span>Poder (procuração) apostillado, si compras a distancia</span></li>' +
            '</ul>' +
          '</section>' +

          '<section class="kp-gp-card">' +
            '<h3>Compra 100% a distancia</h3>' +
            '<p>Puedes completar toda la operación <b>sin viajar a Brasil</b>: se otorga un poder ante notario peruano, se apostilla y un representante firma la escritura por ti en el cartório. Muchos inversionistas extranjeros compran así.</p>' +
          '</section>' +

          '<section class="kp-gp-card">' +
            '<h3>Costos de cierre estimados</h3>' +
            '<ul>' +
              '<li><span>ITBI municipal: 2–4% del valor</span></li>' +
              '<li><span>Escritura + registro: ≈ 1,5–2%</span></li>' +
              /* El equivalente en dólares lo rellena el shell con la
                 cotización en vivo: aquí solo se declara el data-brl. */
              '<li><span>Asesoría legal: R$ 5.000–10.000 ' +
                '<br><small style="color:var(--txt-dim)">≈ <span class="usd-lbl" data-brl="5000"></span> – <span class="usd-lbl" data-brl="10000"></span> al cambio de hoy</small></span></li>' +
              '<li><span>Cambio y remesa: ≈ 1%</span></li>' +
            '</ul>' +
            '<p style="margin-top:10px">Total típico: <span class="kp-gp-big">5–8%</span><br>adicional al precio del terreno.</p>' +
          '</section>' +

          '<section class="kp-gp-card">' +
            '<h3>Restricciones a conocer</h3>' +
            '<ul>' +
              '<li><span><b>Propiedad urbana:</b> sin restricciones para extranjeros — aplica a todo el catálogo costero.</span></li>' +
              '<li class="kp-gp-warn"><span><b>Propiedad rural:</b> la Ley 5.709/71 limita la superficie (hasta 50 módulos; trámites ante INCRA).</span></li>' +
              '<li class="kp-gp-warn"><span><b>Faixa de fronteira:</b> franja de 150 km junto a la frontera (oeste de SC) exige autorizaciones especiales. La costa no está en esa zona.</span></li>' +
            '</ul>' +
          '</section>' +

        '</div>' +
      '</div>' +

      '<div class="kp-gp-cta">' +
        '<a class="btn btn-wa" target="_blank" rel="noopener" href="' +
          wa('Hola KIPU, quiero repasar el proceso de compra de un terreno en Brasil desde Perú (CPF, remesa, escritura y registro).') +
        '">◉ Repasar el proceso con un asesor</a>' +
        '<a class="btn btn-ghost" href="mailto:contacto@kippuu.com?subject=' +
          encodeURIComponent('Guía del proceso de compra — Santa Catarina') +
        '">Pedir la guía por correo</a>' +
      '</div>' +

      /* Pie legal obligatorio: esto es información, no asesoría. */
      '<p class="sm-pie">Plazos, porcentajes y costos son referencias del mercado catarinense y varían según municipio, cartório y operación. ' +
      'Esta guía es información general, <b>no es asesoría legal, tributaria ni financiera</b>: cada operación debe revisarla un abogado habilitado en Brasil antes de firmar o transferir dinero.</p>' +
    '</div>';
  };

  /* ==========================================================
     KP.init.proceso(root)
     La guía es contenido estático: no engancha ningún evento. Se
     define igualmente para que el shell pueda llamarla siempre,
     sin comprobar si existe.
     ========================================================== */
  KP.init.proceso = function (root) {
    /* sin eventos: nada que enganchar */
  };

  /* ==========================================================
     ESTILOS DEL FAQ
     ========================================================== */
  var CSS_FAQ = [
    '<style>',
    '.kp-faq-list{display:flex;flex-direction:column;gap:9px;max-width:820px}',
    /* Pieza abierta: además del glifo +/− cambia el fondo, aparece
       una barra lateral y el título pasa a semibold. El estado NO
       depende de un solo indicador ni del color. */
    '.kp-faq-item{background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:12px;overflow:hidden;transition:border-color .25s,background .25s}',
    '.kp-faq-item.kp-open{border-color:var(--gold-dim);background:rgba(227,184,92,.06)}',
    '.kp-faq-q{width:100%;display:grid;grid-template-columns:minmax(0,1fr) 22px;align-items:center;gap:12px;',
    'text-align:left;padding:14px 16px;font-size:13px;font-weight:500;line-height:1.5;color:var(--txt);',
    'border-left:3px solid transparent;transition:border-color .25s,color .2s;overflow-wrap:anywhere}',
    '.kp-faq-q:hover{color:var(--gold-hi)}',
    /* Foco visible y grueso: requisito de la casa. */
    '.kp-faq-q:focus-visible{outline:2px solid var(--gold-hi);outline-offset:-3px}',
    '.kp-faq-item.kp-open .kp-faq-q{border-left-color:var(--gold);font-weight:600;color:var(--gold-hi)}',
    '.kp-faq-sign{font-family:"Space Grotesk",sans-serif;font-size:17px;font-weight:600;color:var(--gold);',
    'line-height:1;text-align:center;transition:transform .22s ease}',
    '.kp-faq-item.kp-open .kp-faq-sign{transform:rotate(180deg)}',
    '.kp-faq-a{padding:0 18px 16px 19px;font-size:12.8px;line-height:1.75;color:rgba(238,241,244,.82);font-weight:300;overflow-wrap:anywhere}',
    '.kp-faq-a[hidden]{display:none}',
    '.kp-faq-a b{color:var(--txt);font-weight:600}',
    '.kp-faq-a{animation:kp-faq-in .22s ease}',
    '@keyframes kp-faq-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}',
    /* Quien pide menos movimiento no recibe animación. */
    '@media (prefers-reduced-motion:reduce){.kp-faq-a{animation:none}.kp-faq-sign{transition:none}}',
    '</style>'
  ].join('');

  /* ==========================================================
     LAS 7 PREGUNTAS
     Copiadas de terrenos.html #faq. Dos ajustes marcados abajo.
     ========================================================== */
  var PREGUNTAS = [
    {
      q: '¿Necesito visa o residencia brasileña para comprar?',
      a: '<b>No.</b> Cualquier extranjero puede comprar propiedad urbana en Brasil con pasaporte vigente y CPF. La residencia solo importa para temas migratorios, no para ser propietario.'
    },
    {
      q: '¿Puedo comprar sin viajar a Brasil?',
      a: '<b>Sí.</b> Con un poder (procuração) firmado ante notario en Perú y apostillado, un representante puede firmar la reserva, la escritura y el registro por ti. El CPF también puede tramitarse desde el consulado o en línea.'
    },
    {
      q: '¿En qué moneda pago y cómo envío el dinero?',
      a: 'El pago final es en <b>reales (R$)</b>. Desde Perú, el capital viaja por canales cambiarios regulados y queda registrado en el Banco Central do Brasil — clave para poder repatriar después. La ruta de referencia de KIPU es S/ → USDT → R$, con verificación de identidad y trazabilidad en cada tramo.'
    },
    {
      q: '¿Qué impuestos y costos pago al comprar?',
      a: 'Al comprar: <b>ITBI</b> (2–4% según municipio), escritura y registro (≈1,5–2%) y asesoría legal. En total, presupuesta <b>5–8% adicional</b> al precio. Cada año pagarás el IPTU municipal, y al vender, 15% sobre la ganancia de capital.'
    },
    {
      q: '¿Es seguro? ¿Cómo evito fraudes?',
      a: 'La seguridad viene del <b>sistema registral brasileño</b>: antes de pagar, se revisa la matrícula del inmueble (historial completo de dueños y gravámenes) y las certidões del vendedor. Regla de oro: nunca pagar sin due diligence, y solo es dueño quien <b>registra</b> la escritura.'
    },
    {
      q: '¿Puedo financiar la compra?',
      /* La página antigua remitía "al simulador de arriba"; aquí no
         hay arriba ni abajo, sino ventanas: se renombra la referencia. */
      a: 'El crédito bancario brasileño es difícil para no residentes. Lo habitual en lotes es la <b>financiación directa del desarrollador</b>: cuota inicial de 20–40% y saldo hasta en 60 cuotas mensuales — la ventana <b>Simulador</b> de este escritorio la incluye.'
    },
    {
      q: '¿Qué pasa cuando quiero vender y traer mi dinero a Perú?',
      /* Ajuste de casa: el 15% solo se paga si hubo ganancia; la
         redacción original la daba por descontada. */
      a: 'Vendes en reales, pagas el 15% sobre la ganancia si la hubo y repatrías por el mismo canal regulado con el que ingresaste el capital (por eso importa registrar la remesa al comprar). El retorno puede convertirse a USDT o soles según tu preferencia.'
    }
  ];

  /* ==========================================================
     KP.tpl.faq()
     Acordeón accesible: cada pregunta es un <button aria-expanded>
     que gobierna su respuesta por aria-controls; la respuesta es
     una región etiquetada por su pregunta y se oculta con [hidden]
     (no solo visualmente) para que el lector de pantalla no lea
     contenido cerrado.
     ========================================================== */
  KP.tpl.faq = function () {
    var uid = 'kpfaq' + (++faqSeq);

    var items = PREGUNTAS.map(function (p, i) {
      var idQ = uid + '-q' + i, idA = uid + '-a' + i;
      return '' +
        '<li class="kp-faq-item">' +
          '<h3 style="margin:0;font-size:inherit;font-weight:inherit">' +
            '<button type="button" class="kp-faq-q" id="' + idQ + '" aria-expanded="false" aria-controls="' + idA + '">' +
              '<span>' + p.q + '</span>' +
              /* El glifo es decorativo: el estado real lo comunica
                 aria-expanded, más el fondo y la barra lateral. */
              '<span class="kp-faq-sign" aria-hidden="true">+</span>' +
            '</button>' +
          '</h3>' +
          '<div class="kp-faq-a" id="' + idA + '" role="region" aria-labelledby="' + idQ + '" hidden>' +
            '<p>' + p.a + '</p>' +
          '</div>' +
        '</li>';
    }).join('');

    return CSS_FAQ +
    '<div class="pad">' +
      '<div class="sec-head">' +
        '<h2>Lo que todo inversionista peruano <em>pregunta</em></h2>' +
        '<p>Siete respuestas sobre comprar terreno en Brasil desde Perú. Abre y cierra con clic, Enter o Barra espaciadora; ↑ ↓ mueven entre preguntas.</p>' +
      '</div>' +
      '<ul class="kp-faq-list">' + items + '</ul>' +
      '<p class="sm-pie">Respuestas informativas de alcance general sobre el marco brasileño vigente. ' +
      'No son asesoría legal, tributaria ni financiera: confirma cada punto con un abogado habilitado en Brasil antes de firmar o transferir dinero.</p>' +
    '</div>';
  };

  /* ==========================================================
     KP.init.faq(root)
     Un solo panel abierto a la vez, pero se pueden cerrar todos:
     pulsar la pregunta abierta la cierra. Teclado: los <button>
     ya responden a Enter y Espacio; se añade ↑ ↓ Inicio Fin para
     recorrer las preguntas sin salir del acordeón. No se toca
     Escape porque el shell lo usa para minimizar la ventana.
     ========================================================== */
  KP.init.faq = function (root) {
    if (!root) return;
    var botones = Array.prototype.slice.call(root.querySelectorAll('.kp-faq-q'));
    if (!botones.length) return;

    function cerrar(btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', 'false');
      if (panel) panel.hidden = true;
      var item = btn.closest('.kp-faq-item');
      if (item) item.classList.remove('kp-open');
      var signo = btn.querySelector('.kp-faq-sign');
      if (signo) signo.textContent = '+';
    }

    function abrir(btn) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      btn.setAttribute('aria-expanded', 'true');
      if (panel) panel.hidden = false;
      var item = btn.closest('.kp-faq-item');
      if (item) item.classList.add('kp-open');
      var signo = btn.querySelector('.kp-faq-sign');
      if (signo) signo.textContent = '−'; /* menos tipográfico, no guion */
    }

    botones.forEach(function (btn, i) {
      btn.addEventListener('click', function () {
        var abierto = btn.getAttribute('aria-expanded') === 'true';
        botones.forEach(cerrar);          // solo una abierta a la vez
        if (!abierto) abrir(btn);         // y si ya lo estaba, quedan todas cerradas
      });

      btn.addEventListener('keydown', function (e) {
        var destino = null;
        if (e.key === 'ArrowDown')      destino = botones[(i + 1) % botones.length];
        else if (e.key === 'ArrowUp')   destino = botones[(i - 1 + botones.length) % botones.length];
        else if (e.key === 'Home')      destino = botones[0];
        else if (e.key === 'End')       destino = botones[botones.length - 1];
        if (destino) { e.preventDefault(); destino.focus(); }
      });
    });
  };

})();
