import { expect, test } from 'bun:test';
import { decodeGa4 } from '../lib/ga4.mjs';

test('GET hit: one event, params and items decoded', () => {
  const [e] = decodeGa4('v=2&tid=G-X&en=purchase&cu=EUR&ep.transaction_id=T1&epn.value=19.99&pr1=idA~nmLamp~pr19.99~qt1&gcs=G111');
  expect(e.event).toBe('purchase');
  expect(e.currency).toBe('EUR');
  expect(e.params).toEqual({ transaction_id: 'T1', value: 19.99 });
  expect(e.items).toEqual([{ item_id: 'A', item_name: 'Lamp', price: '19.99', quantity: '1' }]);
  expect(e.consent).toBe('G111');
});

test('POST batch: each body line is an event over the shared query', () => {
  const events = decodeGa4('v=2&tid=G-X&dl=https%3A%2F%2Fshop%2F', 'en=page_view\nen=view_item&ep.event_id=abc');
  expect(events.map((e) => e.event)).toEqual(['page_view', 'view_item']);
  expect(events[1].params.event_id).toBe('abc');
  expect(events.every((e) => e.page === 'https://shop/')).toBe(true);
});
