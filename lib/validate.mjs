// The reference checker: given every dataLayer push and every GA4 hit from a walk,
// return what is wrong. It is deliberately small and plain so it can be read as a
// specification. Rule ids are stable, so other tools can map their checks to them.
import contract from '../site/contract.json' with { type: 'json' };

export const RULES = {
  'dl.unknown_event': { owner: 'site', title: 'An event the contract does not list' },
  'dl.no_event_id': { owner: 'site', title: 'Push without event_id' },
  'dl.contract_version': { owner: 'site', title: 'contract_version missing or not the current version' },
  'dl.missing_field': { owner: 'site', title: 'A field the contract requires for this event is missing' },
  'dl.purchase_no_txid': { owner: 'site', title: 'purchase without transaction_id' },
  'dl.item_no_id': { owner: 'site', title: 'Item without item_id' },
  'dl.price_not_number': { owner: 'site', title: 'Item price is not a number' },
  'dl.quantity_not_number': { owner: 'site', title: 'Item quantity is not a number' },
  'dl.ecommerce_not_cleared': { owner: 'site', title: 'Ecommerce push without { ecommerce: null } right before it' },
  'dl.purchase_duplicate': { owner: 'site', title: 'The same transaction_id was pushed as a purchase twice' },
  'ga4.purchase_no_txid': { owner: 'tags', title: 'GA4 purchase without transaction_id' },
  'ga4.purchase_duplicate': { owner: 'tags', title: 'GA4 received the same purchase twice' },
  'ga4.value_no_currency': { owner: 'tags', title: 'GA4 event with value but no currency' },
  'ga4.event_name_case': { owner: 'tags', title: 'GA4 event name is not lower snake_case' },
  'ga4.item_no_id': { owner: 'tags', title: 'GA4 item with neither id nor name' },
  'tags.not_first_party': { owner: 'tags', title: 'A GA4 hit bypassed the first-party collector' },
  'consent.default_granted': { owner: 'tags', title: 'A hit before the visitor chose was sent with consent granted' },
  'pii.email_in_hit': { owner: 'site', title: 'An email address was sent to an analytics tool' },
  'journey.dl_missing': { owner: 'site', title: 'An expected dataLayer event never happened' },
  'journey.ga4_missing': { owner: 'tags', title: 'An expected GA4 event never reached the first-party collector' },
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const SNAKE = /^[a-z][a-z0-9_]*$/;

export function validate({ pushes = [], hits = [], expect = {} }) {
  const out = [];
  const add = (rule, detail, where = '') => out.push({ rule, owner: RULES[rule].owner, title: RULES[rule].title, detail, where });

  // ---- dataLayer: the site's obligation ----
  const purchases = new Map();
  // `load` identifies one page load when the capture provides it, so a reload is a new page.
  const loadOf = (p) => p.load ?? p.page;
  pushes.forEach(({ page, data, load }, i) => {
    if (!data || typeof data !== 'object' || !data.event) return;
    const spec = contract.events[data.event];
    if (!spec) return add('dl.unknown_event', data.event, page);
    if (!data.event_id) add('dl.no_event_id', data.event, page);
    if (data.contract_version !== contract.version) add('dl.contract_version', `${data.event}: ${data.contract_version}`, page);
    const body = spec.ecommerce ? data.ecommerce || {} : data;
    if (spec.ecommerce) {
      const prev = pushes[i - 1];
      if (!prev || loadOf(prev) !== (load ?? page) || !prev.data || prev.data.ecommerce !== null) add('dl.ecommerce_not_cleared', data.event, page);
    }
    for (const f of spec.fields) {
      if (body[f] !== undefined) continue;
      add(data.event === 'purchase' && f === 'transaction_id' ? 'dl.purchase_no_txid' : 'dl.missing_field', `${data.event}.${f}`, page);
    }
    for (const it of body.items || []) {
      if (!it.item_id) add('dl.item_no_id', `${data.event}: ${it.item_name ?? '?'}`, page);
      if (typeof it.price !== 'number') add('dl.price_not_number', `${data.event}: ${JSON.stringify(it.price)}`, page);
      if (typeof it.quantity !== 'number') add('dl.quantity_not_number', `${data.event}: ${JSON.stringify(it.quantity)}`, page);
    }
    if (spec.oncePer && body[spec.oncePer] !== undefined) {
      const key = body[spec.oncePer];
      if (purchases.has(key)) add('dl.purchase_duplicate', key, page);
      purchases.set(key, page);
    }
  });

  // ---- GA4 hits: what the tags actually sent ----
  const ga4Purchases = new Set();
  for (const h of hits) {
    const where = h.page;
    if (h.firstParty === false) add('tags.not_first_party', `${h.event} via ${h.host}`, where);
    if (h.event && !SNAKE.test(h.event)) add('ga4.event_name_case', h.event, where);
    if (h.params.value !== undefined && !h.currency) add('ga4.value_no_currency', h.event, where);
    for (const it of h.items) if (!it.item_id && !it.item_name) add('ga4.item_no_id', h.event, where);
    if (h.event === 'purchase') {
      const tx = h.params.transaction_id;
      if (!tx) add('ga4.purchase_no_txid', 'purchase', where);
      else if (ga4Purchases.has(tx)) add('ga4.purchase_duplicate', tx, where);
      else ga4Purchases.add(tx);
    }
    if (h.phase === 'pre-consent' && h.consent !== 'G100') add('consent.default_granted', `${h.event} gcs=${h.consent || '(none)'}`, where);
    const texts = [h.page, h.referrer, ...Object.values(h.params)].map((v) => { try { return decodeURIComponent(String(v)); } catch { return String(v); } });
    if (texts.some((t) => EMAIL.test(t))) add('pii.email_in_hit', h.event, where);
  }

  // ---- the journey: things that must have happened at all ----
  const dlSeen = new Set(pushes.map((p) => p.data?.event).filter(Boolean));
  for (const e of expect.dataLayer || []) if (!dlSeen.has(e)) add('journey.dl_missing', e);
  // Received, not merely sent: a hit that went around the collector does not count.
  const hitSeen = new Set(hits.filter((h) => h.firstParty !== false).map((h) => h.event));
  for (const e of expect.ga4 || []) if (!hitSeen.has(e)) add('journey.ga4_missing', e);

  return out;
}

// The set of rule ids that fired, for comparing against a defect's expectation.
export const ruleSet = (findings) => [...new Set(findings.map((f) => f.rule))].sort();
