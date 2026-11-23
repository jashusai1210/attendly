/**
 * ATTENDLY — Unified Service Worker (Offline PWA + Web Push + Attendance Actions)
 *
 * Capabilities:
 * 1) Android-installable PWA offline shell caching (/index.html, /manifest.webmanifest, /icon.svg).
 * 2) 9:00 AM Weekday Push Notifications with ATTEND/ABSENT action buttons.
 * 3) Thursday & Sunday 6:00 PM IST Reminders.
 * 4) Notification click handling with reliable window focus / navigation fallback.
 */

const CACHE_NAME = "attendly-pwa-v2";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/attendly-mobile-signup.png"
];

// Install: Cache offline core shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn("[SW] Cache preload warning:", err))
  );
});

// Activate: Clean old caches and claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: Network-first with cache fallback for HTML navigation, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Ignore non-GET or cross-origin requests (Firebase API, Firestore, Google Auth)
  if (event.request.method !== "GET" || url.origin !== location.origin) {
    return;
  }

  // Handle SPA navigation requests
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Handle static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and requesting an image, return cached icon
          if (event.request.destination === "image") {
            return caches.match("/icon.svg");
          }
        });
    })
  );
});

// Push: Handle incoming Web Push notifications from FCM
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  const notification = data.notification || {};
  const payloadData = data.data || {};

  const title = notification.title || payloadData.title || "ATTENDLY — Daily Attendance Check ⏰";
  const body = notification.body || payloadData.body || "College ki vellava leka bunk kottava? Mark today's class.";
  const type = payloadData.type || "daily_check";
  const date = payloadData.date || "";

  // Actions for daily check
  const actions = [];
  if (type === "daily_check") {
    actions.push(
      { action: "attend", title: "✅ ATTEND" },
      { action: "absent", title: "❌ ABSENT" }
    );
  }

  const options = {
    body,
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: type === "daily_check" ? `attendly-daily-${date}` : "attendly-alert",
    renotify: true,
    requireInteraction: type === "daily_check",
    data: {
      type,
      date,
      clickAction: payloadData.click_action || "/?action=prompt",
      url: payloadData.url || "/"
    },
    actions
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click: Handle action buttons and click fallback
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action; // 'attend', 'absent', or empty string
  const date = data.date || "";

  let targetUrl = "/";
  if (action === "attend" || action === "present") {
    targetUrl = `/?action=attend${date ? `&date=${encodeURIComponent(date)}` : ""}&source=notification`;
  } else if (action === "absent") {
    targetUrl = `/?action=absent${date ? `&date=${encodeURIComponent(date)}` : ""}&source=notification`;
  } else {
    targetUrl = `/?action=prompt${date ? `&date=${encodeURIComponent(date)}` : ""}&source=notification`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
