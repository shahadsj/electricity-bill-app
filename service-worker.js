const CACHE_NAME = 'electricity-app-v5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './script.js',
  './style.css',
  './manifest.json',
  './pwa.js'
];

// সার্ভিস ওয়ার্কার ইন্সটল এবং ফাইল ক্যাশ করা
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('✅ Caching system assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// সক্রিয় করা এবং পুরনো ক্যাশ ডিলিট করা
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// ফেচ ইভেন্ট (এটি বাটন আসার জন্য ১০০% বাধ্যতামূলক)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request);
    })
  );
});

// আপডেট হ্যান্ডল করা
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});