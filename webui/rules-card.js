// The custom rules card and its full-screen edit page; edits go into the draft via rules.js.
import { toast } from './device.js';
import { getBase, onDraftChange, parsedDraft, parsedSaved, updateDraft } from './draft.js';
import { t } from './i18n.js';
import { merge } from './merge.js';
import { IP_TYPES, POSITIONS, RULE_TYPES, changedRules, formatRule, listRules, policyOptions, removeRule, saveRule, validateRule } from './rules.js';
import { closeView, defineView, openView } from './views.js';

const $ = (id) => document.getElementById(id);
let base;
let editing = null; // { position, index } of the rule being edited, or null while adding
let position = 'prepend';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function row({ rule, parsed }, at, unsaved) {
  const button = el('button', 'rule-row');
  if (parsed) {
    button.append(el('span', 'badge', parsed.type), el('span', 'rule-value', parsed.value));
    if (unsaved) button.append(el('span', 'tag', t('unsaved')));
    button.append(el('span', 'rule-policy', parsed.policy));
    button.addEventListener('click', () => edit(at));
  } else {
    // The form cannot express it; leave it to the YAML editor rather than risk rewriting it.
    const text = el('span', 'list-text');
    text.append(el('span', 'rule-value', typeof rule === 'string' ? rule : JSON.stringify(rule)), el('span', 'muted', t('rules.yamlOnly')));
    button.append(text);
    if (unsaved) button.append(el('span', 'tag', t('unsaved')));
    button.addEventListener('click', () => toast(t('rules.yamlOnlyToast')));
  }
  button.append($('icon-chevron').content.cloneNode(true));
  return button;
}

function render() {
  let lists = null;
  let changed;
  try {
    const draft = parsedDraft();
    lists = listRules(draft);
    changed = changedRules(parsedSaved(), draft);
  } catch {
    lists = null;
  }
  $('rules-unavailable').hidden = lists !== null;
  $('rules-body').hidden = $('rules-add').hidden = lists === null;
  if (!lists) return;
  for (const p of POSITIONS) {
    $(`rules-${p}`).replaceChildren(...lists[p].map((r, index) => row(r, { position: p, index }, changed[p].has(index))));
    $(`rules-${p}-empty`).hidden = lists[p].length > 0;
  }
}

// Proxy groups from the config the draft would produce; base.yaml's when the draft does not merge.
function policies() {
  try {
    return policyOptions(merge(base, parsedDraft()));
  } catch {
    return policyOptions(base);
  }
}

function setPosition(p) {
  position = p;
  for (const b of document.querySelectorAll('#rule-position [data-position]')) b.setAttribute('aria-checked', String(b.dataset.position === p));
}

function current() {
  return { type: $('rule-type').value, value: $('rule-value').value.trim(), policy: $('rule-policy').value, noResolve: $('rule-no-resolve').checked };
}

function renderForm() {
  const type = $('rule-type').value;
  $('rule-no-resolve-row').hidden = !IP_TYPES.includes(type);
  $('rule-value').placeholder = t(`rules.example.${type}`);
  $('rule-value-hint').textContent = t(`rules.hint.${type}`);
  $('rule-preview').textContent = formatRule({ ...current(), value: current().value || '…' });
}

function showError(errors) {
  $('rule-value-error').hidden = !errors.value;
  $('rule-value-error').textContent = errors.value ? t(`rule.${errors.value}`) : '';
  $('rule-value').setAttribute('aria-invalid', String(Boolean(errors.value)));
}

function edit(at) {
  editing = at;
  const parsed = at ? listRules(parsedDraft())[at.position][at.index].parsed : null;
  const rule = parsed ?? { type: 'DOMAIN-SUFFIX', value: '', policy: 'DIRECT', noResolve: false };
  const names = policies();
  if (!names.includes(rule.policy)) names.push(rule.policy);
  $('rule-policy').replaceChildren(...names.map((n) => new Option(n, n)));
  $('rule-title').textContent = t(at ? 'rules.editTitle' : 'rules.addTitle');
  setPosition(at ? at.position : 'prepend');
  $('rule-type').value = rule.type;
  $('rule-value').value = rule.value;
  $('rule-policy').value = rule.policy;
  $('rule-no-resolve').checked = rule.noResolve;
  $('rule-delete').hidden = !at;
  showError({});
  renderForm();
  openView('rule');
}

function done() {
  const rule = current();
  const errors = validateRule(rule);
  showError(errors);
  if (Object.keys(errors).length) return;
  updateDraft((override) => saveRule(override, editing, position, rule));
  closeView();
}

function remove() {
  updateDraft((override) => removeRule(override, editing.position, editing.index));
  closeView();
}

export async function initRules() {
  base = await getBase();
  defineView('rule');
  $('rule-type').replaceChildren(...RULE_TYPES.map((type) => new Option(type, type)));
  for (const b of document.querySelectorAll('#rule-position [data-position]')) b.addEventListener('click', () => setPosition(b.dataset.position));
  for (const id of ['rule-type', 'rule-value', 'rule-policy', 'rule-no-resolve']) $(id).addEventListener('input', renderForm);
  $('rules-add').addEventListener('click', () => edit(null));
  $('rule-done').addEventListener('click', done);
  $('rule-delete').addEventListener('click', remove);
  onDraftChange(render);
  render();
}
