// gtag sends with credentials, and a browser refuses a credentialed answer that says
// `Access-Control-Allow-Origin: *` (see "Things this taught us"). The hit still reaches
// the collector, but the page sees a failed request, and so does any tool watching it.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { start } from '../../../server.mjs';

let tb;
beforeAll(() => { tb = start(0); });
afterAll(() => tb.stop());

test('the collector answers a credentialed hit the way a browser accepts', async () => {
  const origin = tb.shop;
  const r = await fetch(`${tb.shop}/g/collect?v=2&tid=G-TESTBED01&en=page_view`, { headers: { origin } });
  expect(r.status).toBe(204);
  expect(r.headers.get('access-control-allow-origin')).toBe(origin);
  expect(r.headers.get('access-control-allow-credentials')).toBe('true');
});

test('a hit with no Origin gets no CORS headers at all', async () => {
  const r = await fetch(`${tb.shop}/g/collect?v=2&tid=G-TESTBED01&en=page_view`);
  expect(r.status).toBe(204);
  expect(r.headers.get('access-control-allow-origin')).toBeNull();
});
