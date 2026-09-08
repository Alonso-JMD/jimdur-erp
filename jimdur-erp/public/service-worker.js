const CACHE_NAME = "jimdur-shell-v7";
const STATIC_ASSETS = [
  "/jimdur-app-logo.png",
  "/jimdur-icon-192.png",
  "/jimdur-icon-512.png",
  "/jimdur-repuestos.png",
  "/login-motorcycle-parts-hero.webp",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }
  if (!STATIC_ASSETS.includes(url.pathname)) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  );
});
