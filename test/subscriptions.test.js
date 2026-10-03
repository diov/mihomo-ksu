import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changedSubscriptions,
  displayUrl,
  listSubscriptions,
  removeSubscription,
  saveSubscription,
  validateSubscription,
} from '../webui/subscriptions.js';

const override = () => ({
  'proxy-providers': {
    airport: { url: 'https://a.example/sub?token=1', 'health-check': { url: 'https://cp.cloudflare.com' } },
    backup: { url: 'https://b.example/sub', interval: 3600 },
  },
  'prepend-rules': ['DOMAIN,a.com,DIRECT'],
});

test('subscriptions are listed in file order with url and interval', () => {
  assert.deepEqual(listSubscriptions(override()), [
    { name: 'airport', url: 'https://a.example/sub?token=1', interval: undefined },
    { name: 'backup', url: 'https://b.example/sub', interval: 3600 },
  ]);
  assert.deepEqual(listSubscriptions(null), []);
  assert.deepEqual(listSubscriptions({ mode: 'rule' }), []);
});

test('proxy-providers that is not a map cannot be edited by the form', () => {
  assert.equal(listSubscriptions({ 'proxy-providers': ['https://a.example'] }), null);
});

test('adding appends the subscription and leaves the rest of the override alone', () => {
  const out = saveSubscription(override(), null, { name: 'new', url: 'https://c.example/sub', interval: null });
  assert.deepEqual(Object.keys(out['proxy-providers']), ['airport', 'backup', 'new']);
  assert.deepEqual(out['proxy-providers'].new, { url: 'https://c.example/sub' });
  assert.deepEqual(out['prepend-rules'], ['DOMAIN,a.com,DIRECT']);
});

test('adding the first subscription creates proxy-providers', () => {
  const out = saveSubscription(null, null, { name: 'only', url: 'https://c.example/sub', interval: 43200 });
  assert.deepEqual(out, { 'proxy-providers': { only: { url: 'https://c.example/sub', interval: 43200 } } });
});

test('editing keeps hand-written fields and the template default drops interval', () => {
  const a = saveSubscription(override(), 'airport', { name: 'airport', url: 'https://a.example/new', interval: 86400 });
  assert.deepEqual(a['proxy-providers'].airport, {
    url: 'https://a.example/new',
    'health-check': { url: 'https://cp.cloudflare.com' },
    interval: 86400,
  });
  const b = saveSubscription(override(), 'backup', { name: 'backup', url: 'https://b.example/sub', interval: null });
  assert.deepEqual(b['proxy-providers'].backup, { url: 'https://b.example/sub' });
});

test('renaming keeps the subscription in its place', () => {
  const out = saveSubscription(override(), 'airport', { name: '机场', url: 'https://a.example/sub?token=1', interval: null });
  assert.deepEqual(Object.keys(out['proxy-providers']), ['机场', 'backup']);
  assert.equal(out['proxy-providers']['机场']['health-check'].url, 'https://cp.cloudflare.com');
});

test('removing the last subscription removes proxy-providers', () => {
  const one = removeSubscription(override(), 'airport');
  assert.deepEqual(Object.keys(one['proxy-providers']), ['backup']);
  const none = removeSubscription(one, 'backup');
  assert.equal('proxy-providers' in none, false);
  assert.deepEqual(none['prepend-rules'], ['DOMAIN,a.com,DIRECT']);
});

test('edits never change the override they were given', () => {
  const o = override();
  saveSubscription(o, 'airport', { name: 'renamed', url: 'https://x.example', interval: 60 });
  removeSubscription(o, 'backup');
  assert.deepEqual(o, override());
});

test('names must be present, free of "/" and unique; urls must be http(s)', () => {
  const o = override();
  assert.deepEqual(validateSubscription(o, null, { name: 'new', url: 'https://c.example/sub' }), {});
  assert.deepEqual(validateSubscription(o, null, { name: '', url: 'https://c.example' }), { name: 'name-required' });
  assert.deepEqual(validateSubscription(o, null, { name: 'a/b', url: 'https://c.example' }), { name: 'name-slash' });
  assert.deepEqual(validateSubscription(o, null, { name: 'backup', url: 'https://c.example' }), { name: 'name-taken' });
  assert.deepEqual(validateSubscription(o, 'backup', { name: 'backup', url: 'https://c.example' }), {});
  assert.deepEqual(validateSubscription(o, null, { name: 'new', url: 'ftp://c.example' }), { url: 'url-invalid' });
  assert.deepEqual(validateSubscription(o, null, { name: 'new', url: '' }), { url: 'url-invalid' });
});

test('subscriptions that differ from the saved override are marked', () => {
  const saved = override();
  const draft = saveSubscription(saved, 'backup', { name: 'backup', url: 'https://b.example/other', interval: 3600 });
  const withNew = saveSubscription(draft, null, { name: 'new', url: 'https://c.example', interval: null });
  assert.deepEqual([...changedSubscriptions(saved, withNew)].sort(), ['backup', 'new']);
  assert.deepEqual([...changedSubscriptions(saved, saved)], []);
});

test('the displayed url hides the query string', () => {
  assert.equal(displayUrl('https://sub.example.com/api/v1/client/subscribe?token=secret'), 'sub.example.com/api/v1/client/subscribe?…');
  assert.equal(displayUrl('https://b.example/'), 'b.example');
  assert.equal(displayUrl('not a url'), 'not a url');
});
