// Service Worker for Fiesta Liquor - Enables offline support and caching

const CACHE_NAME = 'fiesta-liquor-v4'; // Increment version to clear old cache
const OFFLINE_URL = '/index.html';

// Assets to cache on install
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/checkout.html',
    '/account.html',
    '/auth.html',
    '/success.html',
    '/reset-password.html',
    '/styles.css',
    '/script.js',
    '/api.js',
    '/firebase.js',
    '/firebase-auth.js',
    '/js/age-check.js',
    '/js/age-verification.js',
    '/js/auth.js',
    '/js/checkout.js'
];

// Install event - cache essential assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE).catch(err => {
                console.log('Some assets failed to cache, but service worker will continue:', err);
                return cache.addAll([
                    '/',
                    '/index.html',
                    '/styles.css',
                    '/script.js'
                ]);
            });
        })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests and external URLs
    if (request.method !== 'GET' || url.origin !== location.origin) {
        return;
    }

    // For API requests, always use network-first strategy and don't cache
    // This prevents stale data from showing on Safari iOS
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // Don't cache API responses - always fetch fresh data
                    return response;
                })
                .catch(() => {
                    // Only return cached response if truly offline
                    return caches.match(request).then(cached => {
                        return cached || new Response(
                            JSON.stringify({ error: 'Offline - No cached data available' }),
                            { 
                                status: 503, 
                                statusText: 'Service Unavailable',
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    });
                })
        );
        return;
    }

    // For images, use network-first strategy to avoid stale cached images
    if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // Only cache if successful
                    if (response && response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, responseToCache).catch(err => {
                                console.warn('Failed to cache image:', err);
                            });
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if network fails
                    return caches.match(request);
                })
        );
        return;
    }

    // For other static assets, use cache-first strategy
    event.respondWith(
        caches.match(request).then(response => {
            if (response) {
                return response;
            }

            return fetch(request)
                .then(response => {
                    // Cache successful responses
                    if (!response || response.status !== 200 || response.type === 'error') {
                        return response;
                    }

                    try {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, responseToCache).catch(err => {
                                console.warn('Failed to cache asset:', err);
                            });
                        });
                    } catch (err) {
                        console.warn('Clone error:', err);
                    }

                    return response;
                })
                .catch(() => {
                    // Fallback for offline HTML pages
                    if (request.mode === 'navigate') {
                        return caches.match(OFFLINE_URL).catch(() => {
                            return new Response('Offline - Please check your connection', {
                                status: 503,
                                statusText: 'Service Unavailable'
                            });
                        });
                    }

                    // Return a generic offline response
                    return new Response(
                        'Offline - Please check your connection',
                        { status: 503, statusText: 'Service Unavailable' }
                    );
                });
        })
    );
});

// Handle messages from the app
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
