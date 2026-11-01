'use strict';
/* Servidor estático de la app (la carpeta raíz del repositorio), como GitHub Pages. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

/** versionSW: si se indica, sustituye la VERSION de sw.js (para simular que se publica una versión nueva) */
function crearServidorApp() {
  let versionSW = null;
  const servidor = http.createServer((req, res) => {
    let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (ruta.endsWith('/')) ruta += 'index.html';
    const archivo = path.join(RAIZ, path.normalize(ruta).replace(/^(\.\.[/\\])+/, ''));
    if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      res.writeHead(404); return res.end('no encontrado');
    }
    let contenido = fs.readFileSync(archivo);
    if (versionSW && ruta === '/sw.js') contenido = Buffer.from(contenido.toString().replace(/const VERSION = '[^']*';/, `const VERSION = '${versionSW}';`));
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(contenido);
  });
  return {
    iniciar: () => new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${servidor.address().port}/`))),
    cerrar: () => new Promise((ok) => servidor.close(() => ok())),
    publicarVersionSW: (v) => { versionSW = v; }
  };
}

module.exports = { crearServidorApp };
