import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedExcluded, listExcluded, setExcluded } from '../webui/apps.js';

const override = () => ({
  'proxy-providers': { airport: { url: 'https://a.example' } },
  tun: { 'exclude-package': ['com.tencent.mm', 'cmb.pb'] },
});

test('the excluded list is read from tun, empty when not written', () => {
  assert.deepEqual(listExcluded(override()), ['com.tencent.mm', 'cmb.pb']);
  assert.deepEqual(listExcluded(null), []);
  assert.deepEqual(listExcluded({ tun: { enable: false } }), []);
});

test('shapes the page cannot edit are reported', () => {
  assert.equal(listExcluded({ tun: null }), null);
  assert.equal(listExcluded({ tun: { 'exclude-package': 'com.tencent.mm' } }), null);
});

test('saving keeps the existing order and appends new picks', () => {
  const out = setExcluded(override(), ['org.telegram.messenger', 'cmb.pb', 'com.tencent.mm']);
  assert.deepEqual(out.tun['exclude-package'], ['com.tencent.mm', 'cmb.pb', 'org.telegram.messenger']);
  assert.deepEqual(out['proxy-providers'], override()['proxy-providers']);
});

test('unpicking drops the package, then the key, then an emptied tun', () => {
  assert.deepEqual(setExcluded(override(), ['cmb.pb']).tun['exclude-package'], ['cmb.pb']);
  assert.equal('tun' in setExcluded(override(), []), false);
  assert.deepEqual(setExcluded({ tun: { enable: false, 'exclude-package': ['cmb.pb'] } }, []), { tun: { enable: false } });
  assert.deepEqual(setExcluded(null, ['cmb.pb']), { tun: { 'exclude-package': ['cmb.pb'] } });
});

test('only packages new to the draft count as unsaved', () => {
  const draft = setExcluded(override(), ['cmb.pb', 'org.telegram.messenger']);
  assert.deepEqual([...changedExcluded(override(), draft)], ['org.telegram.messenger']);
  assert.deepEqual([...changedExcluded(null, override())], ['com.tencent.mm', 'cmb.pb']);
});

test('the input override is left untouched', () => {
  const o = override();
  setExcluded(o, ['org.telegram.messenger']);
  assert.deepEqual(o, override());
});
