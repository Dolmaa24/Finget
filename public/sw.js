/* global self, caches, fetch, Response, Headers, URL, clients */

/**
 * Finget's service worker.
 *
 * Hand-written rather than generated, because what it does is small and the
 * one rule that matters is a product rule, not a caching strategy:
 *
 *   A STALE NUMBER IS NEVER SHOWN WITHOUT SAYING IT IS STALE.
 *
 * Finget's entire proposition is a number you can act on in a shop. A cached
 * number presented as current is worse than no number at all — it is the app
 * confidently telling you to spend money you no longer have. So the ambient
 * response is cached WITH the time it was fetched, and every surface that
 * renders it from cache must show that time.
 *
 * Three caches, three lifetimes:
 *   SHELL    the built app. Stale-while-revalidate — the app opens instantly
 *            and quietly updates behind you.
 *   AMBIENT  the last good /api/finance/ambient response, so the offline page
 *            has something honest to show.
 *   PAGES    the offline fallback document itself.
 */

const VERSION = "v1";
const SHELL_CACHE = `finget-shell-${VERSION}`;
const AMBIENT_CACHE = `finget-ambient-${VERSION}`;
const PAGE_CACHE = `finget-pages-${VERSION}`;

const OFFLINE_URL = "/offline.html";

/** Header we stamp onto a cached ambient response so staleness is computable. */
const CACHED_AT_HEADER = "x-finget-cached-at";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"]))
      // A failed precache must not block activation — the app still works
      // online, and the fallback will be fetched on the next successful load.
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, AMBIENT_CACHE, PAGE_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/* ------------------------------------------------------------------ */
/* Fetch                                                               */
/* ------------------------------------------------------------------ */

/**
 * The ambient number: network first, and cache what comes back.
 *
 * Never cache-first. This is the one endpoint where a fast wrong answer is
 * worse than a slow right one.
 */
async function handleAmbient(request) {
  const cache = await caches.open(AMBIENT_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Re-wrap so we can stamp the fetch time; a Response's headers are
      // immutable once it has been constructed from the network.
      const body = await response.clone().text();
      const headers = new Headers(response.headers);
      headers.set(CACHED_AT_HEADER, new Date().toISOString());
      await cache.put(request, new Response(body, { status: 200, headers }));
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("offline and nothing cached");
  }
}

/** The built app: serve from cache, refresh in the background. */
async function handleShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached || network;
}

/** Navigations: network first, then the app shell, then the offline page. */
async function handleNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const shell = await caches.match(request, { cacheName: SHELL_CACHE });
    if (shell) return shell;

    const offline = await caches.match(OFFLINE_URL, { cacheName: PAGE_CACHE });
    if (offline) return offline;

    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.pathname.endsWith("/api/finance/ambient")) {
    event.respondWith(handleAmbient(request));
    return;
  }

  /**
   * Every other API call goes straight to the network, uncached, on purpose.
   * Transactions, balances and goals are the user's financial history; serving
   * them from a cache would mean a stale ledger presented as fact, and storing
   * them means they outlive a sign-out.
   */
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Same-origin build output only. Third-party requests are left alone.
  if (url.origin === self.location.origin) {
    event.respondWith(handleShell(request));
  }
});

/* ------------------------------------------------------------------ */
/* Push                                                                */
/* ------------------------------------------------------------------ */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Finget";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    /**
     * `tag` REPLACES an earlier notification with the same tag rather than
     * stacking. Three "this weekend will be tight" cards in a row is how a
     * person turns notifications off for good.
     */
    tag: payload.tag || "finget",
    renotify: false,
    data: { href: payload.href || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Tapping a notification focuses an existing window rather than opening a
 * fourth copy of the app.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(href).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    })
  );
});

/** Lets the page ask the worker to activate immediately after an update. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
