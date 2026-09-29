// The shop's own code, and the one place it talks to the dataLayer.
// Everything a site owes its tracking lives in push() below: read it with site/contract.json.
(function () {
  const CONTRACT_VERSION = '1.0.0';
  const CURRENCY = 'EUR';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: keep going */ } },
  };

  // Defect switches. ?defect=a,b turns them on in this browser, ?defect= turns them off.
  const q = new URLSearchParams(location.search);
  if (q.has('defect')) store.set('tb_defects', q.get('defect'));
  const defects = new Set((store.get('tb_defects') || '').split(',').filter(Boolean));
  const on = (id) => defects.has(id);

  const PRODUCTS = [
    { item_id: 'TB-TENT-2P', item_name: 'Two-person tent', item_brand: 'Testbed Outdoor', item_category: 'Tents', price: 189.0 },
    { item_id: 'TB-BAG-0C', item_name: 'Sleeping bag 0 °C', item_brand: 'Testbed Outdoor', item_category: 'Sleeping', price: 79.9 },
    { item_id: 'TB-PACK-40', item_name: 'Kuprinė 40 L', item_brand: 'Testbed Outdoor', item_category: 'Packs', price: 64.0 },
    { item_id: 'TB-LAMP', item_name: 'Head lamp', item_brand: 'Lumen & Co', item_category: 'Lights', price: 19.99 },
  ];
  const product = (id) => PRODUCTS.find((p) => p.item_id === id);
  const round2 = (n) => Math.round(n * 100) / 100;

  function toItem(p, quantity = 1, index = 0) {
    const it = { item_id: p.item_id, item_name: p.item_name, item_brand: p.item_brand, item_category: p.item_category, price: p.price, quantity, index };
    if (on('dl-price-string')) it.price = p.price.toFixed(2);
    if (on('dl-item-no-id')) delete it.item_id;
    return it;
  }
  const valueOf = (lines) => round2(lines.reduce((s, l) => s + product(l.id).price * l.qty, 0));

  // ---- dataLayer ----
  window.dataLayer = window.dataLayer || [];
  const listeners = [];
  const rawPush = window.dataLayer.push.bind(window.dataLayer);
  window.dataLayer.push = function (...msgs) {
    const r = rawPush(...msgs);
    for (const m of msgs) for (const f of listeners) { try { f(m); } catch (e) { console.error(e); } }
    return r;
  };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

  function push(event, fields = {}, { ecommerce = false } = {}) {
    const msg = { event, event_id: uid(), contract_version: CONTRACT_VERSION };
    if (on('dl-no-event-id')) delete msg.event_id;
    if (ecommerce) {
      if (!on('dl-ecommerce-not-cleared')) window.dataLayer.push({ ecommerce: null });
      msg.ecommerce = fields;
    } else Object.assign(msg, fields);
    window.dataLayer.push(msg);
  }

  // ---- cart and orders ----
  const cart = {
    lines() { try { return JSON.parse(store.get('tb_cart') || '[]'); } catch { return []; } },
    save(lines) { store.set('tb_cart', JSON.stringify(lines)); },
    add(id, qty = 1) {
      const lines = cart.lines();
      const l = lines.find((x) => x.id === id);
      if (l) l.qty += qty; else lines.push({ id, qty });
      cart.save(lines);
    },
    clear() { cart.save([]); },
    items() { return cart.lines().map((l, i) => toItem(product(l.id), l.qty, i)); },
    value() { return valueOf(cart.lines()); },
  };

  const orders = {
    create() {
      const lines = cart.lines();
      const order = { transaction_id: `TB-${Date.now().toString(36).toUpperCase()}`, lines, value: valueOf(lines) };
      store.set(`tb_order_${order.transaction_id}`, JSON.stringify(order));
      return order;
    },
    get(tx) { try { return JSON.parse(store.get(`tb_order_${tx}`) || 'null'); } catch { return null; } },
    reported(tx) { return (store.get('tb_reported') || '').split(',').includes(tx); },
    markReported(tx) { store.set('tb_reported', [store.get('tb_reported'), tx].filter(Boolean).join(',')); },
  };

  // ---- consent (a deliberately small banner; a real site uses a CMP) ----
  const consentListeners = [];
  const consent = {
    get() { return store.get('tb_consent'); },
    set(state) {
      store.set('tb_consent', state);
      const v = state === 'granted' ? 'granted' : 'denied';
      push('consent_update', { analytics_storage: v, ad_storage: v, ad_user_data: v, ad_personalization: v });
      for (const f of consentListeners) f(state);
      document.getElementById('tb-consent')?.remove();
    },
    onChange(f) { consentListeners.push(f); },
  };

  function banner() {
    if (consent.get()) return;
    const el = document.createElement('div');
    el.id = 'tb-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Cookie consent');
    el.innerHTML = '<p>This testbed uses cookies for analytics and ads, like a real shop would.</p>'
      + '<button id="tb-accept">Accept all</button> <button id="tb-reject">Reject all</button>';
    document.body.appendChild(el);
    el.querySelector('#tb-accept').onclick = () => consent.set('granted');
    el.querySelector('#tb-reject').onclick = () => consent.set('denied');
  }

  // ---- the dataLayer viewer, for learning: every push, as the tags receive it ----
  function viewer() {
    const box = document.createElement('details');
    box.id = 'tb-viewer';
    box.innerHTML = '<summary>dataLayer <span id="tb-count">0</span></summary><ol id="tb-log"></ol>';
    document.body.appendChild(box);
    const log = box.querySelector('#tb-log');
    const show = (m) => {
      const li = document.createElement('li');
      li.textContent = JSON.stringify(m, null, 1);
      log.appendChild(li);
      box.querySelector('#tb-count').textContent = String(log.children.length);
    };
    for (const m of window.dataLayer) show(m);
    listeners.push(show);
  }

  function header() {
    const h = document.createElement('header');
    const n = cart.lines().reduce((s, l) => s + l.qty, 0);
    h.innerHTML = '<strong><a href="index.html">Testbed Outdoor</a></strong>'
      + `<a href="cart.html">Cart (${n})</a><a href="contact.html">Contact</a>`
      + '<a href="contract.html">Contract</a><a href="defects.html">Defects</a>';
    document.body.prepend(h);
    if (defects.size) {
      const f = document.createElement('div');
      f.id = 'tb-defect-flag';
      f.textContent = `Defects on: ${[...defects].join(', ')}`;
      h.after(f);
    }
  }

  const fmt = (n) => `€${Number(n).toFixed(2)}`;

  window.TB = {
    config: window.TB_CONFIG || { mode: 'static', tags: false },
    on, push, cart, orders, consent, product, PRODUCTS, CURRENCY, fmt, toItem,
    onPush(f) { listeners.push(f); },
    // Pages call this once their own content is in place.
    ready() { header(); banner(); viewer(); },
    defects: () => [...defects],
    gateway() { const c = window.TB.config; return c.pay ? `${c.pay}/` : new URL('pay/', location.href).href; },
    shop(path) { const c = window.TB.config; return c.shop ? `${c.shop}/${path}` : new URL(path, location.href).href; },
  };
})();
