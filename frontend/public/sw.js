/**
 * @file sw.js
 * @description ATLAS Platform Service Worker — PWA & Push Notification Infrastructure
 *
 * ARCHITECTURE: Network-First strategy for API calls, Cache-First for static assets.
 * This prevents stale academic content while keeping the app shell fast offline.
 *
 * US-02: PWA infrastructure (Lighthouse PWA audit compliance)
 * US-16: Push notification delivery for spaced-repetition (SM-2) flashcard reminders
 */

const CACHE_NAME = 'atlas-shell-v1';
const OFFLINE_URL = '/offline.html';

/**
 * Static assets to pre-cache on installation.
 * Only caching the app shell — never academic document content (MinIO-served).
 */
const PRECACHE_ASSETS = [
  '/',
  '/search',
  '/auth/login',
  '/auth/register',
  '/manifest.json',
  OFFLINE_URL,
];

// =============================================================================
// LIFECYCLE: INSTALL
// =============================================================================

self.addEventListener('install', (event) => {
  console.log('[ATLAS SW] Installing Service Worker, cache version:', CACHE_NAME);

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('[ATLAS SW] Pre-caching app shell assets');
        // DEFENSIVE ARCHITECTURE: addAll is atomic — if one asset fails, entire install fails.
        // We wrap in a try/catch so a missing optional asset doesn't break the SW install.
        return Promise.allSettled(
          PRECACHE_ASSETS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn(`[ATLAS SW] Pre-cache miss for ${url}:`, err);
            })
          )
        );
      })
      .then(() => {
        // Force the new SW to become active immediately without waiting for old tabs to close.
        return self.skipWaiting();
      })
  );
});

// =============================================================================
// LIFECYCLE: ACTIVATE
// =============================================================================

self.addEventListener('activate', (event) => {
  console.log('[ATLAS SW] Activating Service Worker');

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((staleName) => {
              console.log('[ATLAS SW] Deleting stale cache:', staleName);
              return caches.delete(staleName);
            })
        );
      })
      .then(() => {
        // Take control of all open clients immediately (no page reload required).
        return self.clients.claim();
      })
  );
});

// =============================================================================
// FETCH STRATEGY: Network-First for API, Cache-First for static assets
// =============================================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // DEFENSIVE ARCHITECTURE: Only intercept GET requests.
  // POST/PATCH/DELETE must always go to the network — never serve stale mutation results.
  if (request.method !== 'GET') {
    return;
  }

  // STRATEGY 1: Network-First for all API calls to the FastAPI backend.
  // Academic content must always be fresh. Cache is used only as a fallback on network failure.
  if (url.pathname.startsWith('/api/') || url.hostname === 'localhost' && url.port === '8000') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Only cache successful, non-opaque responses.
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // STRATEGY 2: Network-First for Next.js page navigations.
  // Ensures that SSR and RSC payloads are always fresh.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(OFFLINE_URL) || caches.match('/');
      })
    );
    return;
  }

  // STRATEGY 3: Cache-First for static assets (_next/static, fonts, icons).
  // These are content-hashed by Next.js build — safe to serve from cache indefinitely.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/screenshots/')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return networkResponse;
        });
      })
    );
    return;
  }
});

// =============================================================================
// US-16: PUSH NOTIFICATION HANDLER
// =============================================================================

/**
 * Receives push events from the ATLAS backend (via Web Push Protocol).
 * Triggered when the backend signals that flashcard reviews are due (SM-2 nextReviewAt).
 *
 * Expected push payload shape:
 * {
 *   "title": "ATLAS — Cards Due",
 *   "body": "You have 5 flashcards due for review in Algorithmique.",
 *   "icon": "/icons/icon-192x192.png",
 *   "badge": "/icons/icon-96x96.png",
 *   "data": { "url": "/study/flashcards/decks/[deck_id]/review" }
 * }
 */
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.warn('[ATLAS SW] Push event received with no payload. Ignoring.');
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (err) {
    console.error('[ATLAS SW] Failed to parse push payload as JSON:', err);
    return;
  }

  const title = payload.title || 'ATLAS Notification';
  const options = {
    body: payload.body || 'You have a new notification.',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-96x96.png',
    data: payload.data || { url: '/' },
    // DEFENSIVE UX: Vibrate pattern for mobile — subtle double-tap.
    vibrate: [100, 50, 100],
    // Tag groups duplicate notifications (e.g., multiple deck reminders collapse into one).
    tag: payload.tag || 'atlas-notification',
    // Renotify: true ensures a new vibration/sound even when replacing a tagged notification.
    renotify: true,
    actions: [
      {
        action: 'review',
        title: 'Review Now',
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// =============================================================================
// US-16: NOTIFICATION CLICK HANDLER
// =============================================================================

/**
 * Handles user interaction with a displayed push notification.
 * Navigates the user to the relevant review URL on click.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // If the user clicked the 'dismiss' action, do nothing beyond closing.
  if (event.action === 'dismiss') {
    return;
  }

  // For 'review' action or a direct notification click: navigate to the target URL.
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // DEFENSIVE ARCHITECTURE: If an ATLAS tab is already open, focus it and navigate.
        // Avoids spawning duplicate tabs.
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            return client.navigate(targetUrl);
          }
        }
        // No existing tab found — open a new one.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// =============================================================================
// MESSAGE HANDLER: Manual cache invalidation from the app
// =============================================================================

/**
 * Allows the Next.js app to send control messages to the Service Worker.
 * Currently supports 'SKIP_WAITING' to force immediate SW activation.
 *
 * Usage from the app:
 *   navigator.serviceWorker.controller?.postMessage({ type: 'SKIP_WAITING' });
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});