/* Offline support for the Daily Routine app.
   Bump VERSION whenever index.html changes so phones pick up the new copy. */
const VERSION = 'v1';
const CACHE = 'daily-routine-' + VERSION;

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@1,500&family=Poppins:wght@400;500&display=swap';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);

    // Fonts are a nice-to-have: store the stylesheet and every font file it names,
    // but never let a font failure stop the app from installing.
    try {
      const res = await fetch(FONT_CSS);
      if (res.ok) {
        const css = await res.clone().text();
        await cache.put(FONT_CSS, res);
        const urls = Array.from(css.matchAll(/url\((https:[^)]+)\)/g), (m) => m[1]);
        await Promise.all(urls.map((u) => cache.add(u).catch(() => {})));
      }
    } catch (e) { /* offline during install: system fonts are used instead */ }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = FONT_HOSTS.includes(url.hostname);
  if (!sameOrigin && !isFont) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreVary: true, ignoreSearch: sameOrigin });

    // Fonts never change at a given URL: cached copy wins outright.
    if (cached && isFont) return cached;

    // App files: answer from the cache straight away, refresh it in the background.
    const refresh = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (cached) { event.waitUntil(refresh); return cached; }

    const fresh = await refresh;
    if (fresh) return fresh;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    return Response.error();
  })());
});
