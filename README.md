# VETA — Sitio web OTC para el sector minero

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
| **Spread del cotizador** | `SPREAD_PCT` |
| **Minutos de cotización bloqueada** | `LOCK_MINUTES` |
| **Precios de respaldo** (si la API falla) | `FALLBACK` |
| **Razón social** (footer + términos) | `RAZON_SOCIAL` |
| **RUC** | `RUC` |
| **Correo** (footer + privacidad + schema) | `EMAIL` |
| **Dominio** (schema.org) | `DOMINIO` |
| **Teléfono visible** (schema.org) | `TELEFONO_VISIBLE` |
| **Métricas de confianza** (contadores) | `METRICAS` |
| **Ciudades / cobertura** (formulario + lista + schema) | `CIUDADES` |
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

El ticker muestra USDT/PEN, BTC/USD y ETH/USD, actualizados cada 60 s:

- **BTC y ETH en USD**: API pública de Binance (`api.binance.com`, con espejo
  `data-api.binance.vision` de respaldo). Binance no tiene mercado spot en soles.
- **USDT/PEN**: CoinGecko.
- Si Binance falla, BTC/ETH caen a CoinGecko; si todo falla, se usan los valores
  de `CONFIG.FALLBACK` y el ticker muestra "Referencial (sin conexión)".
- La fuente activa se muestra en el propio ticker ("En vivo · Binance · hh:mm").

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
