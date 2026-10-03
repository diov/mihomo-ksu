// The subscriptions card and its full-screen edit page; edits go into the draft via subscriptions.js.
import { getBase, onDraftChange, parsedDraft, parsedSaved, updateDraft } from './draft.js';
import { t } from './i18n.js';
import { closeView, defineView, openView } from './views.js';
import { changedSubscriptions, displayUrl, listSubscriptions, removeSubscription, saveSubscription, validateSubscription } from './subscriptions.js';

const $ = (id) => document.getElementById(id);
const INTERVALS = [3600, 43200, 86400];
let defaultInterval;
let editing = null; // original name, or null while adding

function duration(seconds) {
  if (seconds % 3600 === 0) return t('duration.hours', { n: seconds / 3600 });
  if (seconds % 60 === 0) return t('duration.minutes', { n: seconds / 60 });
  return t('duration.seconds', { n: seconds });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function row({ name, url, interval }, unsaved) {
  const button = el('button', 'list-row');
  const text = el('span', 'list-text');
  const title = el('span', 'row-title');
  title.append(el('span', 'row-name', name));
  if (unsaved) title.append(el('span', 'tag', t('unsaved')));
  const detail = [displayUrl(url)];
  if (interval !== undefined) detail.push(t('subs.every', { duration: duration(interval) }));
  text.append(title, el('span', 'muted ellipsis', detail.join(' · ')));
  button.append(text, $('icon-edit').content.cloneNode(true));
  button.addEventListener('click', () => edit(name));
  return button;
}

function render() {
  let override;
  let saved;
  try {
    override = parsedDraft();
    saved = parsedSaved();
  } catch {
    override = undefined;
  }
  const list = override === undefined ? null : listSubscriptions(override);
  $('subs-unavailable').hidden = list !== null;
  $('subs-list').hidden = $('subs-add').hidden = list === null;
  $('subs-count').textContent = list ? t('subs.count', { count: list.length }) : '';
  $('subs-empty').hidden = !list || list.length > 0;
  if (!list) return;
  const changed = changedSubscriptions(saved, override);
  $('subs-list').replaceChildren(...list.map((s) => row(s, changed.has(s.name))));
}

function fillIntervals(current) {
  const values = [...INTERVALS];
  if (current !== undefined && !values.includes(current)) values.push(current);
  const options = [new Option(t('subEdit.intervalDefault', { duration: duration(defaultInterval) }), '')];
  for (const v of values) options.push(new Option(duration(v), String(v)));
  $('sub-interval').replaceChildren(...options);
  $('sub-interval').value = current === undefined ? '' : String(current);
}

function showErrors(errors) {
  for (const field of ['name', 'url']) {
    $(`sub-${field}-error`).hidden = !errors[field];
    $(`sub-${field}-error`).textContent = errors[field] ? t(`sub.${errors[field]}`) : '';
    $(`sub-${field}`).setAttribute('aria-invalid', String(Boolean(errors[field])));
  }
}

function edit(name) {
  editing = name;
  const current = name === null ? {} : listSubscriptions(parsedDraft()).find((s) => s.name === name);
  $('sub-title').textContent = t(name === null ? 'subEdit.addTitle' : 'subEdit.editTitle');
  $('sub-name').value = name ?? '';
  $('sub-url').value = current.url ?? '';
  fillIntervals(current.interval);
  $('sub-delete').hidden = name === null;
  showErrors({});
  openView('subscription');
}

function done() {
  const value = { name: $('sub-name').value.trim(), url: $('sub-url').value.trim() };
  const errors = validateSubscription(parsedDraft(), editing, value);
  showErrors(errors);
  if (Object.keys(errors).length) return;
  const interval = $('sub-interval').value === '' ? null : Number($('sub-interval').value);
  updateDraft((override) => saveSubscription(override, editing, { ...value, interval }));
  closeView();
}

function remove() {
  updateDraft((override) => removeSubscription(override, editing));
  closeView();
}

export async function initSubscriptions() {
  defaultInterval = (await getBase())['x-provider-defaults']?.interval;
  defineView('subscription');
  $('subs-add').addEventListener('click', () => edit(null));
  $('sub-done').addEventListener('click', done);
  $('sub-delete').addEventListener('click', remove);
  onDraftChange(render);
  render();
}
