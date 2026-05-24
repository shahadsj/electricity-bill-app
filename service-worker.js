const CACHE_NAME = 'electric-app-v10'; // ভার্সন পরিবর্তন করা হয়েছে
const ASSETS = [
  'index.html',
  'script.js',
  'style.css',
  'manifest.json',
  'pwa.js',
  'icons/icon-192x192.png',
  'icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  return self.clients.claim();
});

// এই অংশটি ছাড়া মোবাইলে বাটন আসবে না
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', event => {
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
});