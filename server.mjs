// The testbed server. It plays three roles, each a real one in production:
//   1. the shop            http://shop.localhost:<port>/
//   2. a payment gateway   http://pay.localhost:<port>/   (a different site, like a real gateway)
//   3. a first-party collector at /g/collect, standing in for server-side GTM. It records
//      every GA4 hit it receives, so tests can assert what "arrived", and forwards nothing.
// Run: bun server.mjs   (port 80 when allowed, else 8080; PORT overrides)
import { decodeGa4 } from './lib/ga4.mjs';

const SITE = new URL('./site/', import.meta.url).pathname;
const hits = [];
let PORT = 0;

const origin = (sub) => `http://${sub}.localhost:${PORT}`;

// Served instead of site/config.js, which is the static-hosting fallback with tags off.
const config = () => `window.TB_CONFIG = ${JSON.stringify({
  mode: 'local', tags: true, ga4: 'G-TESTBED01',
  shop: origin('shop'), pay: origin('pay'), collector: origin('shop'),
})};\n`;

async function collect(req, url) {
  const body = req.method === 'POST' ? await req.text() : '';
  for (const event of decodeGa4(url.search.slice(1), body)) {
    hits.push({ ts: Date.now(), host: url.host, firstParty: true, ...event });
  }
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } });
}

async function file(path) {
  const clean = path.replace(/\.\.+/g, '').replace(/\/$/, '/index.html');
  const f = Bun.file(SITE + clean.replace(/^\//, ''));
  return (await f.exists()) ? new Response(f) : new Response('Not found', { status: 404 });
}

export function start(port = Number(process.env.PORT || 8080)) {
  const server = Bun.serve({
    port,
    hostname: '127.0.0.1',
    async fetch(req) {
      const url = new URL(req.url);
      const host = (req.headers.get('host') || '').split(':')[0];
      if (url.pathname === '/g/collect') return collect(req, url);
      if (url.pathname === '/sink/hits') return Response.json(hits);
      if (url.pathname === '/sink/reset' && req.method === 'POST') { hits.length = 0; return new Response(null, { status: 204 }); }
      if (url.pathname === '/config.js') return new Response(config(), { headers: { 'content-type': 'text/javascript' } });
      // The gateway is its own site: it serves only site/pay/.
      if (host === 'pay.localhost') return file(`/pay${url.pathname}`);
      return file(url.pathname);
    },
  });
  PORT = server.port;
  return { server, shop: origin('shop'), pay: origin('pay'), stop: () => server.stop(true) };
}

if (import.meta.main) {
  // gtag.js drops a non-default port from server_container_url, so hits reach the
  // collector only on port 80. macOS allows that without root; elsewhere, set PORT.
  let t;
  try { t = start(Number(process.env.PORT || 80)); } catch {
    t = start(8080);
    console.log('Port 80 unavailable: pages work, but GA4 hits will not reach the collector (see README).');
  }
  console.log(`testbed: ${t.shop}/  (gateway ${t.pay}/, collector ${t.shop}/g/collect)`);
}
