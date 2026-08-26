/* ══════════════════════════════════════════════════════════════
   Vigil — service worker

   Job: make the shell open instantly with no signal. That is all.

   ── Licensing: read before adding any runtime caching ──────────
   This worker NEVER caches a scripture API response. The
   same-origin guard in fetch() is not a performance choice, it is
   a licensing boundary: ESV text is copyright Crossway and may be
   fetched live with the user's own key but must not be written to
   disk. A "helpful" runtime cache over api.esv.org would put the
   app in breach. HelloAO text is public domain and legal to store,
   but it already has a real offline path (IndexedDB, via Store) —
   caching it here too would add a second, staler copy with no
   eviction story. Shell only. Leave the guard alone.

   Chapter text is therefore never this worker's business. Offline
   scripture comes from IndexedDB inside the page, not from here.
   ══════════════════════════════════════════════════════════════ */

/* Bump on release. Cache-busting is belt-and-braces here — the shell is
   served stale-while-revalidate, so a new index.html lands on the second
   launch even without a bump — but bumping makes it the FIRST launch and
   drops the previous cache. */
const VERSION = "vigil-v6";

/* Relative so one worker serves both / (local) and /vigil/ (Pages). */
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(VERSION)
      /* Individual puts, not addAll: addAll is atomic, so one 404 (a
         renamed icon, say) throws the whole install away and the app
         silently keeps the old worker forever. */
      .then(c => Promise.all(SHELL.map(u =>
        c.add(new Request(u, { cache: "reload" })).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  /* THE LICENSING BOUNDARY — see header. Anything not served from our
     own origin (api.esv.org, bible.helloao.org) goes straight to the
     network, untouched and unstored. */
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cache  = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });

    /* Revalidate in the background: serve instantly from cache, and
       quietly refresh it for next launch. */
    const fresh = fetch(req).then(res => {
      if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (cached) { e.waitUntil(fresh); return cached; }

    const res = await fresh;
    if (res) return res;

    /* Offline and never cached — for a navigation (a deep link, or a
       cold start against a stale cache key) fall back to the shell so
       the app still opens rather than showing the browser error page. */
    if (req.mode === "navigate") {
      const shell = await cache.match("./index.html") || await cache.match("./");
      if (shell) return shell;
    }
    return new Response("", { status: 503, statusText: "Offline" });
  })());
});
