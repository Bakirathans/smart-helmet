// ============================================================
//  SmartHelmet — PWA Service Worker
//  Handles asset caching for offline support & load speeds
// ============================================================

const CACHE_NAME = 'smarthelmet-v1';
const ASSETS = [
  './',
  './index.html',
  './analytics.html',
  './alerts.html',
  './compliance.html',
  './settings.html',
  './safety.html',
  './css/style.css',
  './js/app.js',
  './js/gauges.js',
  './js/safety.js',
  './icons/icon.svg',
  './manifest.json'
];

// Install Event
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Caching app assets');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', e => {
  // Only handle GET requests and local assets (avoid blocking Firebase RTDB network calls)
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then(response => {
        // Cache new successful requests in the background
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, responseToCache);
          });
        }
        return response;
      });
    })
  );
});
