import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const rootDir = resolve(import.meta.dirname, '..');

async function run(): Promise<void> {
  const backend = spawn('node', ['server/index.ts'], {
    cwd: rootDir,
    env: { ...process.env, PORT: '3000', DB_PATH: ':memory:' },
    stdio: 'ignore',
  });

  // Give the lightweight node:http server a moment to bind port 3000
  await new Promise((r) => setTimeout(r, 300));

  const server = await preview({
    preview: { port: 4173, strictPort: true },
  });
  const baseUrl = server.resolvedUrls?.local[0] ?? 'http://localhost:4173/';

  const browser = await chromium.launch(
    existsSync(MAC_CHROME) ? { executablePath: MAC_CHROME } : {},
  );

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    // 1. Verify Service Worker becomes active and VAPID key auto-fills from backend
    const swActive = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return Boolean(reg.active);
    });
    assert.equal(swActive, true, 'Service Worker should become active');

    await page.waitForFunction(() =>
      document.getElementById('sw-status')?.textContent?.includes('Active'),
    );

    const vapidValue = await page.locator('#vapid-key').inputValue();
    assert.ok(vapidValue.length > 20, 'VAPID public key should auto-fill from /api/vapid-public-key');

    assert.deepEqual(errors, [], `Unexpected online browser errors: ${errors.join('; ')}`);

    // 2. Verify offline navigation works from Service Worker cache
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    const heading = await page.locator('h1').textContent();
    assert.equal(heading?.trim(), 'PWA Template');

    const networkText = await page.locator('#network-status').textContent();
    assert.equal(networkText?.trim(), 'Offline');

    console.log('E2E PWA verification passed (Service Worker + VAPID auto-fill + offline reload).');
  } finally {
    await browser.close();
    await server.httpServer.close();
    backend.kill();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
