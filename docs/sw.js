/**
 * Service Worker de Seguidor de Notas (PWA).
 *
 * Estrategia:
 *  - Navegación (la app): red primero, caché como respaldo -> siempre la
 *    última versión publicada, y funciona sin internet.
 *  - CDNs e iconos: caché primero + actualización en segundo plano.
 */
var CACHE = "seguidor-notas-v1";
var PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) {
        // add() individual con catch: un 404 puntual no tumba la instalación
        return Promise.all(PRECACHE.map(function (u) {
          return c.add(u).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) {
        return Promise.all(ks.filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;

  // La página de la app: red primero (última versión), caché si no hay red
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then(function (r) {
          var cl = r.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, cl); });
          return r;
        })
        .catch(function () {
          return caches.match(e.request).then(function (m) { return m || caches.match("./"); });
        })
    );
    return;
  }

  // Resto (CDNs, iconos): caché primero, actualizando en segundo plano
  e.respondWith(
    caches.match(e.request).then(function (m) {
      var net = fetch(e.request)
        .then(function (r) {
          if (r && r.ok) {
            var cl = r.clone();
            caches.open(CACHE).then(function (c) { c.put(e.request, cl); });
          }
          return r;
        })
        .catch(function () { return m; });
      return m || net;
    })
  );
});
