// service-worker.js - IMPROVED VERSION
const CACHE_NAME = 'electricity-bill-v3.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css', 
  '/script.js',
  '/manifest.json',
  '/service-worker.js'
];

// External resources (optional caching)
const externalResources = [
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Install event
self.addEventListener('install', event => {
  console.log('⚡ Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Cache opened, adding resources...');
        // Cache essential files first
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ All resources cached successfully');
        return self.skipWaiting(); // Immediate activation
      })
      .catch(error => {
        console.error('❌ Cache installation failed:', error);
      })
  );
});

// Activate event - Clean up old caches
self.addEventListener('activate', event => {
  console.log('🔄 Service Worker activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker activated');
      return self.clients.claim(); // Take control immediately
    })
  );
});

// Fetch event - Cache First with Network Fallback (Better for PWA)
self.addEventListener('fetch', event => {
  // Skip non-GET requests and chrome-extension requests
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Return cached version if available
        if (cachedResponse) {
          console.log('📂 Serving from cache:', event.request.url);
          return cachedResponse;
        }

        // Otherwise fetch from network
        console.log('🌐 Fetching from network:', event.request.url);
        return fetch(event.request)
          .then(networkResponse => {
            // Check if valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clone the response and cache it
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
                console.log('💾 Cached new resource:', event.request.url);
              });

            return networkResponse;
          })
          .catch(error => {
            console.log('❌ Network failed, serving fallback:', error);
            
            // If it's an HTML request, serve the main page
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/index.html');
            }
            
            // For other requests, you can return a custom offline page
            return new Response('🔌 You are offline. Please check your internet connection.', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// Background sync for offline data (if supported)
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    console.log('🔄 Background sync triggered');
    event.waitUntil(doBackgroundSync());
  }
});

// Periodic sync (if supported)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'periodic-data-sync') {
    console.log('🕒 Periodic sync triggered');
    event.waitUntil(doPeriodicSync());
  }
});

async function doBackgroundSync() {
  try {
    // Add your background sync logic here
    console.log('🔄 Performing background sync...');
    
    // Example: Sync offline transactions
    const offlineData = localStorage.getItem('offline_transactions');
    if (offlineData) {
      console.log('📤 Syncing offline data...');
      // Add your sync logic here
    }
    
    return Promise.resolve();
  } catch (error) {
    console.error('❌ Background sync failed:', error);
    return Promise.reject(error);
  }
}

async function doPeriodicSync() {
  try {
    // Add periodic sync logic (e.g., every 24 hours)
    console.log('🕒 Performing periodic sync...');
    return Promise.resolve();
  } catch (error) {
    console.error('❌ Periodic sync failed:', error);
    return Promise.reject(error);
  }
}

// Handle messages from the main thread
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({version: '3.0'});
  }
});

console.log('⚡ Service Worker loaded successfully');