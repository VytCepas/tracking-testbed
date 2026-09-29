// Decode a GA4 /g/collect request into one record per event.
// The wire format: shared parameters in the query string; with a POST, each body
// line is one more event whose own parameters are merged over the shared ones.
//   en = event name · ep.<x> = text param · epn.<x> = number param · cu = currency
//   dl = page location · dr = referrer · gcs = consent state (G1<ad><analytics>)
//   pr1..prN = items, "~"-separated two-letter keys: id, nm, pr, qt, ca, br, va

const ITEM_KEYS = { id: 'item_id', nm: 'item_name', pr: 'price', qt: 'quantity', ca: 'item_category', br: 'item_brand', va: 'item_variant' };

function item(s) {
  const out = {};
  for (const part of s.split('~')) {
    const k = ITEM_KEYS[part.slice(0, 2)];
    if (k) out[k] = part.slice(2);
  }
  return out;
}

function one(p) {
  const params = {};
  const items = [];
  for (const [k, v] of p) {
    if (k.startsWith('ep.')) params[k.slice(3)] = v;
    else if (k.startsWith('epn.')) params[k.slice(4)] = Number(v);
    else if (/^pr\d+$/.test(k)) items[Number(k.slice(2)) - 1] = item(v);
  }
  return {
    event: p.get('en'), tid: p.get('tid'), currency: p.get('cu') || undefined,
    page: p.get('dl') || '', referrer: p.get('dr') || '', consent: p.get('gcs') || '',
    params, items: items.filter(Boolean),
  };
}

export function decodeGa4(query, body = '') {
  const shared = new URLSearchParams(query);
  const lines = body.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [one(shared)];
  return lines.map((line) => {
    const p = new URLSearchParams(shared);
    for (const [k, v] of new URLSearchParams(line)) p.set(k, v);
    return one(p);
  });
}
