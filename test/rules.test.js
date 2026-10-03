import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedRules, formatRule, listRules, parseRule, policyOptions, removeRule, saveRule, validateRule } from '../webui/rules.js';

const override = () => ({
  'proxy-providers': { airport: { url: 'https://a.example' } },
  'prepend-rules': ['DOMAIN-SUFFIX,example.com,DIRECT', 'AND,((DOMAIN,a.com),(NETWORK,UDP)),REJECT'],
  'append-rules': ['IP-CIDR,203.0.113.0/24,Proxy,no-resolve'],
});

test('the common rule types round-trip through the form', () => {
  for (const rule of ['DOMAIN,www.example.com,DIRECT', 'GEOSITE,youtube,YouTube', 'IP-CIDR6,2001:db8::/32,Proxy,no-resolve', 'DST-PORT,8000-9000,DIRECT', 'PROCESS-NAME,com.example.app,Proxy']) {
    assert.equal(formatRule(parseRule(rule)), rule);
  }
  assert.deepEqual(parseRule(' GEOIP , CN , DIRECT , no-resolve '), { type: 'GEOIP', value: 'CN', policy: 'DIRECT', noResolve: true });
});

test('rules the form cannot express are left as they are', () => {
  assert.equal(parseRule('AND,((DOMAIN,a.com),(NETWORK,UDP)),REJECT'), null);
  assert.equal(parseRule('RULE-SET,custom,DIRECT'), null);
  assert.equal(parseRule('DOMAIN,a.com,DIRECT,no-resolve'), null);
  assert.equal(parseRule('IP-CIDR,1.1.1.1/32,DIRECT,no-resolve,extra'), null);
  assert.equal(parseRule('MATCH,Final'), null);
  assert.equal(parseRule({ type: 'DOMAIN' }), null);
});

test('no-resolve is only written for IP rules', () => {
  assert.equal(formatRule({ type: 'DOMAIN', value: 'a.com', policy: 'DIRECT', noResolve: true }), 'DOMAIN,a.com,DIRECT');
  assert.equal(formatRule({ type: 'GEOIP', value: 'CN', policy: 'DIRECT', noResolve: true }), 'GEOIP,CN,DIRECT,no-resolve');
});

test('both lists are listed, with unparsable rules marked', () => {
  const { prepend, append } = listRules(override());
  assert.deepEqual(prepend.map((r) => r.parsed?.type ?? null), ['DOMAIN-SUFFIX', null]);
  assert.equal(append[0].parsed.noResolve, true);
  assert.deepEqual(listRules(null), { prepend: [], append: [] });
  assert.equal(listRules({ 'prepend-rules': 'DOMAIN,a.com,DIRECT' }), null);
});

test('a new rule goes to the end of its list', () => {
  const out = saveRule(override(), null, 'prepend', { type: 'DOMAIN', value: 'b.com', policy: 'Proxy', noResolve: false });
  assert.deepEqual(out['prepend-rules'], ['DOMAIN-SUFFIX,example.com,DIRECT', 'AND,((DOMAIN,a.com),(NETWORK,UDP)),REJECT', 'DOMAIN,b.com,Proxy']);
  const first = saveRule(null, null, 'append', { type: 'GEOSITE', value: 'cn', policy: 'DIRECT', noResolve: false });
  assert.deepEqual(first, { 'append-rules': ['GEOSITE,cn,DIRECT'] });
});

test('editing in place keeps the position and leaves other rules untouched', () => {
  const out = saveRule(override(), { position: 'prepend', index: 0 }, 'prepend', { type: 'DOMAIN-SUFFIX', value: 'example.org', policy: 'HK', noResolve: false });
  assert.deepEqual(out['prepend-rules'], ['DOMAIN-SUFFIX,example.org,HK', 'AND,((DOMAIN,a.com),(NETWORK,UDP)),REJECT']);
  assert.deepEqual(out['append-rules'], override()['append-rules']);
  assert.deepEqual(out['proxy-providers'], override()['proxy-providers']);
});

test('moving a rule to the other list puts it at the end and drops an emptied list', () => {
  const out = saveRule(override(), { position: 'append', index: 0 }, 'prepend', { type: 'IP-CIDR', value: '203.0.113.0/24', policy: 'Proxy', noResolve: true });
  assert.equal(out['prepend-rules'].at(-1), 'IP-CIDR,203.0.113.0/24,Proxy,no-resolve');
  assert.equal('append-rules' in out, false);
});

test('removing drops the rule, and the key once the list is empty', () => {
  const one = removeRule(override(), 'prepend', 0);
  assert.deepEqual(one['prepend-rules'], ['AND,((DOMAIN,a.com),(NETWORK,UDP)),REJECT']);
  assert.equal('prepend-rules' in removeRule(one, 'prepend', 0), false);
});

test('edits never change the override they were given', () => {
  const o = override();
  saveRule(o, { position: 'prepend', index: 0 }, 'append', { type: 'DOMAIN', value: 'x.com', policy: 'DIRECT', noResolve: false });
  removeRule(o, 'append', 0);
  assert.deepEqual(o, override());
});

test('the match value must be present and free of commas', () => {
  assert.deepEqual(validateRule({ value: 'example.com' }), {});
  assert.deepEqual(validateRule({ value: '' }), { value: 'value-required' });
  assert.deepEqual(validateRule({ value: 'a.com,b.com' }), { value: 'value-comma' });
});

test('rules missing from the saved lists are marked unsaved', () => {
  const saved = override();
  const draft = saveRule(saved, { position: 'prepend', index: 0 }, 'prepend', { type: 'DOMAIN', value: 'new.com', policy: 'DIRECT', noResolve: false });
  const changed = changedRules(saved, draft);
  assert.deepEqual([...changed.prepend], [0]);
  assert.deepEqual([...changed.append], []);
});

test('a duplicated rule counts as unsaved for the extra copy', () => {
  const saved = { 'append-rules': ['DOMAIN,a.com,DIRECT'] };
  const draft = { 'append-rules': ['DOMAIN,a.com,DIRECT', 'DOMAIN,a.com,DIRECT'] };
  assert.deepEqual([...changedRules(saved, draft).append], [1]);
});

test('policies are the proxy group names followed by DIRECT and REJECT', () => {
  assert.deepEqual(policyOptions({ 'proxy-groups': [{ name: 'Proxy' }, { name: 'HK' }, { name: 'DIRECT' }] }), ['Proxy', 'HK', 'DIRECT', 'REJECT']);
  assert.deepEqual(policyOptions(null), ['DIRECT', 'REJECT']);
});
