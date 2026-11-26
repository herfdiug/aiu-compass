// Offline shell for AIU Compass. Caches the app, the campus data and the phrase pack.
//
// Strategy: network first, cache as the fallback. Cache-first meant that a
// returning visitor kept the previous build until the cache name was bumped by
// hand, so a corrected answer or a fixed layout would not reach them. Now a
// connected visitor always gets the current file, and the cache is only used
// when the network is gone (which is the whole point of the offline pack).
const CACHE = 'aiu-compass-v6';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'config.js',
  'manifest.webmanifest',
  'js/app.js',
  'js/correction.js',
  'js/map3d.js',
  'vendor/three.module.js',
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
  if (ev.request.method !== 'GET') return;
  ev.respondWith(
    fetch(ev.request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(ev.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(ev.request).then((hit) => hit || caches.match('index.html')))
  );
});
