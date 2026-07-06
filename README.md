# KIPU — Sitio web OTC para el sector minero

> KIPU: del quechua *khipu*, el sistema andino de cuerdas y nudos con el que se
> registraba valor sin papel. La marca une ese legado con el registro en blockchain.

Prototipo avanzado autocontenido: todo el sitio (HTML + CSS + JS) vive en **`index.html`**.
No requiere instalación ni dependencias. Funciona en cualquier hosting estático
(Vercel, Netlify, Cloudflare Pages, cPanel) o abriéndolo directamente en el navegador.

## Puntos editables — TODO en un solo lugar: el bloque `CONFIG`

Casi todos los datos del negocio viven en el bloque `CONFIG` al inicio del
`<script>` de `index.html` y se inyectan solos en todo el sitio (footer,
formulario, textos legales, schema.org):

| Qué | Clave en `CONFIG` |
|---|---|
| **Número de WhatsApp** (código de país sin `+`) | `WHATSAPP` |
| **Comisiones por método** (efectivo 7% / Lemon Cash 5%) | `COMISIONES` |
| **Minutos de cotización bloqueada** | `LOCK_MINUTES` |
| **Precios de respaldo** (si la API falla) | `FALLBACK` |
| **Razón social** (footer + términos) | `RAZON_SOCIAL` |
| **RUC** | `RUC` |
| **Correo** (footer + privacidad + schema) | `EMAIL` |
| **Dominio** (schema.org) | `DOMINIO` |
| **Teléfono visible** (schema.org) | `TELEFONO_VISIBLE` |
| **Métricas de confianza** (contadores) | `METRICAS` |
| **Cobertura por país** (tabs Perú/Brasil, formulario + schema) | `UBICACIONES` |
| **Monto mínimo** (FAQ + schema FAQPage) | `MONTO_MINIMO` |
| **Redes sociales** | `REDES` |

Quedan fuera de `CONFIG` (editar a mano):

| Qué | Dónde |
|---|---|
| **Testimonios** | sección `#testimonios` (reemplazar con casos reales autorizados) |
| **Dominio en metadatos estáticos** | `<link rel="canonical">`, `og:url`, `og:image` en el `<head>` (los crawlers sin JS leen esto) |
| **Rangos de monto del formulario** | `<select id="f-monto">` (revisar si cambia `MONTO_MINIMO`) |
| **Enumeración de regiones en el copy** | sección `#mineria`, párrafo de introducción (marcado `[EDITABLE]`) |

## Precios en vivo

El ticker muestra USDT/PEN, BTC/USD, ETH/USD y SOL/USD, actualizados cada 60 s:

- **BTC, ETH y SOL en USD**: API pública de Binance (`api.binance.com`, con espejo
  `data-api.binance.vision` de respaldo). Binance no tiene mercado spot en soles.
- **USDT/PEN**: CoinGecko.
- **Tipo de cambio oficial USD/PEN (cotizador)**: `open.er-api.com` (agregador de
  tasas oficiales), con respaldo CoinGecko. Se puede fijar a mano con
  `CONFIG.TC_OFICIAL_MANUAL` (ej. `3.75`) para anular la API.
- **Tipo de cambio oficial USD/BRL (real brasileño, cotizador)**: misma fuente
  `open.er-api.com`; respaldo en `CONFIG.FALLBACK.usd_brl`.
- Si Binance falla, BTC/ETH caen a CoinGecko; si todo falla, se usan los valores
  de `CONFIG.FALLBACK` y el ticker muestra "Referencial (sin conexión)".
- La fuente activa se muestra en el propio ticker ("En vivo · Binance · hh:mm").

## Idiomas (ES Perú / PT Brasil / EN EE.UU.)

El header tiene un selector con banderas 🇵🇪/🇧🇷/🇺🇸 que traduce todo el sitio
en vivo (textos, atributos de accesibilidad, mensajes de WhatsApp, cotizador
con montos en palabras en cada idioma). La preferencia se guarda en
`localStorage` (`kipu_idioma`).

- Los diccionarios viven en `index.html`, en las líneas marcadas
  `/*[I18N-PT-DICT]*/` y `/*[I18N-EN-DICT]*/`.
- **Si editas textos en español**, esa frase dejará de traducirse (se queda en
  español — a prueba de fallos). Para regenerar: edita los `scratchpad/i18n-pt-*.json`
  y corre `node extract-i18n.js && node ensamblar-i18n.js` (herramientas en el
  scratchpad de la sesión; pídele a Claude regenerarlas si no las tienes).
- Los textos que el JS genera en runtime (ticker, cotizador, WhatsApp) se
  traducen desde el objeto `UI_TXT` en el propio `index.html`.

## Textos legales

Los cuatro documentos del footer (Términos, Privacidad, PLAFT, Aviso de riesgo) son
**textos modelo**: validarlos con asesoría legal antes de publicar.

## Vista previa local

```bash
npx serve -l 4173 .
```

## Migración futura

La estructura (secciones por anclas, tokens CSS en `:root`, config centralizada en
`CONFIG`) está pensada para portarse 1:1 a Next.js 14 + Tailwind + Framer Motion
cuando el proyecto pase de prototipo a producto.
