/**
 * RGVBF Session Rosters — service worker
 *
 * DELIBERATELY DIFFERENT FROM THE OUTREACH APP.
 *
 * The outreach app is cache-first, which means index.html and app.js are
 * served from cache forever and only update when CACHE_NAME changes by
 * hand. That caused repeated stuck-cache incidents (§8.3 of its handoff)
 * and its own open items recommend switching to stale-while-revalidate.
 * This app does that from the start.
 *
 * How it behaves:
 *   - The page is served from cache instantly, so it opens with no signal.
 *   - In the background it fetches a fresh copy and stores it.
 *   - The next open uses the new version.
 *
 * So a deploy reaches devices on its own within two opens, WITHOUT a
 * version bump. Bumping CACHE_NAME still works and forces it sooner, but
 * forgetting to bump no longer strands anyone.
 *
 * Roster data is NOT cached here. It arrives by POST (uncacheable) and
 * lives in IndexedDB, which is the right place for it.
 */

var CACHE_NAME = 'rgvbf-rosters-v1';

var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // cache:"reload" forces real network fetches. Without it the browser
      // can satisfy these from its own HTTP cache and bake a STALE file
      // into a brand-new cache name — new HTML paired with old JS.
      // Do not replace this with cache.addAll().
      return Promise.all(SHELL.map(function (url) {
        return fetch(url, { cache: 'reload' })
          .then(function (res) { if (res.ok) return cache.put(url, res); })
          .catch(function () { /* a missing icon must not fail the install */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_NAME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;

  // Never touch the API. POSTs are not cacheable and stale rosters served
  // from a cache would be worse than an honest failure.
  if (req.method !== 'GET') return;
  if (req.url.indexOf('script.google.com') !== -1) return;
  if (req.url.indexOf('googleusercontent.com') !== -1) return;

  e.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () {
          return cached;                    // offline: whatever we have
        });
        return cached || network;           // instant if cached, else wait
      });
    })
  );
});
