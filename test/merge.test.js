import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge, MergeError } from '../webui/merge.js';

// A trimmed stand-in for module/base.yaml with the parts the rules touch.
function base() {
  return {
    mode: 'rule',
    'external-controller': '127.0.0.1:9090',
    tun: { enable: true, device: 'Meta', 'dns-hijack': ['any:53'] },
    dns: { enable: true, nameserver: ['https://dns.alidns.com/dns-query'], 'fake-ip-filter': ['*.lan'] },
    'x-provider-defaults': {
      type: 'http',
      interval: 21600,
      'health-check': { enable: true, url: 'https://www.gstatic.com/generate_204', interval: 900, lazy: true },
    },
    'proxy-groups': [
      { name: 'Proxy', type: 'select', 'include-all': true },
      { name: 'HK', type: 'select', 'include-all': true, filter: '(?i)hk' },
      { name: 'Final', type: 'select', proxies: ['Proxy', 'DIRECT'] },
    ],
    rules: ['GEOSITE,private,DIRECT', 'GEOSITE,cn,DIRECT', 'MATCH,Final'],
  };
}

const names = (config) => config['proxy-groups'].map((g) => g.name);
const group = (name) => ({ name, type: 'select', proxies: ['Proxy', 'DIRECT'] });

function mergeError(fn, code) {
  assert.throws(fn, (err) => err instanceof MergeError && err.code === code);
}

test('prepend-rules come first, in their own order', () => {
  const out = merge(base(), { 'prepend-rules': ['DOMAIN,a.com,DIRECT', 'DOMAIN,b.com,Proxy'] });
  assert.deepEqual(out.rules, [
    'DOMAIN,a.com,DIRECT',
    'DOMAIN,b.com,Proxy',
    'GEOSITE,private,DIRECT',
    'GEOSITE,cn,DIRECT',
    'MATCH,Final',
  ]);
});

test('append-rules go right before MATCH', () => {
  const out = merge(base(), { 'append-rules': ['DOMAIN-SUFFIX,windowsupdate.com,DIRECT'] });
  assert.deepEqual(out.rules, [
    'GEOSITE,private,DIRECT',
    'GEOSITE,cn,DIRECT',
    'DOMAIN-SUFFIX,windowsupdate.com,DIRECT',
    'MATCH,Final',
  ]);
});

test('append-rules go to the end when there is no MATCH', () => {
  const out = merge(base(), { rules: ['GEOIP,cn,DIRECT'], 'append-rules': ['DOMAIN,x.com,Proxy'] });
  assert.deepEqual(out.rules, ['GEOIP,cn,DIRECT', 'DOMAIN,x.com,Proxy']);
});

test('an overridden rules list is replaced first, then prepend/append are inserted', () => {
  const out = merge(base(), {
    rules: ['GEOIP,cn,DIRECT', 'MATCH,Proxy'],
    'prepend-rules': ['DOMAIN,first.com,DIRECT'],
    'append-rules': ['DOMAIN,last.com,DIRECT'],
  });
  assert.deepEqual(out.rules, ['DOMAIN,first.com,DIRECT', 'GEOIP,cn,DIRECT', 'DOMAIN,last.com,DIRECT', 'MATCH,Proxy']);
});

test('prepend-rules and append-rules do not appear in the result', () => {
  const out = merge(base(), { 'prepend-rules': ['DOMAIN,a.com,DIRECT'], 'append-rules': ['DOMAIN,b.com,DIRECT'] });
  assert.equal('prepend-rules' in out, false);
  assert.equal('append-rules' in out, false);
});

test('a subscription with only a url gets every default field and a generated path', () => {
  const out = merge(base(), { 'proxy-providers': { airport: { url: 'https://example.com/sub' } } });
  assert.deepEqual(out['proxy-providers'].airport, {
    type: 'http',
    interval: 21600,
    'health-check': { enable: true, url: 'https://www.gstatic.com/generate_204', interval: 900, lazy: true },
    url: 'https://example.com/sub',
    path: './providers/airport.yaml',
  });
});

