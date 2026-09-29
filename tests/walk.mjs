// Walk the shop like a buyer and record two things: every dataLayer push, and every
// GA4 hit. The walk is fenced: only the testbed's own hosts and the gtag.js library
// are reachable, anything else is answered locally, and DNS resolves nothing else.
// So even a broken tag cannot send a real hit anywhere.
import { chromium } from 'playwright';
import { decodeGa4 } from '../lib/ga4.mjs';

export const JOURNEY = {
  dataLayer: ['view_item_list', 'consent_update', 'view_item', 'add_to_cart', 'view_cart', 'begin_checkout', 'add_payment_info', 'purchase', 'generate_lead'],
  ga4: ['page_view', 'view_item_list', 'view_item', 'add_to_cart', 'view_cart', 'begin_checkout', 'add_payment_info', 'purchase', 'generate_lead'],
};

const LIBRARY_HOST = 'www.googletagmanager.com';

export async function walk({ shop, defects = [], headless = true }) {
  await fetch(`${shop}/sink/reset`, { method: 'POST' });
  const browser = await chromium.launch({
    headless,
    args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE *.localhost, EXCLUDE ${LIBRARY_HOST}`],
  });
  const ctx = await browser.newContext();
  const pushes = [];
  const intercepted = [];
  const thirdParty = [];
  let consentAt = Infinity;

  await ctx.exposeBinding('__tbCapture', (_src, data, page, load) => { pushes.push({ page, load, data }); });
  await ctx.addInitScript(() => {
    const load = Math.random().toString(36).slice(2);
    const dl = (window.dataLayer = window.dataLayer || []);
    const orig = dl.push.bind(dl);
    dl.push = (...msgs) => {
      for (const m of msgs) { try { window.__tbCapture(JSON.parse(JSON.stringify(m)), location.href, load); } catch { /* unserialisable */ } }
      return orig(...msgs);
    };
  });
  await ctx.route('**/*', (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.hostname === 'localhost' || u.hostname.endsWith('.localhost')) {
      // gtag.js drops a non-default port from server_container_url (observed 2026-09-29),
      // so on a test port its hits arrive at port 80. Send them to the collector.
      const shopPort = new URL(shop).port;
      if (!u.port && shopPort && u.pathname.endsWith('/g/collect')) return route.continue({ url: `${shop}${u.pathname}${u.search}` });
      return route.continue();
    }
    if (u.hostname === LIBRARY_HOST && req.resourceType() === 'script') return route.continue();
    if (!u.pathname.endsWith('/g/collect')) thirdParty.push(`${req.method()} ${u.host}${u.pathname}`);
    // gtag sends with credentials, so a `*` CORS answer fails and gtag stops sending for
    // the rest of the page. Answer the way the real endpoint does.
    const origin = req.headers().origin;
    return route.fulfill({ status: 204, headers: origin ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' } : {} });
  });

  // Routing never sees sendBeacon, so hits leaving for a third party are OBSERVED through
  // the DevTools protocol, which sees every transport. The DNS fence still stops them.
  async function observe(page) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    cdp.on('Network.requestWillBeSent', async ({ requestId, request }) => {
      const u = new URL(request.url);
      if (!u.pathname.endsWith('/g/collect') || u.hostname === 'localhost' || u.hostname.endsWith('.localhost')) return;
      let body = request.postData || '';
      if (!body && request.hasPostData) body = (await cdp.send('Network.getRequestPostData', { requestId }).catch(() => ({}))).postData || '';
      for (const e of decodeGa4(u.search.slice(1), body)) intercepted.push({ ...e, host: u.host, firstParty: false, ts: Date.now() });
    });
  }

  const received = async () => (await (await fetch(`${shop}/sink/hits`)).json());
  // Wait until no new hit or push has arrived for a moment.
  async function settle(quiet = 900, max = 12000) {
    const t0 = Date.now();
    let last = -1;
    let since = Date.now();
    while (Date.now() - t0 < max) {
      const n = (await received()).length + intercepted.length + pushes.length;
      if (n !== last) { last = n; since = Date.now(); }
      else if (Date.now() - since >= quiet) return;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const page = await ctx.newPage();
  await observe(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(`${shop}/index.html?defect=${defects.join(',')}`);
    await settle();
    consentAt = Date.now();
    await page.click('#tb-accept');
    await settle();
    await page.goto(`${shop}/product.html?id=TB-TENT-2P`);
    await settle();
    await page.click('#add');
    await settle();
    await page.goto(`${shop}/cart.html`);
    await settle();
    await Promise.all([page.waitForURL(/checkout\.html/), page.click('#checkout')]);
    await settle();
    await Promise.all([page.waitForURL(/pay\.localhost/), page.click('text=Continue to payment')]);
    await Promise.all([page.waitForURL(/thank-you\.html/), page.click('#pay')]);
    await settle();
    await page.reload();
    await settle();
    await page.goto(`${shop}/contact.html`);
    await settle();
    await Promise.all([page.waitForURL(/sent=1/), page.click('#lead button')]);
    await settle();
  } finally {
    await browser.close();
  }

  const phase = (h) => ({ ...h, phase: h.ts < consentAt ? 'pre-consent' : 'post-consent' });
  const hits = [...(await received()), ...intercepted].sort((a, b) => a.ts - b.ts).map(phase);
  return { pushes, hits, thirdParty, errors };
}
