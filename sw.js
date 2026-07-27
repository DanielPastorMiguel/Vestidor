// sw.js — cachea el "app shell" para que la PWA funcione offline.
// Sube este número cada vez que cambies archivos para forzar la actualización.
const CACHE_NAME = 'armario-cache-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/crop.js',
  './js/colors.js',
  './js/gemini.js',
  './js/backup.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Estrategia: cache-first para el app shell, network-first para todo lo demás
// (por ejemplo, llamadas a la API de Gemini, que nunca deben servirse desde caché).
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    return; // deja pasar peticiones externas (Gemini, Google Fonts) directamente a la red
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
