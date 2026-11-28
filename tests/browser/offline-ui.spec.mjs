import { test, expect } from '@playwright/test';

const readiness = page => page.locator('.offline-status > p').first();

async function troubleshooting(page) {
  await page.locator('#helpBtn').click();
  const details = page.locator('.offline-troubleshooting');
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  const repair = details.getByRole('link', { name: 'Repair offline play' });
  await expect(repair).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(repair).toBeFocused();
  return repair;
}

// Hold the worker's status reply so the actual UI must wait for verification.
async function holdVerification(page) {
  await page.addInitScript(() => {
    const container = new EventTarget();
    const active = {
      postMessage(message, ports) {
        if (message.type === 'SCOUNDREL_STATUS') window.replyOfflineStatus = data => ports[0].postMessage(data);
      },
    };
    const registration = Object.assign(new EventTarget(), { active, waiting: null, installing: null });
    Object.assign(container, { register: async () => registration, ready: Promise.resolve(registration) });
    Object.defineProperty(navigator, 'serviceWorker', { value: container });
  });
}

test('footer shows verified success with a subtle green dot and Help keeps recovery accessible', async ({ page }) => {
  await page.goto('/');
  await expect(readiness(page)).toHaveText('Ready to play offline');
  await expect(page.locator('footer .offline-status')).toBeVisible();
  await expect(page.locator('.offline-status a')).toHaveCount(0);
  const dot = page.locator('.offline-status-dot');
  await expect(dot).toHaveAttribute('aria-hidden', 'true');
  await expect(dot).toHaveCSS('background-color', 'rgb(144, 206, 185)');
  await expect(dot).toHaveCSS('width', '6px');
  await expect(readiness(page)).toHaveAttribute('role', 'status');
  await expect(readiness(page)).toHaveAttribute('aria-live', 'polite');
  await expect(readiness(page)).toHaveAttribute('aria-atomic', 'true');
  const repair = await troubleshooting(page);
  await repair.click();
  await expect(page.getByRole('button', { name: 'Repair offline files' })).toBeVisible();
});

test('preparing waits quietly for verification and Help recovery works while pending', async ({ page }) => {
  await holdVerification(page);
  await page.goto('/');
  await expect(readiness(page)).toHaveText('Preparing offline play…');
  await expect(page.locator('.offline-status-dot')).toHaveCount(0);
  await expect(page.locator('.offline-status a')).toHaveCount(0);
  const repair = await troubleshooting(page);
  await expect(readiness(page)).toHaveText('Preparing offline play…');
  await repair.click();
  await expect(page).toHaveURL(/\/recover.html$/);
});

test('failed verification exposes repair and the existing recovery repairs and preserves progress', async ({ page }) => {
  await page.goto('/');
  await expect(readiness(page)).toHaveText('Ready to play offline');
  const saved = await page.evaluate(() => localStorage.getItem('scoundrel-dungeon-v1'));
  // Delete an unseen image, leaving the app bundle available for the reload.
  await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('scoundrel-offline:')) await (await caches.open(name)).delete(new URL('Assets/deck.jpg', location.href).href);
    }
  });
  await page.reload();
  await expect(readiness(page)).toHaveText('Offline setup failed. Reconnect and try repairing.');
  await expect(page.locator('.offline-status-dot')).toHaveCount(0);
  await expect(page.locator('.offline-status a')).toBeVisible();
  await troubleshooting(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#helpBtn')).toBeFocused();
  await page.locator('.offline-status a').click();
  await page.getByRole('button', { name: 'Repair offline files' }).click();
  await expect(page.getByRole('status')).toContainText('Ready to play offline.', { timeout: 30000 });
  await page.getByRole('link', { name: 'Return to the game' }).click();
  await expect(readiness(page)).toHaveText('Ready to play offline');
  expect(await page.evaluate(() => localStorage.getItem('scoundrel-dungeon-v1'))).toBe(saved);
});

test('verification timeout never reports success and offers repair', async ({ page }) => {
  await holdVerification(page);
  await page.goto('/');
  await expect(readiness(page)).toHaveText('Preparing offline play…');
  await expect(readiness(page)).toHaveText('Offline setup failed. Reconnect and try repairing.', { timeout: 10000 });
  await expect(page.locator('.offline-status a')).toBeVisible();
  await expect(page.locator('.offline-status-dot')).toHaveCount(0);
});

test('foreign worker identity cannot report success even with a ready reply', async ({ page }) => {
  await holdVerification(page);
  await page.goto('/');
  await page.waitForFunction(() => window.replyOfflineStatus);
  await page.evaluate(() => window.replyOfflineStatus({ app: 'another-app', ready: true }));
  await expect(readiness(page)).toHaveText('Offline setup failed. Reconnect and try repairing.');
});

test('registration failure offers repair and Help remains usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, 'register', { value: async () => { throw new Error('Registration failed'); } });
  });
  await page.goto('/');
  await expect(readiness(page)).toHaveText('Offline setup failed. Reconnect and try repairing.');
  await expect(page.locator('.offline-status a')).toBeVisible();
  await troubleshooting(page);
});

test('a real worker update waits, announces availability and activates after game windows close', async ({ page, context, request }) => {
  const original = await (await request.get('/sw.js')).text();
  let version = 1;
  await context.route('**/sw.js', route => route.fulfill({
    contentType: 'application/javascript', body: original + `\n// Update regression ${version}\n`,
  }));
  await page.goto('/');
  await expect(readiness(page)).toHaveText('Ready to play offline');
  const saved = await page.evaluate(() => localStorage.getItem('scoundrel-dungeon-v1'));
  version = 2;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await expect(page.locator('.offline-update')).toHaveText('Update ready. Close all game windows and reopen to update.');
  expect(await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return { active: registration.active.state, waiting: registration.waiting.state };
  })).toEqual({ active: 'activated', waiting: 'installed' });
  await expect(readiness(page)).toHaveText('Ready to play offline');
  await expect(page.locator('.offline-status a')).toHaveCount(0);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/');
  await expect(readiness(reopened)).toHaveText('Ready to play offline');
  await expect.poll(() => reopened.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration.active.state === 'activated' && !registration.waiting;
  })).toBe(true);
  await expect(reopened.locator('.offline-update')).toBeEmpty();
  expect(await reopened.evaluate(() => localStorage.getItem('scoundrel-dungeon-v1'))).toBe(saved);
});

test('mobile footer and Help support keyboard use and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(readiness(page)).toHaveText('Ready to play offline');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.offline-status-dot')).toHaveCSS('animation-name', 'none');
  await page.locator('footer').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/offline-footer-mobile.png' });
  await troubleshooting(page);
  expect(await page.evaluate(() => document.querySelector('#rulesDialog').scrollWidth <= document.querySelector('#rulesDialog').clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/offline-help-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#helpBtn')).toBeFocused();
});
