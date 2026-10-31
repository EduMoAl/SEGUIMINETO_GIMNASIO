// Service worker: guarda la app en el móvil para que funcione sin internet.
// IMPORTANTE: cada vez que cambies algún archivo de la app, sube el número de VERSION
// para que el móvil descargue la nueva versión.
const VERSION = 'v5';
const CACHE = 'edux-' + VERSION;
const ARCHIVOS = [
  './',
  'index.html',
  'style.css',
  'rutina.js',
  'almacen.js',
  'datos.js',
  'red.js',
  'grafico.js',
  'descanso.js',
  'sesion.js',
  'vistas.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Solo servimos desde caché los archivos de la propia app.
  // Las llamadas a Google (otro dominio) pasan directas a la red.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req))
  );
});
