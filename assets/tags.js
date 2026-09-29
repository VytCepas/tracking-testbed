// This file plays the part Google Tag Manager plays on a real site: it listens to the
// dataLayer and sends GA4 events with gtag.js. Every mapping is here in plain sight,
// so you can compare what the site pushed with what the tag sent.
// It only runs when the testbed server is serving the page. On static hosting
// nothing leaves the page, so a public visit cannot reach any analytics account.
(function () {
  const TB = window.TB;
  const C = TB.config;
  if (!C.tags) return;
  const on = TB.on;

  // gtag.js gets its own queue (the `l=` parameter), separate from the site's dataLayer.
  window.tbTagQueue = window.tbTagQueue || [];
  function gtag() { window.tbTagQueue.push(arguments); }

  const state = (choice) => {
    const v = choice === 'granted' ? 'granted' : 'denied';
    return { ad_storage: v, analytics_storage: v, ad_user_data: v, ad_personalization: v };
  };
  // Consent default comes first, before any hit can be sent.
  gtag('consent', 'default', { ...state(on('consent-default-granted') ? 'granted' : 'denied'), wait_for_update: 500 });
  if (TB.consent.get()) gtag('consent', 'update', state(TB.consent.get()));
  TB.consent.onChange((choice) => gtag('consent', 'update', state(choice)));

  gtag('js', new Date());
  const config = { send_page_view: true };
  // server_container_url sends every hit to our first-party collector, which is what
  // server-side GTM does in production.
  if (!on('tag-direct-to-google')) config.server_container_url = C.collector;
  gtag('config', C.ga4, config);

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${C.ga4}&l=tbTagQueue`;
  document.head.appendChild(s);

  // Which dataLayer events become GA4 events. consent_update is for the tags, not for GA4.
  const SEND = ['view_item_list', 'view_item', 'add_to_cart', 'view_cart', 'begin_checkout', 'add_payment_info', 'purchase', 'generate_lead'];

  TB.onPush((msg) => {
    if (!msg || typeof msg !== 'object' || !SEND.includes(msg.event)) return;
    const params = { ...(msg.ecommerce || {}) };
    for (const [k, v] of Object.entries(msg)) if (!['event', 'ecommerce', 'contract_version'].includes(k)) params[k] = v;
    let name = msg.event;
    if (on('tag-event-name-case') && name === 'add_to_cart') name = 'addToCart';
    if (on('tag-value-no-currency')) delete params.currency;
    gtag('event', name, params);
  });
})();
