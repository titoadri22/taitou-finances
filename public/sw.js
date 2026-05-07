const CACHE_NAME = 'taitou-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/img/logo.png',
    '/img/icon-192.png',
    '/img/icon-512.png',
    '/manifest.json'
];

// Install: cache static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // API requests: network only (don't cache dynamic data)
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        return;
    }

    // Static assets: cache-first, fallback to network
    event.respondWith(
        caches.match(event.request).then(cached => {
            const fetchPromise = fetch(event.request).then(response => {
                // Update cache with fresh version
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => cached); // If network fails, use cache

            return cached || fetchPromise;
        })
    );
});
