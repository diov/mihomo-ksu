import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countChanges } from '../webui/changes.js';

const saved = {
  'proxy-providers': { airport: { url: 'https://a.example/sub' }, backup: { url: 'https://b.example/sub' } },
  'prepend-rules': ['DOMAIN,a.com,DIRECT', 'DOMAIN,b.com,Proxy'],
  dns: { nameserver: ['https://1.1.1.1/dns-query'] },
};
const copy = () => structuredClone(saved);

test('nothing changed counts zero, whatever the key order', () => {
  const reordered = { dns: copy().dns, 'prepend-rules': copy()['prepend-rules'], 'proxy-providers': copy()['proxy-providers'] };
  assert.equal(countChanges(saved, reordered), 0);
});

test('each added, removed or edited subscription counts once', () => {
  const draft = copy();
  draft['proxy-providers'].new = { url: 'https://c.example/sub' };
  delete draft['proxy-providers'].backup;
  draft['proxy-providers'].airport.interval = 3600;
  assert.equal(countChanges(saved, draft), 3);
});

test('each added or removed rule counts once', () => {
  const draft = copy();
  draft['prepend-rules'] = ['DOMAIN,b.com,Proxy', 'DOMAIN,c.com,DIRECT', 'DOMAIN,d.com,DIRECT'];
  draft['append-rules'] = ['DOMAIN,e.com,DIRECT'];
  assert.equal(countChanges(saved, draft), 4);
});

test('reordering rules counts once', () => {
  const draft = copy();
  draft['prepend-rules'].reverse();
  assert.equal(countChanges(saved, draft), 1);
});

test('any other changed top-level key counts once', () => {
  const draft = copy();
  draft.dns.nameserver.push('https://8.8.8.8/dns-query');
  draft.mode = 'global';
  assert.equal(countChanges(saved, draft), 2);
});

test('an empty override on either side compares as no keys', () => {
  assert.equal(countChanges(null, null), 0);
  assert.equal(countChanges(undefined, { 'proxy-providers': { a: { url: 'u' } } }), 1);
  assert.equal(countChanges(saved, null), 5);
});
