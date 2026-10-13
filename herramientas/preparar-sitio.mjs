// Prepara la carpeta que se publica en GitHub Pages (la usa .github/workflows/pages.yml).
//
//   node herramientas/preparar-sitio.mjs <origen> <destino>
//
// 1. Copia SOLO el sitio: deja fuera lo que no es para el público (código
//    fuente de veta-hero, scripts de herramientas/, configuración local de
//    .claude/, README, design/…). Antes todo el repo quedaba descargable.
// 2. Compacta el CSS y el JS escritos dentro de las páginas (y los .js sueltos
//    del sitio) con esbuild: quita espacios y comentarios y simplifica la
//    sintaxis, sin renombrar variables (los onclick="…" y las globales siguen
//    igual). Los archivos del repo no se tocan: se siguen editando legibles.
//    Si un bloque no se puede compactar se publica tal cual; si esbuild no está
//    instalado, se copia todo sin compactar. Nunca impide publicar.
//
// No se compactan: biblioteca.html (Biblioteca de Tesla, se publica tal cual),
// ni sweep/ ni mirofish/ (ya vienen compilados).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [origen = '.', destino = '_site'] = process.argv.slice(2);
const FUERA = new Set(['.git', '.github', '.claude', '.gitignore', '.nojekyll', 'design', 'veta-hero', 'herramientas', 'node_modules', 'README.md', 'rama-datos', path.basename(destino)]);
const SIN_COMPACTAR = [/^biblioteca\.html$/, /^sweep\//, /^mirofish\//];

let esbuild = null;
try {
  const req = createRequire(path.join(process.env.ESBUILD_DIR || process.cwd(), 'x.js'));
  esbuild = req('esbuild');
} catch {
  console.log('esbuild no disponible: se copia el sitio sin compactar');
}

const opcJS = { loader: 'js', minifyWhitespace: true, minifySyntax: true, charset: 'utf8', target: 'es2020' };
const opcCSS = { loader: 'css', minify: true, charset: 'utf8' };
const stats = { archivos: 0, compactados: 0, bloques: 0, intactos: 0, antes: 0, despues: 0 };

// devuelve el código compactado o null si no conviene (error o cierre de etiqueta dentro)
function compactar(codigo, opc, cierre) {
  try {
    const out = esbuild.transformSync(codigo, opc).code.trim();
    if (cierre.test(out) && !cierre.test(codigo)) return null;
    return out;
  } catch {
    return null;
  }
}

function compactarHTML(html) {
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, c, b) => {
    const out = compactar(c, opcCSS, /<\/style/i);
    if (out === null) { stats.intactos++; return m; }
    stats.bloques++;
    return a + out + b;
  });
  return html.replace(/(<script\b([^>]*)>)([\s\S]*?)(<\/script>)/gi, (m, a, attrs, c, b) => {
    if (/\bsrc\s*=/i.test(attrs) || !c.trim()) return m;
    const tipo = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (tipo && !/^(text\/javascript|module)$/i.test(tipo)) return m; // JSON-LD, plantillas…
    const out = compactar(c, tipo === 'module' ? { ...opcJS, format: 'esm' } : opcJS, /<\/script/i);
    if (out === null) { stats.intactos++; return m; }
    stats.bloques++;
    return a + out + b;
  });
}

function copiar(dirRel) {
  const dirAbs = path.join(origen, dirRel);
  for (const ent of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    const rel = dirRel ? `${dirRel}/${ent.name}` : ent.name;
    if (!dirRel && (FUERA.has(ent.name) || ent.name.startsWith('_'))) continue; // _site, _prueba…: carpetas generadas
    const de = path.join(origen, rel), a = path.join(destino, rel);
    if (ent.isDirectory()) { fs.mkdirSync(a, { recursive: true }); copiar(rel); continue; }
    stats.archivos++;
    const tocable = esbuild && !SIN_COMPACTAR.some((re) => re.test(rel));
    if (tocable && /\.html$/i.test(rel)) {
      const txt = fs.readFileSync(de, 'utf8');
      const out = compactarHTML(txt);
      stats.antes += Buffer.byteLength(txt); stats.despues += Buffer.byteLength(out);
      if (out !== txt) stats.compactados++;
      fs.writeFileSync(a, out);
    } else if (tocable && /\.js$/i.test(rel) && !/\.min\.js$/i.test(rel)) {
      const txt = fs.readFileSync(de, 'utf8');
      const out = compactar(txt, opcJS, /$^/);
      stats.antes += Buffer.byteLength(txt); stats.despues += Buffer.byteLength(out ?? txt);
      if (out !== null) stats.compactados++;
      fs.writeFileSync(a, out ?? txt);
    } else {
      fs.copyFileSync(de, a);
    }
  }
}

fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });
copiar('');
const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`${stats.archivos} archivos publicados · ${stats.compactados} compactados (${stats.bloques} bloques; ${stats.intactos} tal cual) · HTML/JS ${kb(stats.antes)} → ${kb(stats.despues)}`);
