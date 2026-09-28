require('./support');
const test = require('node:test');
const assert = require('node:assert/strict');
const { dedupeFacts, knownTags, splitCitations, mayUseMemory, daysBetween } = require('../server/voice-agent')._test;

test('voice-agent: dedupeFacts drops near-duplicates, including against already-kept facts', () => {
  const facts = [
    { text: 'Anita takes the 7:10 bus from Kukatpally every morning | When: 2026-01-02' },
    { text: 'Every morning Anita takes the 7:10 bus from Kukatpally' },
    { text: 'The Verma household prefers a message before any delay' },
    { text: '' },
  ];
  const kept = dedupeFacts(facts);
  assert.equal(kept.length, 2);
  assert.equal(kept[1].text, facts[2].text);
  assert.equal(dedupeFacts(facts.slice(2, 3), [facts[2]]).length, 0);
});

test('voice-agent: splitCitations strips [mN] tags and knownTags keeps only real ones', () => {
  const r = splitCitations('Last time you said the bus was late [m2]. Is that still true? [m2] [m9]');
  assert.equal(r.text, 'Last time you said the bus was late. Is that still true?');
  assert.deepEqual(r.cited, ['m2', 'm9']);
  assert.deepEqual(knownTags(r.cited, [{ tag: 'm1' }, { tag: 'm2' }]), ['m2']);
  assert.deepEqual(splitCitations(undefined), { text: '', cited: [] });
});

test('voice-agent: mayUseMemory needs a distinctive shared word; daysBetween never goes negative', () => {
  const facts = [{ text: 'Heavy traffic near Kukatpally delays the morning bus' }];
  assert.equal(mayUseMemory('Is the traffic still bad on your route?', facts, 'Anita Verma'), true);
  assert.equal(mayUseMemory('Thank you for your time today, Anita.', facts, 'Anita Verma'), false);
  assert.equal(mayUseMemory('', facts, 'Anita Verma'), false);
  assert.equal(daysBetween('2026-03-01T00:00:00Z', '2026-03-15T00:00:00Z'), 14);
  assert.equal(daysBetween('2026-03-15T00:00:00Z', '2026-03-01T00:00:00Z'), 0);
});
