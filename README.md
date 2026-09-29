# Tracking testbed

A small practice shop for learning web tracking, and for testing the tools that check it.

It has two faces:

- **The exemplar.** With no switches on, the shop implements a dataLayer contract correctly: every event, every field, consent before any hit, each order reported once. Use it to see what good looks like.
- **The gym.** Each **defect switch** breaks the tracking in exactly one known way: a missing `transaction_id`, a purchase reported twice on reload, an email address leaking into GA4, a tag that bypasses server-side collection, and more. Turn one on and check whether you, or your tool, notice.

The tests prove both faces. The exemplar walk is fully green, and each switch turns **exactly** its own rules red and nothing else.

## Try it

```sh
bun install
bun start                 # http://shop.localhost/ (port 80; see "Ports" below)
```

Open the shop and click through a purchase. The **dataLayer** box in the corner shows every push as the tags receive it. Then:

| Page | What it shows |
|---|---|
| `contract.html` | The dataLayer contract, rendered from [`site/contract.json`](site/contract.json), the same file the checker reads |
| `defects.html` | The switchboard: every defect, what it breaks, and why it matters, rendered from [`site/defects.json`](site/defects.json) |

A switch can also be set in the URL: `index.html?defect=dl-purchase-on-reload`. `?defect=` turns all switches off.

## How it is built

| Part | Plays the role of |
|---|---|
| `site/assets/tb.js` | The website. Everything the site owes its tracking is in its `push()`. |
| `site/assets/tags.js` | Google Tag Manager. It listens to the dataLayer and sends GA4 events with the real gtag.js, so every mapping from push to hit is visible in one file. |
| `server.mjs` → `/g/collect` | Server-side GTM. It receives every GA4 hit first-party, records it, and forwards nothing. |
| `pay.localhost` | A payment gateway on a different site, so checkout leaves the shop and comes back, like a real one. |
| `lib/validate.mjs` | A reference checker: every dataLayer push and every hit in, a list of findings out. Each finding names its owner: the **site** (the dataLayer) or the **tags**. |

## Tests

```sh
bun test
```

`tests/walk.mjs` buys a product like a person would, in Chromium, and **fences** the walk. Only the testbed's own hosts and the gtag.js library can be reached. Any other request is answered locally, and DNS resolves nothing else. So even a broken tag cannot send a real hit anywhere.

The tests prove three things:

- The exemplar produces no findings, and the purchase really reached the collector. A green result cannot come from nothing being sent.
- Each defect produces exactly the rules it declares in `defects.json`.
- On static hosting, a full purchase sends **no request off the site** (`tests/static.test.mjs`).

## Using it to test a tool

Point any tag debugger, a browser extension, a crawler or a CI check at the running shop. Switch on one defect at a time. A tool that stays quiet on a switch has a blind spot, and the switch's rule ids tell you which. Rule ids are stable, so a tool can map its own checks to them.

## Safety

- **On static hosting** (the public GitHub Pages copy), `tags.js` does nothing: no library is loaded and no hit is sent. A test holds that promise.
- **Locally**, hits go only to the testbed's own collector. The measurement ID `G-TESTBED01` belongs to no account.

## Things this taught us

- **gtag.js drops a non-default port from `server_container_url`.** With the collector on `:8080`, hits went to port 80 and were refused. That is why `bun start` uses port 80 (macOS allows it without root; elsewhere set `PORT=80` with the rights to bind it). The test walk routes those hits to the collector. Observed 2026-09-29, not documented by Google as far as we know.
- **gtag sends with credentials.** A fake endpoint that answers `Access-Control-Allow-Origin: *` fails the request, and gtag then stops sending for the rest of the page. Answer with the request's origin and `Access-Control-Allow-Credentials: true`.
- **Browser routing never sees `sendBeacon`.** The walk watches hits through the DevTools protocol, which sees every transport, and relies on DNS to stop them.

## Roadmap

Next, in rough order:
- a single-page section
- iframes and shadow DOM
- a second consent tool
- cross-domain checkout with the `_gl` linker
- a Meta and TikTok layer with server-side `event_id` matching
- more defects

## Licence

MIT
