import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const template = await readFile(new URL('../scripts/service-worker.js', import.meta.url), 'utf8');
const files = ['index.html', 'assets/game.js', 'Assets/heart.jpg'];

function worker({ scope = 'https://scoundrel.test/game/', missing = false } = {}) {
  const handlers = {};
  const stores = new Map();
  const requested = [];
  let claimed = false;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async addAll(requests) {
          if (missing) throw new Error('Missing required asset');
          for (const request of requests) {
            requested.push(request);
            entries.set(request.url, new Response(request.url.endsWith('index.html') ? 'game shell' : 'asset'));
          }
        },
        async match(request) {
          return entries.get(typeof request === 'string' ? request : request.url)?.clone();
        },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  vm.runInNewContext(template.replace('__BUILD_VERSION__', 'test-version')
    .replace('__PRECACHE_FILES__', JSON.stringify(files)), {
    self: {
      registration: { scope },
      clients: { async claim() { claimed = true; } },
      addEventListener(name, handler) { handlers[name] = handler; },
    },
    caches, URL, Request,
    fetch: async () => { throw new Error('Network is offline'); },
  });
  return {
    stores, requested, claimed: () => claimed,
    async lifecycle(name) {
      let result;
      handlers[name]({ waitUntil(promise) { result = promise; } });
      await result;
    },
    fetch(path, options = {}) {
      let result;
      handlers.fetch({ request: { url: new URL(path, scope).href, method: 'GET', ...options },
        respondWith(promise) { result = promise; } });
      return result;
    },
  };
}

test('all assets are precached and navigations, scripts and unseen artwork work offline in a subpath', async () => {
  const app = worker({});
  await app.lifecycle('install');
  assert.equal(app.requested.length, files.length);
  assert.ok(app.requested.every(request => request.cache === 'reload'));
  assert.equal(await (await app.fetch('./?seed=offline', { mode: 'navigate' })).text(), 'game shell');
  assert.equal(await (await app.fetch('assets/game.js')).text(), 'asset');
  assert.equal(await (await app.fetch('Assets/heart.jpg')).text(), 'asset');
});

test('a missing asset rejects installation instead of reporting a partial offline app', async () => {
  await assert.rejects(worker({ missing: true }).lifecycle('install'), /Missing required asset/);
});

test('activation deletes only old caches belonging to the same app scope', async () => {
  const app = worker({});
  await app.lifecycle('install');
  app.stores.set('scoundrel-offline:https://scoundrel.test/game/:old-version', new Map());
  app.stores.set('scoundrel-offline:https://scoundrel.test/other/:old-version', new Map());
  app.stores.set('other-app', new Map());
  await app.lifecycle('activate');
  assert.equal(app.stores.size, 3);
  assert.ok(app.stores.has('other-app'));
  assert.ok(app.stores.has('scoundrel-offline:https://scoundrel.test/other/:old-version'));
  assert.ok(app.claimed());
});

test('non-GET and out-of-scope requests are not intercepted', () => {
  const app = worker({});
  assert.equal(app.fetch('./', { method: 'POST' }), undefined);
  assert.equal(app.fetch('https://external.test/'), undefined);
  assert.equal(app.fetch('/another-app/'), undefined);
});
