// The excluded apps card and its full-screen picker; edits go into the draft via apps.js.
import { iconUrl, installedPackages, packageInfo } from './device.js';
import { onDraftChange, parsedDraft, parsedSaved, updateDraft } from './draft.js';
import { t, locale } from './i18n.js';
import { changedExcluded, listExcluded, setExcluded } from './apps.js';
import { closeView, defineView, openView } from './views.js';

const $ = (id) => document.getElementById(id);
const infos = new Map(); // package → { label, system } | null, filled as lists are loaded
let selection = new Set();
let groups = { checked: [], others: [] };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function loadInfo(packages) {
  const missing = packages.filter((p) => !infos.has(p));
  if (missing.length) for (const [pkg, info] of packageInfo(missing)) infos.set(pkg, info);
}

function icon(pkg) {
  const img = el('img', 'app-icon');
  img.alt = '';
  img.loading = 'lazy';
  img.addEventListener('error', () => img.replaceWith(el('span', 'app-icon app-icon-none', '?')), { once: true });
  img.src = iconUrl(pkg);
  return img;
}

// Icon, name and package; an app without a label shows the package alone.
function appText(pkg) {
  const info = infos.get(pkg);
  const text = el('span', 'list-text app-text');
  if (info === null) text.append(el('span', 'app-name app-missing', t('apps.missing')));
  else if (info?.label) text.append(el('span', 'app-name', info.label));
  text.append(el('span', 'app-pkg', pkg));
  return text;
}

function render() {
  let list;
  let changed;
  try {
    const draft = parsedDraft();
    list = listExcluded(draft);
    changed = changedExcluded(parsedSaved(), draft);
  } catch {
    list = null;
  }
  $('apps-unavailable').hidden = list !== null;
  $('apps-list').hidden = $('apps-pick').hidden = list === null;
  $('apps-count').textContent = list?.length ? t('apps.count', { count: list.length }) : '';
  if (!list) return;
  // The manager loads its app list in the background as the WebUI opens; until then every
  // package looks uninstalled, so render again shortly instead of caching that.
  if (list.length && installedPackages('user').length === 0 && performance.now() < 10000) setTimeout(render, 500);
  else loadInfo(list);
  $('apps-list').replaceChildren(
    ...list.map((pkg) => {
      const row = el('div', 'app-row');
      row.append(icon(pkg), appText(pkg));
      if (changed.has(pkg)) row.append(el('span', 'tag', t('unsaved')));
      return row;
    }),
  );
}

const name = (pkg) => infos.get(pkg)?.label || pkg;
const byName = (a, b) => name(a).localeCompare(name(b), locale);

// Grouped when the picker opens and when system apps are toggled, not on every tick, so rows
// stay put while the user checks them.
function regroup() {
  const showSystem = $('apps-system').getAttribute('aria-pressed') === 'true';
  const pool = [...installedPackages('user'), ...(showSystem ? installedPackages('system') : [])];
  loadInfo(pool);
  const installed = (p) => infos.get(p) !== null;
  groups = {
    checked: [...selection].sort((a, b) => installed(b) - installed(a) || byName(a, b)),
    others: pool.filter((p) => !selection.has(p)).sort(byName),
  };
  renderPicker();
}

function pickerRow(pkg) {
  const row = el('label', 'app-row');
  const box = el('input', 'checkbox');
  box.type = 'checkbox';
  box.checked = selection.has(pkg);
  box.addEventListener('change', () => {
    if (box.checked) selection.add(pkg);
    else selection.delete(pkg);
    $('apps-checked-label').textContent = t('apps.checked', { count: selection.size });
  });
  row.append(icon(pkg), appText(pkg));
  if (infos.get(pkg)?.system) row.append(el('span', 'badge badge-neutral', t('apps.systemTag')));
  row.append(box);
  return row;
}

function renderPicker() {
  const query = $('apps-search').value.trim().toLowerCase();
  const matches = (pkg) => !query || pkg.toLowerCase().includes(query) || name(pkg).toLowerCase().includes(query);
  const checked = groups.checked.filter(matches);
  const others = groups.others.filter(matches);
  $('apps-checked-label').textContent = t('apps.checked', { count: selection.size });
  $('apps-checked-label').hidden = $('apps-checked').hidden = checked.length === 0;
  $('apps-others-label').hidden = $('apps-others').hidden = others.length === 0;
  $('apps-none').hidden = checked.length + others.length > 0;
  $('apps-checked').replaceChildren(...checked.map(pickerRow));
  $('apps-others').replaceChildren(...others.map(pickerRow));
}

function pick() {
  selection = new Set(listExcluded(parsedDraft()));
  $('apps-search').value = '';
  $('apps-system').setAttribute('aria-pressed', 'false');
  regroup();
  openView('apps');
}

function done() {
  updateDraft((override) => setExcluded(override, selection));
  closeView();
}

export function initApps() {
  defineView('apps');
  $('apps-search').placeholder = t('apps.search');
  $('apps-pick').addEventListener('click', pick);
  $('apps-done').addEventListener('click', done);
  $('apps-search').addEventListener('input', renderPicker);
  $('apps-system').addEventListener('click', () => {
    $('apps-system').setAttribute('aria-pressed', String($('apps-system').getAttribute('aria-pressed') !== 'true'));
    regroup();
  });
  onDraftChange(render);
  render();
}
