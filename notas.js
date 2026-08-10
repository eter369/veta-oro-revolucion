/* ================================================================
   NOTAS RÁPIDAS — app del escritorio Santa Catarina
   ----------------------------------------------------------------
   Script plano (sin build, sin dependencias). Se carga con
   <script src> en santa-catarina.html y expone:

       KipuNotas.abrir()   -> abre la ventana de la app

   Usa el sistema de ventanas que YA tiene el escritorio
   (crearVentana / cerrarVentana), así que hereda su animación de
   apertura, su barra con las tres luces, el arrastre y el cierre
   con Escape. No inventa una ventana propia.

   PERSISTENCIA: el sitio es 100% estático (GitHub Pages, sin
   backend), así que las notas viven en localStorage bajo una clave
   VERSIONADA. Todo acceso pasa por leerNotas/guardarNotas, que
   toleran que el navegador bloquee el almacenamiento: en ese caso
   la app sigue funcionando en memoria y avisa de que no se guardará.
   ================================================================ */
(function () {
  'use strict';

  var CLAVE = 'kipu_notes_v1';   // versionada: si cambia la forma del dato, sube a v2
  var DEBOUNCE_MS = 500;         // guardado automático tras dejar de escribir
  var EXTRACTO = 90;             // caracteres de vista previa en la lista

  /* Colores de nota, tomados de la paleta del sitio (oro KIPU y
     acompañantes). El primero es "sin color". */
  var COLORES = [
    { id: 'papel',  nombre: 'Papel',    tinte: 'transparent',        borde: 'rgba(0,0,0,.12)' },
    { id: 'oro',    nombre: 'Oro',      tinte: 'rgba(201,162,39,.16)', borde: 'rgba(201,162,39,.55)' },
    { id: 'mar',    nombre: 'Mar',      tinte: 'rgba(45,120,150,.14)', borde: 'rgba(45,120,150,.5)' },
    { id: 'bosque', nombre: 'Bosque',   tinte: 'rgba(46,120,80,.14)',  borde: 'rgba(46,120,80,.5)' },
    { id: 'coral',  nombre: 'Coral',    tinte: 'rgba(190,80,60,.14)',  borde: 'rgba(190,80,60,.5)' },
    { id: 'violeta',nombre: 'Violeta',  tinte: 'rgba(120,80,180,.14)', borde: 'rgba(120,80,180,.5)' }
  ];

  /* ---------------- Estado en memoria ---------------- */
  var notas = [];          // se rellena al abrir
  var seleccion = null;    // id de la nota abierta en el editor
  var filtro = '';
  var temporizador = null; // debounce del autoguardado
  var almacenaje = true;   // false si el navegador bloquea localStorage
  var raiz = null;         // elemento de la ventana

  /* ---------------- Persistencia ---------------- */
  function leerNotas() {
    try {
      var crudo = localStorage.getItem(CLAVE);
      if (!crudo) return [];
      var d = JSON.parse(crudo);
      return Array.isArray(d) ? d.filter(esNotaValida) : [];
    } catch (e) {
      /* Dato corrupto o almacenamiento bloqueado. No se borra nada:
         si es corrupto se ignora, y si está bloqueado se avisa. */
      almacenaje = probarAlmacenaje();
      return [];
    }
  }

  function guardarNotas() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(notas));
      return true;
    } catch (e) {
      almacenaje = false;
      return false;
    }
  }

  function probarAlmacenaje() {
    try {
      var k = CLAVE + '__test';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  /* Una nota que venga de una versión anterior o de un dato manipulado
     no debe reventar el renderizado: se valida la forma mínima. */
  function esNotaValida(n) {
    return n && typeof n === 'object' && typeof n.id === 'string';
  }

  function normalizar(n) {
    return {
      id: n.id,
      titulo: typeof n.titulo === 'string' ? n.titulo : '',
      contenido: typeof n.contenido === 'string' ? n.contenido : '',
      color: COLORES.some(function (c) { return c.id === n.color; }) ? n.color : 'papel',
      fijada: !!n.fijada,
      creada: +n.creada || Date.now(),
      editada: +n.editada || +n.creada || Date.now()
    };
  }

  /* ---------------- Utilidades ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nuevoId() {
    return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function hora(ts) {
    return new Date(ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  /* Fecha relativa corta: en una lista de notas "hace 5 min" dice más
     que una marca de tiempo completa. */
  function cuando(ts) {
    var d = Date.now() - ts;
    if (d < 60000) return 'ahora';
    if (d < 3600000) return 'hace ' + Math.floor(d / 60000) + ' min';
    if (d < 86400000) return 'hoy ' + hora(ts);
    if (d < 172800000) return 'ayer ' + hora(ts);
    return new Date(ts).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }).replace(/\./g, '');
  }

  function tituloDe(n) {
    if (n.titulo.trim()) return n.titulo.trim();
    var l = n.contenido.trim().split('\n')[0];
    return l ? l.slice(0, 40) : 'Nota sin título';
  }

  function colorDe(id) {
    for (var i = 0; i < COLORES.length; i++) if (COLORES[i].id === id) return COLORES[i];
    return COLORES[0];
  }

  /* Orden: fijadas arriba, y dentro de cada grupo por última edición. */
  function ordenadas() {
    return notas.slice().sort(function (a, b) {
      if (a.fijada !== b.fijada) return a.fijada ? -1 : 1;
      return b.editada - a.editada;
    });
  }

  function visibles() {
    var q = filtro.trim().toLowerCase();
    if (!q) return ordenadas();
    return ordenadas().filter(function (n) {
      return (n.titulo + ' ' + n.contenido).toLowerCase().indexOf(q) !== -1;
    });
  }

  function notaDe(id) {
    for (var i = 0; i < notas.length; i++) if (notas[i].id === id) return notas[i];
    return null;
  }

  /* ---------------- Plantilla ---------------- */
  function estilos() {
    return '<style>' +
      '.nt{display:flex;flex-direction:column;height:min(66vh,540px);font-family:var(--fuente)}' +
      '.nt-cols{display:flex;flex:1;min-height:0}' +
      /* --- lista --- */
      '.nt-lista{flex:0 0 38%;min-width:0;display:flex;flex-direction:column;border-right:1px solid rgba(0,0,0,.09);background:rgba(255,255,255,.35)}' +
      '.nt-buscar{padding:10px 12px;border-bottom:1px solid rgba(0,0,0,.07);display:flex;gap:8px;align-items:center}' +
      '.nt-buscar input{flex:1;min-width:0;font:inherit;font-size:12.5px;padding:7px 10px;border:1px solid rgba(0,0,0,.14);border-radius:9px;background:rgba(255,255,255,.85);color:var(--tinta)}' +
      '.nt-nueva{flex:none;width:30px;height:30px;border:1px solid rgba(201,162,39,.6);background:rgba(201,162,39,.14);color:#8a6d12;border-radius:9px;font-size:17px;line-height:1;cursor:pointer;font-weight:600}' +
      '.nt-nueva:hover{background:rgba(201,162,39,.24)}' +
      '.nt-items{flex:1;overflow-y:auto;padding:6px}' +
      /* overflow + min-width en el botón, y los tres textos como bloque:
         siendo <span> en línea ignoraban el recorte y la lista sacaba
         barra horizontal cuando el extracto era largo. */
      '.nt-item{width:100%;max-width:100%;min-width:0;overflow:hidden;text-align:left;display:block;padding:9px 11px;border-radius:10px;border:1px solid transparent;background:transparent;cursor:pointer;font:inherit;margin-bottom:2px;border-left:3px solid transparent}' +
      '.nt-item:hover{background:rgba(0,0,0,.045)}' +
      '.nt-item.sel{background:rgba(255,255,255,.95);border-color:rgba(0,0,0,.10);box-shadow:0 2px 8px rgba(0,0,0,.07)}' +
      '.nt-item .t{font-size:13px;font-weight:600;color:var(--tinta);display:flex;align-items:center;gap:6px;min-width:0}' +
      '.nt-item .t span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}' +
      '.nt-item .x{display:block;font-size:11.5px;color:rgba(0,0,0,.5);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.nt-item .f{display:block;font-size:10.5px;color:rgba(0,0,0,.38);margin-top:3px;letter-spacing:.02em}' +
      /* --- editor --- */
      '.nt-editor{flex:1;min-width:0;display:flex;flex-direction:column}' +
      '.nt-titulo{font:inherit;font-size:16px;font-weight:600;color:var(--tinta);border:none;background:transparent;padding:16px 20px 6px;outline:none;width:100%}' +
      '.nt-texto{flex:1;font:inherit;font-size:13.5px;line-height:1.65;color:var(--tinta);border:none;background:transparent;padding:0 20px 14px;outline:none;resize:none;width:100%}' +
      '.nt-pie{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 14px;border-top:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.4)}' +
      '.nt-colores{display:flex;gap:5px}' +
      '.nt-color{width:17px;height:17px;border-radius:50%;cursor:pointer;padding:0}' +
      '.nt-color[aria-pressed="true"]{outline:2px solid rgba(0,0,0,.5);outline-offset:2px}' +
      '.nt-btn{font:inherit;font-size:11px;font-weight:600;letter-spacing:.04em;padding:5px 10px;border-radius:8px;border:1px solid rgba(0,0,0,.16);background:rgba(255,255,255,.7);color:var(--tinta);cursor:pointer}' +
      '.nt-btn:hover{border-color:rgba(0,0,0,.35)}' +
      '.nt-btn.peligro{color:#a32820;border-color:rgba(163,40,32,.35)}' +
      '.nt-btn.peligro.armado{background:#a32820;color:#fff;border-color:#a32820}' +
      '.nt-btn[aria-pressed="true"]{background:rgba(201,162,39,.2);border-color:rgba(201,162,39,.6);color:#8a6d12}' +
      '.nt-estado{margin-left:auto;font-size:11px;color:rgba(0,0,0,.45);white-space:nowrap}' +
      '.nt-estado.ok{color:#2e7850}' +
      /* --- estado vacío --- */
      '.nt-vacio{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:30px;text-align:center}' +
      '.nt-vacio .g{font-size:34px;opacity:.35}' +
      '.nt-vacio .t{font-size:14px;font-weight:600;color:var(--tinta)}' +
      '.nt-vacio .s{font-size:12px;color:rgba(0,0,0,.5);max-width:34ch;line-height:1.6}' +
      '.nt-aviso{padding:8px 14px;font-size:11px;line-height:1.5;color:#8a4b12;background:rgba(232,178,74,.16);border-bottom:1px solid rgba(232,178,74,.4)}' +
      '.nt :focus-visible{outline:2px solid #C9A227;outline-offset:2px}' +
      '.nt-volver{display:none}' +
      /* --- móvil: una columna, la lista y el editor se turnan --- */
      '@media(max-width:720px){' +
        '.nt{height:auto;max-height:none}' +
        '.nt-cols{display:block}' +
        '.nt-lista{flex:none;border-right:none;border-bottom:1px solid rgba(0,0,0,.09)}' +
        '.nt-items{max-height:42vh}' +
        '.nt-editor{min-height:44vh}' +
        '.nt-texto{min-height:26vh}' +
        '.nt.editando .nt-lista{display:none}' +
        '.nt:not(.editando) .nt-editor{display:none}' +
        '.nt-volver{display:inline-block}' +
      '}' +
      '</style>';
  }

  function plantilla() {
    return '<div class="ventana-cuerpo" style="display:block;max-height:none">' +
      estilos() +
      '<div class="nt" data-nt>' +
        (almacenaje ? '' :
          '<p class="nt-aviso">⚠ Este navegador tiene el almacenamiento bloqueado: podrás escribir, pero las notas <b>no se guardarán</b> al recargar.</p>') +
        '<div class="nt-cols">' +
          '<div class="nt-lista">' +
            '<div class="nt-buscar">' +
              '<input type="search" data-buscar placeholder="Buscar en las notas…" aria-label="Buscar en las notas">' +
              '<button class="nt-nueva" data-nueva aria-label="Nueva nota (Ctrl+N)" title="Nueva nota · Ctrl+N">+</button>' +
            '</div>' +
            '<div class="nt-items" data-items role="list"></div>' +
          '</div>' +
          '<div class="nt-editor" data-editor></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- Render ---------------- */
  function pintarLista() {
    var cont = raiz.querySelector('[data-items]');
    var lista = visibles();
    if (!lista.length) {
      cont.innerHTML = '<div class="nt-vacio" style="padding:24px 16px">' +
        '<div class="g">' + (filtro ? '🔍' : '✧') + '</div>' +
        '<div class="t">' + (filtro ? 'Sin resultados' : 'No hay notas todavía') + '</div>' +
        '<div class="s">' + (filtro
          ? 'Ninguna nota contiene «' + esc(filtro) + '».'
          : 'Crea la primera con el botón + ✨') + '</div>' +
      '</div>';
      return;
    }
    cont.innerHTML = lista.map(function (n) {
      var c = colorDe(n.color);
      var extracto = n.contenido.replace(/\s+/g, ' ').trim();
      return '<button class="nt-item' + (n.id === seleccion ? ' sel' : '') + '" data-id="' + esc(n.id) + '" role="listitem"' +
        ' style="border-left-color:' + c.borde + ';background-image:linear-gradient(90deg,' + c.tinte + ',transparent 60%)">' +
        '<span class="t">' + (n.fijada ? '<span aria-label="Fijada" title="Fijada">📌</span>' : '') +
          '<span>' + esc(tituloDe(n)) + '</span></span>' +
        '<span class="x">' + (extracto ? esc(extracto.slice(0, EXTRACTO)) : 'Vacía') + '</span>' +
        '<span class="f">' + cuando(n.editada) + '</span>' +
      '</button>';
    }).join('');
  }

  function pintarEditor() {
    var ed = raiz.querySelector('[data-editor]');
    var n = notaDe(seleccion);
    if (!n) {
      ed.innerHTML = '<div class="nt-vacio">' +
        '<div class="g">✧</div>' +
        '<div class="t">' + (notas.length ? 'Elige una nota' : 'No hay notas todavía') + '</div>' +
        '<div class="s">' + (notas.length
          ? 'Selecciónala en la lista para verla y editarla.'
          : 'Crea la primera ✨ — se guarda sola mientras escribes.') + '</div>' +
      '</div>';
      return;
    }
    ed.innerHTML =
      '<input class="nt-titulo" data-t value="' + esc(n.titulo) + '" placeholder="Título" aria-label="Título de la nota">' +
      '<textarea class="nt-texto" data-c placeholder="Escribe aquí…" aria-label="Contenido de la nota">' + esc(n.contenido) + '</textarea>' +
      '<div class="nt-pie">' +
        '<button class="nt-btn nt-volver" data-volver>← Lista</button>' +
        '<span class="nt-colores" role="group" aria-label="Color de la nota">' +
          COLORES.map(function (c) {
            return '<button class="nt-color" data-color="' + c.id + '" aria-label="Color ' + c.nombre + '"' +
              ' aria-pressed="' + (n.color === c.id ? 'true' : 'false') + '"' +
              ' style="background:' + (c.id === 'papel' ? 'rgba(255,255,255,.9)' : c.tinte.replace('.14', '.55').replace('.16', '.55')) +
              ';border:1px solid ' + c.borde + '"></button>';
          }).join('') +
        '</span>' +
        '<button class="nt-btn" data-fijar aria-pressed="' + (n.fijada ? 'true' : 'false') + '">' +
          (n.fijada ? '📌 Fijada' : 'Fijar') + '</button>' +
        '<button class="nt-btn peligro" data-borrar>Eliminar</button>' +
        '<span class="nt-estado" data-estado></span>' +
      '</div>';
  }

  function pintar() {
    pintarLista();
    pintarEditor();
  }

  function marcarGuardado(ok) {
    var e = raiz && raiz.querySelector('[data-estado]');
    if (!e) return;
    if (ok) {
      e.textContent = 'Guardado ✓ ' + hora(Date.now());
      e.className = 'nt-estado ok';
    } else {
      e.textContent = 'No se pudo guardar';
      e.className = 'nt-estado';
    }
  }

  /* ---------------- Acciones ---------------- */
  function crear() {
    var n = normalizar({ id: nuevoId(), creada: Date.now() });
    notas.push(n);
    seleccion = n.id;
    filtro = '';
    var b = raiz.querySelector('[data-buscar]');
    if (b) b.value = '';
    guardarNotas();
    raiz.querySelector('.nt').classList.add('editando');
    pintar();
    var t = raiz.querySelector('[data-t]');
    if (t) t.focus();
  }

  /* El guardado no espera a un botón: se dispara al dejar de escribir.
     Se usa debounce para no castigar localStorage en cada tecla. */
  function programarGuardado() {
    clearTimeout(temporizador);
    temporizador = setTimeout(function () {
      var ok = guardarNotas();
      marcarGuardado(ok);
      pintarLista();   // el extracto y la fecha de la lista cambian al escribir
    }, DEBOUNCE_MS);
  }

  function editarCampo(campo, valor) {
    var n = notaDe(seleccion);
    if (!n) return;
    n[campo] = valor;
    n.editada = Date.now();
    programarGuardado();
  }

  function borrar() {
    var n = notaDe(seleccion);
    if (!n) return;
    notas = notas.filter(function (x) { return x.id !== n.id; });
    seleccion = notas.length ? ordenadas()[0].id : null;
    guardarNotas();
    raiz.querySelector('.nt').classList.remove('editando');
    pintar();
  }

  /* ---------------- Eventos ---------------- */
  function conectar() {
    var nt = raiz.querySelector('.nt');

    /* Delegación: la lista y el editor se repintan enteros, así que
       enganchar en el contenedor evita volver a atar cada botón. */
    raiz.addEventListener('click', function (e) {
      var el;

      if ((el = e.target.closest('[data-nueva]'))) { crear(); return; }

      if ((el = e.target.closest('.nt-item'))) {
        seleccion = el.dataset.id;
        nt.classList.add('editando');
        pintar();
        return;
      }

      if ((el = e.target.closest('[data-volver]'))) {
        nt.classList.remove('editando');
        return;
      }

      if ((el = e.target.closest('[data-color]'))) {
        editarCampo('color', el.dataset.color);
        pintar();
        return;
      }

      if ((el = e.target.closest('[data-fijar]'))) {
        var n = notaDe(seleccion);
        if (n) { editarCampo('fijada', !n.fijada); pintar(); }
        return;
      }

      if ((el = e.target.closest('[data-borrar]'))) {
        /* Confirmación en dos pasos dentro del propio botón: borrar una
           nota es irreversible y un confirm() del navegador rompería la
           ficción del escritorio. */
        if (el.dataset.armado) { borrar(); return; }
        el.dataset.armado = '1';
        el.classList.add('armado');
        el.textContent = '¿Seguro? Pulsa otra vez';
        setTimeout(function () {
          if (!el.isConnected) return;
          delete el.dataset.armado;
          el.classList.remove('armado');
          el.textContent = 'Eliminar';
        }, 4000);
        return;
      }
    });

    raiz.addEventListener('input', function (e) {
      if (e.target.matches('[data-buscar]')) { filtro = e.target.value; pintarLista(); return; }
      if (e.target.matches('[data-t]')) { editarCampo('titulo', e.target.value); return; }
      if (e.target.matches('[data-c]')) { editarCampo('contenido', e.target.value); return; }
    });

    /* Ctrl/Cmd + N crea una nota mientras la ventana está abierta.
       Se escucha en document porque el foco puede estar en cualquier
       campo, y se retira al cerrarse la ventana. */
    var atajo = function (e) {
      if (!raiz || !raiz.isConnected) { document.removeEventListener('keydown', atajo, true); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        crear();
      }
    };
    document.addEventListener('keydown', atajo, true);
  }

  /* ---------------- API pública ---------------- */
  function abrir() {
    almacenaje = probarAlmacenaje();
    notas = leerNotas().map(normalizar);
    seleccion = notas.length ? ordenadas()[0].id : null;
    filtro = '';

    /* Se reutiliza el gestor de ventanas del escritorio: misma
       animación, misma barra, mismo arrastre, mismo cierre con Esc. */
    raiz = window.crearVentana('Notas Rápidas', plantilla());
    if (notas.length) raiz.querySelector('.nt').classList.add('editando');
    pintar();
    conectar();

    /* Al cerrar la ventana puede quedar un guardado pendiente del
       debounce: se fuerza para no perder las últimas teclas. */
    var luz = raiz.querySelector('.luz-roja');
    if (luz) luz.addEventListener('click', vaciarPendiente);
    document.addEventListener('keydown', function alEsc(e) {
      if (e.key === 'Escape') { vaciarPendiente(); document.removeEventListener('keydown', alEsc); }
    });
    return raiz;
  }

  function vaciarPendiente() {
    if (!temporizador) return;
    clearTimeout(temporizador);
    temporizador = null;
    guardarNotas();
  }

  window.KipuNotas = { abrir: abrir, CLAVE: CLAVE };
})();
