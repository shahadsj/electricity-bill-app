const CACHE_NAME = 'electricity-bill-v1';
const urlsToCache = [
    '/electricity-bill-app/',
    '/electricity-bill-app/index.html',
    '/electricity-bill-app/style.css',
    '/electricity-bill-app/script.js',
    '/electricity-bill-app/manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => response || fetch(event.request))
    );
});