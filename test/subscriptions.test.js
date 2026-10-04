import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changedSubscriptions,
  countNodes,
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
    { name: 'airport', source: 'url', url: 'https://a.example/sub?token=1', interval: undefined },
    { name: 'backup', source: 'url', url: 'https://b.example/sub', interval: 3600 },
  ]);
  assert.deepEqual(listSubscriptions(null), []);
  assert.deepEqual(listSubscriptions({ mode: 'rule' }), []);
});

test('proxy-providers that is not a map cannot be edited by the form', () => {
  assert.equal(listSubscriptions({ 'proxy-providers': ['https://a.example'] }), null);
});

test('adding appends the subscription and leaves the rest of the override alone', () => {
  const out = saveSubscription(override(), null, { source: 'url', name: 'new', url: 'https://c.example/sub', interval: null });
  assert.deepEqual(Object.keys(out['proxy-providers']), ['airport', 'backup', 'new']);
  assert.deepEqual(out['proxy-providers'].new, { url: 'https://c.example/sub' });
  assert.deepEqual(out['prepend-rules'], ['DOMAIN,a.com,DIRECT']);
});

test('adding the first subscription creates proxy-providers', () => {
  const out = saveSubscription(null, null, { source: 'url', name: 'only', url: 'https://c.example/sub', interval: 43200 });
  assert.deepEqual(out, { 'proxy-providers': { only: { url: 'https://c.example/sub', interval: 43200 } } });
});

test('editing keeps hand-written fields and the template default drops interval', () => {
  const a = saveSubscription(override(), 'airport', { source: 'url', name: 'airport', url: 'https://a.example/new', interval: 86400 });
  assert.deepEqual(a['proxy-providers'].airport, {
    url: 'https://a.example/new',
    'health-check': { url: 'https://cp.cloudflare.com' },
    interval: 86400,
  });
  const b = saveSubscription(override(), 'backup', { source: 'url', name: 'backup', url: 'https://b.example/sub', interval: null });
  assert.deepEqual(b['proxy-providers'].backup, { url: 'https://b.example/sub' });
});

test('renaming keeps the subscription in its place', () => {
  const out = saveSubscription(override(), 'airport', { source: 'url', name: '机场', url: 'https://a.example/sub?token=1', interval: null });
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
  saveSubscription(o, 'airport', { source: 'url', name: 'renamed', url: 'https://x.example', interval: 60 });
  removeSubscription(o, 'backup');
  assert.deepEqual(o, override());
});

test('names must be present, free of "/" and unique; urls must be http(s)', () => {
  const o = override();
  assert.deepEqual(validateSubscription(o, null, { source: 'url', name: 'new', url: 'https://c.example/sub' }), {});
  assert.deepEqual(validateSubscription(o, null, { source: 'url', name: '', url: 'https://c.example' }), { name: 'name-required' });
  assert.deepEqual(validateSubscription(o, null, { source: 'url', name: 'a/b', url: 'https://c.example' }), { name: 'name-slash' });
  assert.deepEqual(validateSubscription(o, null, { source: 'url', name: 'backup', url: 'https://c.example' }), { name: 'name-taken' });
  assert.deepEqual(validateSubscription(o, 'backup', { source: 'url', name: 'backup', url: 'https://c.example' }), {});
  assert.deepEqual(validateSubscription(o, null, { source: 'url', name: 'new', url: 'ftp://c.example' }), { url: 'url-invalid' });
  assert.deepEqual(validateSubscription(o, null, { source: 'url', name: 'new', url: '' }), { url: 'url-invalid' });
});

test('subscriptions that differ from the saved override are marked', () => {
  const saved = override();
  const draft = saveSubscription(saved, 'backup', { source: 'url', name: 'backup', url: 'https://b.example/other', interval: 3600 });
  const withNew = saveSubscription(draft, null, { source: 'url', name: 'new', url: 'https://c.example', interval: null });
  assert.deepEqual([...changedSubscriptions(saved, withNew)].sort(), ['backup', 'new']);
  assert.deepEqual([...changedSubscriptions(saved, saved)], []);
});

test('the displayed url hides the query string', () => {
  assert.equal(displayUrl('https://sub.example.com/api/v1/client/subscribe?token=secret'), 'sub.example.com/api/v1/client/subscribe?…');
  assert.equal(displayUrl('https://b.example/'), 'b.example');
  assert.equal(displayUrl('not a url'), 'not a url');
});

test('a file subscription is listed with its source', () => {
  const o = { 'proxy-providers': { local: { type: 'file', 'health-check': { enable: false } } } };
  assert.deepEqual(listSubscriptions(o), [{ name: 'local', source: 'file', url: undefined, interval: undefined }]);
});

test('switching to a file drops url and interval but keeps hand-written fields', () => {
  const out = saveSubscription(override(), 'airport', { source: 'file', name: 'airport', url: 'ignored', interval: 3600 });
  assert.deepEqual(out['proxy-providers'].airport, { 'health-check': { url: 'https://cp.cloudflare.com' }, type: 'file' });
  const added = saveSubscription(null, null, { source: 'file', name: 'local', url: '', interval: null });
  assert.deepEqual(added, { 'proxy-providers': { local: { type: 'file' } } });
});

test('switching back to a link drops the file type', () => {
  const file = { 'proxy-providers': { local: { type: 'file', path: './mine.yaml' } } };
  const out = saveSubscription(file, 'local', { source: 'url', name: 'local', url: 'https://c.example/sub', interval: null });
  assert.deepEqual(out['proxy-providers'].local, { path: './mine.yaml', url: 'https://c.example/sub' });
});

test('a file subscription needs its file but no url', () => {
  const o = override();
  assert.deepEqual(validateSubscription(o, null, { source: 'file', name: 'local', url: '', hasFile: true }), {});
  assert.deepEqual(validateSubscription(o, null, { source: 'file', name: 'local', url: '', hasFile: false }), { file: 'file-required' });
});

test('nodes are counted from a Clash config, plain links or base64 links', () => {
  assert.equal(countNodes({ proxies: [{ name: 'a' }, { name: 'b' }], rules: ['MATCH,DIRECT'] }, 'unused'), 2);
  const links = 'trojan://pw@a.example:443#A\nvmess://eyJ2IjoyfQ==\n\nnot a link\n';
  assert.equal(countNodes(undefined, links), 2);
  assert.equal(countNodes('opaque', btoa(links)), 2);
  assert.equal(countNodes('opaque', btoa(links).replaceAll('+', '-').replaceAll('/', '_')), 2);
  assert.equal(countNodes({ mode: 'rule' }, 'mode: rule\n'), 0);
  assert.equal(countNodes(undefined, '%%% not base64'), 0);
});
