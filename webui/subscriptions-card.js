// The subscriptions card and its full-screen edit page; edits go into the draft via subscriptions.js.
import { api } from './device.js';
import { getBase, getFiles, onDraftChange, parsedDraft, parsedSaved, setFiles, updateDraft } from './draft.js';
import { t } from './i18n.js';
import { closeView, defineView, openView } from './views.js';
import { parse } from './yaml.js';
import {
  changedSubscriptions,
  countNodes,
  displayUrl,
  listSubscriptions,
  removeSubscription,
  saveSubscription,
  validateSubscription,
} from './subscriptions.js';

const $ = (id) => document.getElementById(id);
const INTERVALS = [3600, 43200, 86400];
let defaultInterval;
let editing = null; // original name, or null while adding
let source = 'url';
let picked = null; // { fileName, text, nodes } of a file picked for the subscription being edited

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

function row({ name, source, url, interval }, unsaved) {
  const button = el('button', 'list-row');
  const text = el('span', 'list-text');
  const title = el('span', 'row-title');
  title.append(el('span', 'row-name', name));
  if (unsaved) title.append(el('span', 'tag', t('unsaved')));
  const detail = source === 'file' ? [t('subs.localFile')] : [displayUrl(url)];
  if (source === 'url' && interval !== undefined) detail.push(t('subs.every', { duration: duration(interval) }));
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
  for (const name of getFiles().keys()) changed.add(name);
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
  for (const field of ['name', 'url', 'file']) {
    $(`sub-${field}-error`).hidden = !errors[field];
    $(`sub-${field}-error`).textContent = errors[field] ? t(`sub.${errors[field]}`) : '';
    $(field === 'file' ? 'sub-file-pick' : `sub-${field}`).setAttribute('aria-invalid', String(Boolean(errors[field])));
  }
}

// Saved as a file subscription under this name, so its file is already on the device.
function savedAsFile(name) {
  if (name === null) return false;
  try {
    return listSubscriptions(parsedSaved())?.find((s) => s.name === name)?.source === 'file';
  } catch {
    return false;
  }
}

function setSource(value) {
  source = value;
  for (const b of document.querySelectorAll('#sub-source [data-source]')) b.setAttribute('aria-checked', String(b.dataset.source === value));
  $('sub-url-field').hidden = $('sub-interval-field').hidden = value !== 'url';
  $('sub-file-field').hidden = value !== 'file';
}

function renderFile() {
  const imported = !picked && savedAsFile(editing);
  $('sub-file-pick').hidden = Boolean(picked) || imported;
  $('sub-file-box').hidden = !picked && !imported;
  if (picked) {
    $('sub-file-name').textContent = picked.fileName;
    $('sub-file-detail').textContent = t('subEdit.fileNodes', { count: picked.nodes });
  } else if (imported) {
    const name = editing;
    $('sub-file-name').textContent = t('subEdit.fileImported');
    $('sub-file-detail').textContent = '';
    api('GET', `/providers/proxies/${encodeURIComponent(name)}`)
      .then(({ proxies }) => {
        if (editing === name && !picked) $('sub-file-detail').textContent = t('subEdit.fileImportedNodes', { count: proxies.length });
      })
      .catch(() => {});
  }
}

async function pickFile(input) {
  const [file] = input.files;
  input.value = '';
  if (!file) return;
  const text = await file.text();
  let parsed;
  try {
    parsed = parse(text);
  } catch {
    parsed = undefined;
  }
  const nodes = countNodes(parsed, text);
  if (nodes === 0) {
    showErrors({ file: 'file-no-nodes' });
    return;
  }
  picked = { fileName: file.name, text, nodes };
  showErrors({});
  renderFile();
}

function edit(name) {
  editing = name;
  const current = name === null ? {} : listSubscriptions(parsedDraft()).find((s) => s.name === name);
  picked = name === null ? null : (getFiles().get(name) ?? null);
  $('sub-title').textContent = t(name === null ? 'subEdit.addTitle' : 'subEdit.editTitle');
  setSource(current.source ?? 'url');
  $('sub-name').value = name ?? '';
  $('sub-url').value = current.url ?? '';
  fillIntervals(current.interval);
  renderFile();
  $('sub-delete').hidden = name === null;
  showErrors({});
  openView('subscription');
}

// A picked file follows its subscription through a rename and is dropped when the source is a link.
function done() {
  const value = { source, name: $('sub-name').value.trim(), url: $('sub-url').value.trim() };
  const hasFile = Boolean(picked) || (savedAsFile(editing) && value.name === editing);
  const errors = validateSubscription(parsedDraft(), editing, { ...value, hasFile });
  showErrors(errors);
  if (Object.keys(errors).length) return;
  const interval = $('sub-interval').value === '' ? null : Number($('sub-interval').value);
  updateDraft((override) => saveSubscription(override, editing, { ...value, interval }));
  const files = getFiles();
  files.delete(editing);
  if (source === 'file' && picked) files.set(value.name, picked);
  setFiles(files);
  closeView();
}

function remove() {
  updateDraft((override) => removeSubscription(override, editing));
  const files = getFiles();
  files.delete(editing);
  setFiles(files);
  closeView();
}

export async function initSubscriptions() {
  defaultInterval = (await getBase())['x-provider-defaults']?.interval;
  defineView('subscription');
  $('subs-add').addEventListener('click', () => edit(null));
  $('sub-done').addEventListener('click', done);
  $('sub-delete').addEventListener('click', remove);
  for (const b of document.querySelectorAll('#sub-source [data-source]')) b.addEventListener('click', () => setSource(b.dataset.source));
  for (const id of ['sub-file-pick', 'sub-file-repick']) $(id).addEventListener('click', () => $('sub-file-input').click());
  $('sub-file-input').addEventListener('change', (e) => pickFile(e.target));
  onDraftChange(render);
  render();
}
