// Offline shell for AIU Compass. Caches the app, the campus data and the phrase pack.
const CACHE = 'aiu-compass-v3';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'config.js',
  'manifest.webmanifest',
  'js/app.js',
  'js/correction.js',
  'js/map.js',
  'data/campus.json',
  'data/faq.json'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (url.origin !== location.origin) return; // never cache the AI call
  ev.respondWith(
    caches.match(ev.request).then((hit) => hit || fetch(ev.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(ev.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
