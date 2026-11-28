import { test, expect } from '@playwright/test';
import Engine from '../../src/game/engine.js';

test('complete app installs, reloads, plays and reopens offline with saved progress', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle('Scoundrel — Solo Card Dungeon');
  const favicon = page.locator('link[rel="icon"][type="image/svg+xml"]');
  await expect(favicon).toHaveAttribute('href', '/icons/scoundrel.svg');
  await expect(page.getByRole('status').filter({ hasText: 'Ready to play offline' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    return (await fetch(link.href)).json();
  });
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some(icon => icon.purpose === 'maskable')).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Scoundrel.' })).toBeVisible();
  await expect(page.locator('.offline-status')).toContainText('Ready to play offline');
  // Fetch every image, including ones that were never shown during the first visit.
  const artwork = await page.evaluate(async () => {
    const names = ['club-1', 'club-2', 'club-3', 'spade-1', 'spade-2', 'spade-3',
      'diamond-1', 'diamond-2', 'diamond-3', 'heart', 'deck'];
    return Promise.all(names.map(async name => {
      const image = new Image();
      image.src = new URL(`Assets/${name}.jpg`, location.href).href;
      await image.decode();
      return image.naturalWidth > 0;
    }));
  });
  expect(artwork).toEqual(Array(11).fill(true));
  await page.locator('#helpBtn').click();
  await expect(page.locator('#rulesDialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#avoidBtn').click();
  const saved = await page.evaluate(() => localStorage.getItem('scoundrel-dungeon-v1'));
  expect(JSON.parse(saved).turn).toBe(2);
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem('scoundrel-dungeon-v1'))).toBe(saved);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/?offline-reopen=1');
  await expect(reopened.locator('#turnValue')).toHaveText('02');
  expect(await reopened.evaluate(() => localStorage.getItem('scoundrel-dungeon-v1'))).toBe(saved);
  expect(errors).toEqual([]);
});

test('recovery replaces a previous app worker without deleting saved games or unrelated caches', async ({ page, context }) => {
  await context.route('**/legacy-sw.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
      self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
      self.addEventListener('fetch', e => {
        if (e.request.mode === 'navigate') e.respondWith(Promise.resolve(new Response(
          '<!doctype html><title>Kitchen Atlas · Recipes</title><h1>Kitchen Atlas</h1>',
          {headers:{'Content-Type':'text/html; charset=utf-8'}})));
      });`,
  }));
  // Use a static page so Scoundrel's normal registration does not race this fixture.
  await page.goto('/icons/scoundrel.svg');
  const savedGame = JSON.stringify(Engine.newGame('recovery-regression'));
  await page.evaluate(async saved => {
    localStorage.setItem('scoundrel-dungeon-v1', saved);
    localStorage.setItem('unrelated-saved-data', 'preserve-me');
    await caches.open('kitchen-atlas-existing-data');
    await navigator.serviceWorker.register('/legacy-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  }, savedGame);
  await page.goto('/?utm_source=chatgpt.com');
  await expect(page).toHaveTitle('Kitchen Atlas · Recipes');
  // Equivalent to a hard reload when an older worker intercepts recovery itself.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await page.goto('/recover.html');
  await cdp.send('Network.setBypassServiceWorker', { bypass: false });
  await page.getByRole('button', { name: 'Repair offline files' }).click();
  await expect(page.getByRole('status')).toContainText('Ready to play offline.', { timeout: 30000 });
  await page.getByRole('link', { name: 'Return to the game' }).click();
  await expect(page).toHaveTitle('Scoundrel — Solo Card Dungeon');
  await expect(page.locator('.offline-status')).toContainText('Ready to play offline');
  expect(await page.evaluate(() => localStorage.getItem('unrelated-saved-data'))).toBe('preserve-me');
  expect(await page.evaluate(() => localStorage.getItem('scoundrel-dungeon-v1'))).toBe(savedGame);
  expect(await page.evaluate(() => caches.keys())).toContain('kitchen-atlas-existing-data');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#roomGrid .playing-card')).toHaveCount(4);
  await page.goto('/recover.html');
  await expect(page).toHaveTitle('Scoundrel — Offline Recovery');
});

test('missing cached bundles return a controlled response and can be repaired', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.offline-status')).toContainText('Ready to play offline');
  const script = await page.locator('script[type="module"]').getAttribute('src');
  await page.evaluate(async path => {
    for (const name of await caches.keys()) await (await caches.open(name)).delete(path);
  }, script);
  await context.setOffline(true);
  const status = await page.evaluate(async path => (await fetch(path)).status, script);
  expect(status).toBe(503);
  await page.goto('/recover.html');
  await expect(page).toHaveTitle('Scoundrel — Offline Recovery');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Repair offline files' }).click();
  await expect(page.getByRole('status')).toContainText('Ready to play offline.', { timeout: 30000 });
  await context.setOffline(true);
  await page.getByRole('link', { name: 'Return to the game' }).click();
  await expect(page.locator('#roomGrid .playing-card')).toHaveCount(4);
});
