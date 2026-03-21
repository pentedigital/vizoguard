const CACHE_NAME = 'vg-v29';

const APP_SHELL = [
  '/',
  '/ar/',
  '/hi/',
  '/fr/',
  '/es/',
  '/tr/',
  '/ru/',
  '/css/style.css',
  '/css/rtl.css',
  '/js/main.js',
  '/js/i18n.js',
  '/locales/en.json',
  '/locales/ar.json',
  '/locales/hi.json',
  '/locales/fr.json',
  '/locales/es.json',
  '/locales/tr.json',
  '/locales/ru.json',
  '/pricing.html',
  '/download.html',
  '/compare/vizoguard-vs-nordvpn.html',
  '/compare/vizoguard-vs-expressvpn.html',
  '/blog/what-is-vpn.html',
  '/setup.html',
  '/privacy.html',
  '/terms.html',
  '/manifest.json'
];

// Install: cache the app shell, then skip waiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests — let external requests (fonts, CDN) pass through
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-only for API calls (never cache license/auth data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Network-first for HTML pages (ensures updates are immediate)
  // Use cache:'no-store' to bypass browser HTTP cache — prevents stale 404s from being served
  if (url.pathname === '/' || url.pathname === '/ar/' || url.pathname === '/hi/' || url.pathname === '/fr/' || url.pathname === '/es/' || url.pathname === '/tr/' || url.pathname === '/ru/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Stale-while-revalidate for static assets (CSS/JS/images)
  if (/\.(css|js|json|png|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Default: network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