test('fields written in a subscription win, nested ones included', () => {
  const out = merge(base(), {
    'proxy-providers': {
      backup: { url: 'https://example.org/sub', interval: 3600, 'health-check': { url: 'https://cp.cloudflare.com' }, path: './custom.yaml' },
    },
  });
  const backup = out['proxy-providers'].backup;
  assert.equal(backup.interval, 3600);
  assert.equal(backup.path, './custom.yaml');
  assert.deepEqual(backup['health-check'], { enable: true, url: 'https://cp.cloudflare.com', interval: 900, lazy: true });
});

test('an override can change the subscription defaults themselves', () => {
  const out = merge(base(), {
    'x-provider-defaults': { interval: 7200 },
    'proxy-providers': { airport: { url: 'https://example.com/sub' } },
  });
  assert.equal(out['proxy-providers'].airport.interval, 7200);
  assert.equal(out['proxy-providers'].airport.type, 'http');
  assert.equal(out['x-provider-defaults'].interval, 7200);
});

test('maps merge recursively while lists are replaced whole', () => {
  const out = merge(base(), { dns: { nameserver: ['https://1.1.1.1/dns-query'] } });
  assert.deepEqual(out.dns.nameserver, ['https://1.1.1.1/dns-query']);
  assert.equal(out.dns.enable, true);
  assert.deepEqual(out.dns['fake-ip-filter'], ['*.lan']);
});

test('null and scalars replace the base value', () => {
  const out = merge(base(), { mode: 'global', dns: { 'fake-ip-filter': null } });
  assert.equal(out.mode, 'global');
  assert.equal(out.dns['fake-ip-filter'], null);
});

test('fields managed by the module are rejected', () => {
  mergeError(() => merge(base(), { 'external-controller': '0.0.0.0:9090' }), 'managed-field');
  mergeError(() => merge(base(), { secret: 'x' }), 'managed-field');
  mergeError(() => merge(base(), { 'external-ui': 'ui/zashboard' }), 'managed-field');
  mergeError(() => merge(base(), { tun: { device: 'tun0' } }), 'managed-field');
});

test('other tun fields can still be overridden', () => {
  const out = merge(base(), { tun: { enable: false } });
  assert.equal(out.tun.enable, false);
  assert.equal(out.tun.device, 'Meta');
});

test('a subscription name containing "/" is rejected', () => {
  mergeError(() => merge(base(), { 'proxy-providers': { 'a/b': { url: 'https://example.com' } } }), 'provider-name-slash');
});

test('a subscription that is not a map is rejected', () => {
  mergeError(() => merge(base(), { 'proxy-providers': { airport: null } }), 'provider-not-map');
});

test('an empty override yields the base', () => {
  assert.deepEqual(merge(base(), null), base());
  assert.deepEqual(merge(base(), undefined), base());
  assert.deepEqual(merge(base(), {}), base());
});

test('an override that is not a map is rejected', () => {
  mergeError(() => merge(base(), ['mode: global']), 'root-not-map');
  mergeError(() => merge(base(), 'mode: global'), 'root-not-map');
});

test('prepend-rules and append-rules must be lists', () => {
  mergeError(() => merge(base(), { 'prepend-rules': 'DOMAIN,a.com,DIRECT' }), 'not-array');
  mergeError(() => merge(base(), { 'append-rules': { a: 1 } }), 'not-array');
});

test('append-proxy-groups go after the base groups, in their own order', () => {
  const out = merge(base(), { 'append-proxy-groups': [group('Google'), group('AI')] });
  assert.deepEqual(names(out), ['Proxy', 'HK', 'Final', 'Google', 'AI']);
  assert.deepEqual(out['proxy-groups'][3], group('Google'));
});

test('an overridden proxy-groups list is replaced first, then groups are appended', () => {
  const out = merge(base(), { 'proxy-groups': [group('Proxy'), group('Final')], 'append-proxy-groups': [group('AI')] });
  assert.deepEqual(names(out), ['Proxy', 'Final', 'AI']);
});

