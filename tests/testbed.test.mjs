// The testbed's promise, as tests: the exemplar is fully green, and every defect
// switch turns exactly its own rules red and nothing else.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { start } from '../server.mjs';
import { ruleSet, validate } from '../lib/validate.mjs';
import { JOURNEY, walk } from './walk.mjs';
import defects from '../site/defects.json' with { type: 'json' };

let tb;
beforeAll(() => { tb = start(0); });
afterAll(() => tb.stop());

const check = (run) => validate({ ...run, expect: JOURNEY });
const describe = (findings) => findings.map((f) => `${f.rule} (${f.detail})`).join('\n');

test('exemplar: the whole journey is green', async () => {
  const run = await walk({ shop: tb.shop });
  expect(run.errors).toEqual([]);
  const findings = check(run);
  if (findings.length) console.log(describe(findings));
  expect(ruleSet(findings)).toEqual([]);
  // Green must not be vacuous: the collector received the purchase, first party.
  expect(run.hits.some((h) => h.event === 'purchase' && h.firstParty)).toBe(true);
}, 90000);

for (const d of defects) {
  test(`defect ${d.id} turns exactly ${d.expect.join(', ')} red`, async () => {
    const run = await walk({ shop: tb.shop, defects: [d.id] });
    expect(run.errors).toEqual([]);
    const findings = check(run);
    expect(ruleSet(findings)).toEqual([...d.expect].sort());
  }, 90000);
}
