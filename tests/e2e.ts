import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function run(): Promise<void> {
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

    // 1. Verify Service Worker becomes active
    const swActive = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return Boolean(reg.active);
    });
    assert.equal(swActive, true, 'Service Worker should become active');

    await page.waitForFunction(() =>
      document.getElementById('sw-status')?.textContent?.includes('Active'),
    );

    // 2. Verify offline navigation works from Service Worker cache
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });

    const heading = await page.locator('h1').textContent();
    assert.equal(heading?.trim(), 'PWA Template');

    const networkText = await page.locator('#network-status').textContent();
    assert.equal(networkText?.trim(), 'Offline');

    assert.deepEqual(errors, [], `Unexpected browser errors: ${errors.join('; ')}`);
    console.log('E2E PWA verification passed (Service Worker + offline reload).');
  } finally {
    await browser.close();
    await server.httpServer.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