test('appended groups become the whole list when there is none', () => {
  const { 'proxy-groups': _, ...noGroups } = base();
  assert.deepEqual(names(merge(noGroups, { 'append-proxy-groups': [group('AI')] })), ['AI']);
  assert.deepEqual(names(merge(base(), { 'proxy-groups': null, 'append-proxy-groups': [group('AI')] })), ['AI']);
});

test('an empty append-proxy-groups changes nothing and does not appear in the result', () => {
  const out = merge(base(), { 'append-proxy-groups': [] });
  assert.deepEqual(out, base());
  assert.equal('append-proxy-groups' in merge(base(), { 'append-proxy-groups': [group('AI')] }), false);
});

test('append-proxy-groups and the list it extends must be lists', () => {
  mergeError(() => merge(base(), { 'append-proxy-groups': group('AI') }), 'not-array');
  mergeError(() => merge(base(), { 'proxy-groups': { Proxy: {} }, 'append-proxy-groups': [group('AI')] }), 'not-array');
});

test('excluded packages add to the base list, base first and without duplicates', () => {
  const b = { ...base(), tun: { ...base().tun, 'exclude-package': ['com.android.captiveportallogin'] } };
  const out = merge(b, { tun: { 'exclude-package': ['com.tencent.mm', 'com.android.captiveportallogin', 'cmb.pb'] } });
  assert.deepEqual(out.tun['exclude-package'], ['com.android.captiveportallogin', 'com.tencent.mm', 'cmb.pb']);
  assert.equal(out.tun.device, 'Meta');
});

test('excluded packages work with only one side listing them', () => {
  assert.deepEqual(merge(base(), { tun: { 'exclude-package': ['com.tencent.mm'] } }).tun['exclude-package'], ['com.tencent.mm']);
  const b = { ...base(), tun: { ...base().tun, 'exclude-package': ['com.android.captiveportallogin'] } };
  assert.deepEqual(merge(b, { tun: { enable: false } }).tun['exclude-package'], ['com.android.captiveportallogin']);
  assert.deepEqual(merge(b, { tun: { 'exclude-package': [] } }).tun['exclude-package'], ['com.android.captiveportallogin']);
});

test('excluded uids are the union of base and override', () => {
  const b = { ...base(), tun: { ...base().tun, 'exclude-uid': [1073] } };
  assert.deepEqual(merge(b, { tun: { 'exclude-uid': [10057, 1073] } }).tun['exclude-uid'], [1073, 10057]);
  assert.deepEqual(merge(b, { tun: { 'exclude-uid': [] } }).tun['exclude-uid'], [1073]);
  assert.deepEqual(merge(b, { tun: { 'exclude-package': ['com.tencent.mm'] } }).tun['exclude-uid'], [1073]);
});

test('tun exclusion lists must be lists', () => {
  mergeError(() => merge(base(), { tun: { 'exclude-package': 'com.tencent.mm' } }), 'not-array');
  mergeError(() => merge(base(), { tun: { 'exclude-package': null } }), 'not-array');
  mergeError(() => merge(base(), { tun: { 'exclude-uid': 10057 } }), 'not-array');
});

test('merging leaves the base untouched for the next preview or save', () => {
  const b = base();
  merge(b, {
    dns: { nameserver: ['https://1.1.1.1/dns-query'] },
    'x-provider-defaults': { 'health-check': { interval: 60 } },
    'proxy-providers': { airport: { url: 'https://example.com/sub' } },
    'prepend-rules': ['DOMAIN,a.com,DIRECT'],
    'append-proxy-groups': [group('AI')],
    tun: { 'exclude-package': ['com.tencent.mm'] },
  });
  assert.deepEqual(b, base());
});

test('merging the same base twice appends the groups once each time', () => {
  const b = base();
  const override = { 'append-proxy-groups': [group('AI')] };
  merge(b, override);
  assert.deepEqual(names(merge(b, override)), ['Proxy', 'HK', 'Final', 'AI']);
});
