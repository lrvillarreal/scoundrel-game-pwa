/* Build placeholders are replaced by offline-plugin.mjs. */
const scope = self.registration.scope;
const prefix = `scoundrel-offline:${scope}:`;
const cacheName = prefix + '__BUILD_VERSION__';
const files = __PRECACHE_FILES__;
const shell = new URL('index.html', scope).href;
const urls = files.map(file => new URL(file, scope).href);
const precached = new Set(urls);

async function populate() {
  const cache = await caches.open(cacheName);
  await cache.addAll(urls.map(url => new Request(url, { cache: 'reload' })));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Installation fails if any asset is missing. A previous version stays usable.
    await populate();
  })());
  // Keep updates waiting until all existing game windows have closed.
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SCOUNDREL_ACTIVATE') {
    event.waitUntil(self.skipWaiting());
  }
  if (event.data?.type === 'SCOUNDREL_STATUS' || event.data?.type === 'SCOUNDREL_REPAIR') {
    event.waitUntil((async () => {
      try {
        if (event.data.type === 'SCOUNDREL_REPAIR') await populate();
        const cache = await caches.open(cacheName);
        const entries = await Promise.all(urls.map(url => cache.match(url, { ignoreVary: true })));
        event.ports[0]?.postMessage({ app: 'scoundrel', ready: entries.every(Boolean) });
      } catch {
        event.ports[0]?.postMessage({ app: 'scoundrel', ready: false });
      }
    })());
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return;
  const url = new URL(request.url);
  // Only cache the app's navigation and known static files, never arbitrary data.
  if (request.mode !== 'navigate' && !precached.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const target = request.mode === 'navigate'
      ? (url.pathname === new URL('recover.html', scope).pathname ? new URL('recover.html', scope).href : shell)
      : request;
    // These are fixed build files. Hosting CORS headers (Vary: Origin) must not
    // make module/style requests miss copies fetched during installation.
    const cached = await cache.match(target, { ignoreVary: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(target, response.clone());
      return response;
    } catch {
      if (request.mode === 'navigate') {
        return new Response('<!doctype html><title>Scoundrel — Offline setup needed</title><h1>Scoundrel</h1><p>Offline files are missing. Reconnect and open <a href="recover.html">offline recovery</a>.</p>', {
          status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return new Response('Scoundrel offline file is missing. Reconnect and use recover.html.', { status: 503 });
    }
  })());
});
