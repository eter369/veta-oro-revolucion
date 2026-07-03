import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { Menu, X } from 'lucide-react'

/* ============================================================
   CONFIGURACIÓN EDITABLE
   ============================================================ */
// [EDITABLE] Número de WhatsApp con código de país, sin "+"
const WHATSAPP = '51999999999'
const WA_MSG = 'Hola VETA, quiero cotizar un cambio de efectivo a activos digitales.'
const WA_HREF = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(WA_MSG)}`
// [EDITABLE] Video de fondo: reemplazar por un video propio (mina, socavón, oro).
// Si el video no carga en 2.5 s, el contenido aparece igual sobre el fondo grafito.
const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260620_185230_f7f71ef4-6655-469f-b9c6-efbdc1f7684a.mp4'
// [EDITABLE] Métrica del footer
const STAT_VALUE = 'S/120M+'

const EXPO_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1]

const NAV_ITEMS = ['Protocolo', 'Inversión', 'Seguridad']

const DISPLAY_FONT = '"Barlow Condensed", Helvetica, Arial, sans-serif'

/* ---------- Íconos SVG propios (oro sobre carbón) ---------- */

function ChevronDown() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconBillete() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[46%] w-[46%]" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" stroke="#E8C766" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3" stroke="#E8C766" strokeWidth="1.6" />
      <path d="M5.5 9.5v.01M18.5 14.5v.01" stroke="#E8C766" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function IconEscudo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[46%] w-[46%]" aria-hidden="true">
      <path d="M12 2.5 19 5.4v4.8c0 4.5-3 7.9-7 9.3-4-1.4-7-4.8-7-9.3V5.4L12 2.5Z" stroke="#E8C766" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m8.8 11.4 2.2 2.2 4.2-4.6" stroke="#E8C766" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[46%] w-[46%]" aria-hidden="true">
      <rect x="2.5" y="6" width="19" height="13" rx="2.5" stroke="#E8C766" strokeWidth="1.7" />
      <path d="M2.5 10h13a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-13" stroke="#E8C766" strokeWidth="1.5" />
      <circle cx="16.5" cy="12.5" r="1" fill="#E8C766" />
    </svg>
  )
}

function IconVeta() {
  return (
    <svg viewBox="0 0 30 30" fill="none" className="h-[52%] w-[52%]" aria-hidden="true">
      <path d="M3 21 11 11l4 5 7-11 5 4" stroke="#E8C766" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ---------- Revelado palabra por palabra ---------- */

function RevealLine({ text, indent, delay, reduce }: { text: string; indent: number; delay: number; reduce: boolean }) {
  const words = text.split(' ')
  return (
    <div style={{ marginLeft: `${indent}em`, perspective: 600 }}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" style={{ marginRight: '0.26em' }}>
          <motion.span
            className="inline-block"
            style={{ transformOrigin: 'bottom' }}
            initial={reduce ? { opacity: 0 } : { y: '100%', rotateX: 45 }}
            animate={reduce ? { opacity: 1 } : { y: 0, rotateX: 0 }}
            transition={{ delay: delay + i * 0.08, duration: 0.6, ease: EXPO_OUT }}
          >
            {w}
          </motion.span>
        </span>
      ))}
    </div>
  )
}

/* ---------- Mapa del Perú con rutas animadas ---------- */

// Silueta estilizada del Perú (low-poly intencional, no cartográfica)
const PERU_PATH =
  'M92 26 Q118 12 150 16 Q192 20 214 44 Q232 66 222 92 Q214 112 220 134 Q226 158 204 168 Q186 176 178 196 Q172 214 160 232 Q150 250 132 252 Q120 252 112 236 Q96 204 84 172 Q72 140 62 108 Q52 76 60 50 Q68 30 92 26 Z'

// [EDITABLE] Ciudades de cobertura y su posición en el mapa
const CITIES: { name: string; x: number; y: number; lx: number; ly: number; anchor?: string }[] = [
  { name: 'Tarapoto', x: 128, y: 78, lx: 138, ly: 74 },
  { name: 'Trujillo', x: 86, y: 104, lx: 76, ly: 100, anchor: 'end' },
  { name: 'Lima', x: 92, y: 158, lx: 80, ly: 164, anchor: 'end' },
  { name: 'Arequipa', x: 138, y: 214, lx: 128, ly: 228, anchor: 'end' },
  { name: 'Puno', x: 162, y: 222, lx: 172, ly: 230 },
  { name: 'Pto. Maldonado', x: 196, y: 162, lx: 206, ly: 158 },
]

// Rutas OTC: nacen en Lima (hub) hacia cada región minera
const ROUTES = [
  'M92 158 C 74 140, 72 122, 86 104',
  'M92 158 C 104 120, 104 96, 128 78',
  'M92 158 C 130 178, 160 148, 196 162',
  'M92 158 C 106 198, 118 210, 138 214 S 154 226 162 222',
]

function MapaPeru({ reduce }: { reduce: boolean }) {
  return (
    <svg viewBox="0 0 435 263" className="absolute inset-0 h-full w-full" aria-hidden="true" style={{ overflow: 'visible' }}>
      <motion.path
        d={PERU_PATH}
        fill="#1C1F27"
        stroke="rgba(201,162,39,.35)"
        strokeWidth="1.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.7, ease: EXPO_OUT }}
      />
      {/* Vetas interiores (textura mineral) */}
      <motion.g
        stroke="#C9A227"
        strokeWidth="1"
        fill="none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.14 }}
        transition={{ delay: 0.7, duration: 0.8 }}
      >
        <path d="M78 60 105 88 96 118 118 142" />
        <path d="M170 40 152 92 178 120 164 158" />
        <path d="M120 200 146 186 168 198" />
      </motion.g>

      {/* Rutas doradas */}
      {ROUTES.map((d, i) => (
        <g key={i}>
          <motion.path
            d={d}
            fill="none"
            stroke="#E8C766"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.55 + i * 0.12, duration: 1.1, ease: EXPO_OUT }}
          />
          {!reduce && (
            <polygon points="0,-4 8,0 0,4" fill="#E8C766">
              <animateMotion dur={`${2.5 + i * 0.3}s`} repeatCount="indefinite" rotate="auto" path={d} />
            </polygon>
          )}
        </g>
      ))}

      {/* Puntos de cobertura */}
      {CITIES.map((c, i) => (
        <motion.g
          key={c.name}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 14, delay: 0.9 + i * 0.1 }}
        >
          <circle cx={c.x} cy={c.y} r="6.5" fill="#E8C766" />
          <circle cx={c.x} cy={c.y} r="2.3" fill="#12141A" />
        </motion.g>
      ))}

      {/* Etiquetas */}
      {CITIES.map((c, i) => (
        <motion.text
          key={c.name}
          x={c.lx}
          y={c.ly}
          textAnchor={c.anchor ?? 'start'}
          fontSize="9.5"
          fill="rgba(237,234,227,.78)"
          fontFamily="Helvetica, Arial, sans-serif"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 + i * 0.08, duration: 0.4 }}
        >
          {c.name}
        </motion.text>
      ))}
    </svg>
  )
}

/* ---------- Ícono circular flotante sobre el mapa ---------- */

function MapIcon({
  children,
  left,
  top,
  delay,
  rotate = 0,
  label,
}: {
  children: React.ReactNode
  left: string
  top: string
  delay: number
  rotate?: number
  label: string
}) {
  return (
    <motion.div
      role="img"
      aria-label={label}
      className="absolute flex items-center justify-center rounded-full"
      style={{
        left,
        top,
        width: '13.5%',
        aspectRatio: '1',
        backgroundColor: '#1C1F27',
        border: '1px solid rgba(201,162,39,.5)',
        boxShadow: '0 4px 12px rgba(0,0,0,.35)',
        rotate: `${rotate}deg`,
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 16, delay }}
      whileHover={{ scale: 1.12, y: -4, boxShadow: '0 10px 24px rgba(0,0,0,.5)' }}
    >
      {children}
    </motion.div>
  )
}

/* ============================================================
   APP
   ============================================================ */

export default function App() {
  const [videoReady, setVideoReady] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const reduce = useReducedMotion() ?? false

  // Robustez: si el video nunca dispara onCanPlay (URL caída, red lenta),
  // el contenido aparece igual a los 2.5 s sobre el fondo grafito.
  useEffect(() => {
    const t = setTimeout(() => setVideoReady(true), 2500)
    return () => clearTimeout(t)
  }, [])

  const headlineStyle: React.CSSProperties = {
    fontFamily: DISPLAY_FONT,
    fontWeight: 800,
    fontSize: 'clamp(86px, min(14vh, 11vw), 220px)',
    lineHeight: 0.78,
    textTransform: 'uppercase',
    letterSpacing: '-0.01em',
  }

  const slide = (from: number, delay: number) => ({
    initial: reduce ? { opacity: 0 } : { x: from, opacity: 0 },
    animate: reduce ? { opacity: 1 } : { x: 0, opacity: 1 },
    transition: { duration: 0.85, delay, ease: EXPO_OUT },
  })

  return (
    <div className="relative h-full w-full overflow-y-auto lg:overflow-hidden" style={{ backgroundColor: '#12141A' }}>
      {/* ---------- Fondo: video + tinte grafito ---------- */}
      <video
        className="fixed inset-0 z-0 h-full w-full object-cover"
        src={VIDEO_URL}
        aria-hidden="true"
        tabIndex={-1}
        autoPlay
        muted
        loop
        playsInline
        onCanPlay={() => setVideoReady(true)}
        onError={() => setVideoReady(true)}
      />
      <div
        className="fixed inset-0 z-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(18,20,26,.88) 0%, rgba(18,20,26,.62) 45%, rgba(18,20,26,.92) 100%)',
        }}
      />
      {/* Veta de fondo: firma de marca */}
      <svg className="pointer-events-none fixed inset-0 z-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
        <motion.path
          d="M-40 690 L360 430 L560 560 L900 210 L1180 330 L1480 130"
          fill="none"
          stroke="url(#vetaHeroGrad)"
          strokeWidth="1.6"
          opacity="0.32"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.2, duration: 1.6, ease: EXPO_OUT }}
        />
        <defs>
          <linearGradient id="vetaHeroGrad" x1="0" y1="1" x2="1" y2="0">
            <stop stopColor="#C9A227" />
            <stop offset="1" stopColor="#E8C766" />
          </linearGradient>
        </defs>
      </svg>

      <AnimatePresence>
        {videoReady && (
          <motion.div
            className="flex min-h-full w-full flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* ---------- HEADER ---------- */}
            <header className="relative z-50" style={{ padding: 'clamp(16px, 4vh, 40px) clamp(16px, 3vw, 48px) 0' }}>
              <div className="flex items-start justify-between">
                {/* Logo */}
                <motion.a
                  href="#"
                  aria-label="VETA OTC — inicio"
                  className="block select-none"
                  style={{
                    fontFamily: DISPLAY_FONT,
                    fontWeight: 800,
                    fontSize: 'clamp(22px, min(3.15vh, 2.32vw), 32px)',
                    lineHeight: 0.9,
                    textTransform: 'uppercase',
                    letterSpacing: '-0.01em',
                  }}
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: EXPO_OUT }}
                >
                  <span className="block text-humo">VETA</span>
                  <span className="block" style={{ color: '#E8C766' }}>OTC</span>
                </motion.a>

                {/* Nav escritorio */}
                <nav className="hidden items-center md:flex" style={{ gap: 'clamp(20px, 3.8vw, 52px)' }} aria-label="Navegación principal">
                  {NAV_ITEMS.map((item, i) => (
                    <motion.a
                      key={item}
                      href="#"
                      className="flex items-center gap-1.5 text-humo"
                      style={{ fontSize: 'clamp(15px, min(1.97vh, 1.45vw), 20px)', letterSpacing: '-0.02em' }}
                      initial={{ opacity: 0, y: -14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.12 + i * 0.08, ease: EXPO_OUT }}
                      whileHover={{ color: '#E8C766', x: 2 }}
                    >
                      {item}
                      <ChevronDown />
                    </motion.a>
                  ))}
                </nav>

                {/* Hamburguesa móvil */}
                <button
                  className="text-humo md:hidden"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
                >
                  {menuOpen ? <X size={28} /> : <Menu size={28} />}
                </button>
              </div>
            </header>

            {/* ---------- MAIN ---------- */}
            <main
              className="relative z-10 grid flex-1 grid-cols-1 lg:grid-cols-[2.17fr_1fr]"
              style={{
                padding: 'clamp(24px, 8vh, 120px) clamp(16px, 3vw, 48px) 0',
                gap: 'clamp(20px, 4vh, 48px)',
              }}
            >
              {/* Titular gigante */}
              <h1 style={{ overflow: 'clip', ...headlineStyle }}>
                <motion.span className="block text-humo" {...slide(-900, 0)}>
                  Más allá
                </motion.span>
                <motion.span
                  className="block"
                  style={{
                    marginLeft: '0.524em',
                    backgroundImage: 'linear-gradient(120deg, #C9A227 15%, #E8C766 85%)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                  }}
                  {...slide(900, 0.13)}
                >
                  de la roca
                </motion.span>
                <motion.span className="block text-humo" {...slide(-900, 0.26)}>
                  y el riesgo
                </motion.span>
              </h1>

              {/* Columna derecha */}
              <div className="flex flex-col" style={{ gap: 'clamp(16px, 2.66vh, 32px)' }}>
                {/* Tagline palabra por palabra */}
                <div
                  className="text-humo"
                  style={{
                    fontSize: 'clamp(24px, min(4vh, 3vw), 52px)',
                    lineHeight: 0.9,
                    letterSpacing: '-0.02em',
                  }}
                >
                  <RevealLine text="Tu producción" indent={0} delay={0.3} reduce={reduce} />
                  <RevealLine text="protegida en digital" indent={1.5} delay={0.5} reduce={reduce} />
                  <RevealLine text="cotizada con precisión" indent={0} delay={0.7} reduce={reduce} />
                </div>

                {/* Mapa de cobertura */}
                <div className="relative w-full" style={{ aspectRatio: '435 / 263' }}>
                  <MapaPeru reduce={reduce} />

                  {/* Íconos del protocolo sobre el mapa */}
                  <MapIcon left="4%" top="14%" delay={2.1} label="Efectivo de tu producción">
                    <IconBillete />
                  </MapIcon>
                  <MapIcon left="30%" top="66%" delay={2.2} rotate={6} label="Protocolo seguro VETA">
                    <IconEscudo />
                  </MapIcon>
                  <MapIcon left="60%" top="16%" delay={2.3} label="Tu wallet digital">
                    <IconWallet />
                  </MapIcon>

                  {/* Descripción del mapa */}
                  <motion.p
                    className="absolute hidden sm:block"
                    style={{
                      left: '55.6%',
                      top: '58%',
                      width: '42%',
                      fontSize: 'clamp(12px, min(1.6vh, 1.2vw), 20px)',
                      color: 'rgba(237,234,227,.82)',
                      lineHeight: 1.3,
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 2.4, duration: 0.6 }}
                  >
                    Rutas OTC verificadas en 6 regiones mineras. Cada operación termina en una confirmación on-chain.
                  </motion.p>
                </div>
              </div>
            </main>

            {/* ---------- FOOTER ---------- */}
            <footer
              className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end"
              style={{
                padding: 'clamp(12px, 3vh, 32px) clamp(16px, 3vw, 48px) clamp(16px, 5vh, 66px)',
              }}
            >
              {/* Bloque de métrica */}
              <motion.div
                className="flex items-center gap-4"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.65, ease: EXPO_OUT }}
              >
                {/* [EDITABLE] Métrica placeholder */}
                <span
                  className="tabular-nums"
                  style={{
                    fontFamily: DISPLAY_FONT,
                    fontWeight: 800,
                    fontSize: 'clamp(52px, min(8vh, 6vw), 98px)',
                    color: '#E8C766',
                    textTransform: 'uppercase',
                    lineHeight: 0.9,
                  }}
                >
                  {STAT_VALUE}
                </span>
                <p
                  className="text-humo"
                  style={{ fontSize: 'clamp(16px, min(1.6vh, 1.2vw), 20px)', lineHeight: 1.25 }}
                >
                  de volumen operado
                  <br />
                  con cotización bloqueada
                  <br />
                  y confirmación on-chain
                </p>
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 'clamp(40px, min(5.5vh, 4vw), 67px)',
                    aspectRatio: '1',
                    backgroundColor: '#1C1F27',
                    border: '1px solid rgba(201,162,39,.5)',
                  }}
                  aria-hidden="true"
                >
                  <IconVeta />
                </div>
              </motion.div>

              {/* CTA píldora con recorte circular */}
              <motion.a
                href={WA_HREF}
                target="_blank"
                rel="noopener"
                aria-label="Cotizar por WhatsApp"
                className="relative block w-full sm:w-auto"
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5, duration: 0.65, ease: EXPO_OUT }}
                whileHover="hover"
                whileTap={{ scale: 0.97 }}
                variants={{ hover: { scale: 1.08, y: -2 } }}
              >
                <svg
                  viewBox="0 0 434.001 68"
                  preserveAspectRatio="none"
                  className="h-14 w-full sm:h-[clamp(48px,min(6vh,4.5vw),68px)] sm:w-auto sm:aspect-[434/68]"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="ctaGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop stopColor="#C9A227" />
                      <stop offset="1" stopColor="#E8C766" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M316 0C329.08 0 340.435 7.38674 346.121 18.2162C348.618 22.9736 353.086 26.8535 358.459 26.8535H359.252C364.667 26.8535 369.155 22.9169 371.63 18.1007C377.159 7.34039 388.205 0.00015843 400.931 0C419.195 0 434.001 15.1191 434.001 33.7695L433.99 34.6416C433.537 52.8891 418.909 67.5391 400.931 67.5391C387.96 67.5389 376.734 59.9132 371.317 48.8128C368.923 43.9077 364.427 39.873 358.969 39.873C353.492 39.873 348.986 43.9356 346.589 48.8605C341.074 60.1913 329.449 68 316 68H34.001C15.2233 68 0 52.7777 0 34C0 15.2223 15.2233 0 34.001 0H316ZM400.931 2.44141C384.063 2.44163 370.303 16.419 370.303 33.7695C370.303 51.1201 384.063 65.0974 400.931 65.0977C417.798 65.0977 431.56 51.1202 431.56 33.7695C431.56 16.4189 417.798 2.44141 400.931 2.44141Z"
                    fill="url(#ctaGrad)"
                  />
                </svg>
                {/* Etiqueta centrada en la zona de píldora (sin el círculo) */}
                <span
                  className="absolute inset-y-0 left-0 flex w-[76%] items-center justify-center font-bold"
                  style={{ color: '#12141A', fontSize: 'clamp(14px, min(1.6vh, 1.2vw), 20px)', letterSpacing: '-0.01em' }}
                >
                  Cotizar por WhatsApp
                </span>
                {/* Flecha en el recorte circular: ↗ que gira a → al hover */}
                <motion.span
                  className="absolute flex items-center justify-center"
                  style={{ left: '92.4%', top: '50%', x: '-50%', y: '-50%', rotate: -135 }}
                  variants={{ hover: { rotate: -90 } }}
                  transition={{ duration: 0.35, ease: EXPO_OUT }}
                >
                  <svg viewBox="0 0 16.89 20.37" width="17" height="20" fill="none" aria-hidden="true">
                    <path
                      d="M8.45 1.2 V18.9 M1.6 12 L8.45 18.9 L15.3 12"
                      stroke="#EDEAE3"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </motion.span>
              </motion.a>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- Menú móvil ---------- */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 md:hidden"
            style={{ backgroundColor: '#1C1F27' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {NAV_ITEMS.map((item, i) => (
              <motion.button
                key={item}
                className="text-humo"
                style={{ fontSize: 24, fontFamily: DISPLAY_FONT, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em' }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.08, duration: 0.4, ease: EXPO_OUT }}
                onClick={() => setMenuOpen(false)}
              >
                {item}
              </motion.button>
            ))}
            <motion.a
              href={WA_HREF}
              target="_blank"
              rel="noopener"
              className="rounded-full px-8 py-3 font-bold"
              style={{ backgroundColor: '#E8C766', color: '#12141A', fontSize: 18 }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.4, ease: EXPO_OUT }}
            >
              Cotizar por WhatsApp
            </motion.a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
