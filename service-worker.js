/*
 * Service Worker — Run&Bad Guillaume
 * Rôle unique : mettre en cache l'app (HTML/CSS/JS/icônes) pour qu'elle
 * fonctionne hors connexion. Les données (séances, carnet…) ne passent
 * jamais par ici : elles vivent dans localStorage, sur l'appareil.
 *
 * Stratégie : "cache d'abord, réseau en secours". À chaque nouvelle
 * version, on change CACHE_NAME pour forcer le renouvellement du cache.
 */

const CACHE_NAME = "runbad-cache-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // On ne gère que les requêtes GET de notre propre origine
  // (les liens Google Agenda etc. partent normalement sur le réseau).
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // On met aussi en cache les nouvelles ressources same-origin
          if (response.ok && event.request.url.startsWith(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
