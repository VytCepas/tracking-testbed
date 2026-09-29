// The public site (static hosting, no testbed server) must send nothing anywhere:
// a visitor learning from it can never reach an analytics or ad account.
import { expect, test } from 'bun:test';
import { chromium } from 'playwright';

const SITE = new URL('../site/', import.meta.url).pathname;

test('static hosting: a full purchase sends no request off the site', async () => {
  const server = Bun.serve({
    port: 0, hostname: '127.0.0.1',
    async fetch(req) {
      const p = new URL(req.url).pathname.replace(/\/$/, '/index.html');
      const f = Bun.file(SITE + p.slice(1));
      return (await f.exists()) ? new Response(f) : new Response('Not found', { status: 404 });
    },
  });
  const base = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const offsite = [];
  page.on('request', (r) => { if (!r.url().startsWith(base)) offsite.push(r.url()); });
  try {
    await page.goto(`${base}/index.html`);
    await page.click('#tb-accept');
    await page.goto(`${base}/product.html?id=TB-LAMP`);
    await page.click('#add');
    await page.goto(`${base}/cart.html`);
    await Promise.all([page.waitForURL(/checkout/), page.click('#checkout')]);
    await Promise.all([page.waitForURL(/\/pay\//), page.click('text=Continue to payment')]);
    await Promise.all([page.waitForURL(/thank-you/), page.click('#pay')]);
    const pushes = await page.evaluate(() => window.dataLayer.map((m) => m.event).filter(Boolean));
    expect(pushes).toContain('purchase');
    await page.waitForTimeout(1000);
  } finally {
    await browser.close();
    server.stop(true);
  }
  expect(offsite).toEqual([]);
}, 60000);
