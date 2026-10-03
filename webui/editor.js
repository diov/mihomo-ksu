// Views (main / YAML editor / preview), the unsaved-changes bar and the save error dialog.
import { toast } from './device.js';
import { SaveError, buildConfig, changeCount, discardDraft, getDraft, isDirty, onDraftChange, saveDraft, setDraft } from './draft.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const VIEWS = ['main', 'editor', 'preview'];
let onSaved = () => {};

function show(view) {
  for (const name of VIEWS) $(`view-${name}`).hidden = name !== view;
  if (view === 'editor') $('editor-text').value = getDraft();
  if (view === 'preview') renderPreview();
  renderSaveBar();
  scrollTo(0, 0);
}

// Pushed so the system back button (WebView goBack) returns to the previous view.
function open(view) {
  history.pushState({ view }, '');
  show(view);
}

// mihomo -t logs every step; keep the failing lines when there are any.
function validateOutput(output) {
  const lines = output.trim().split('\n').map((line) => line.replace(/^time="[^"]*" /, ''));
  const failing = lines.filter((line) => /level=(error|fatal)|test failed/.test(line));
  return (failing.length ? failing : lines).join('\n');
}

function describe(err) {
  // Anything else may have failed after files were written, so make no claim about the config.
  if (!(err instanceof SaveError)) return { title: t('error.unexpectedTitle'), message: String(err?.message ?? err), log: err?.stderr };
  const { kind, detail } = err;
  if (kind === 'yaml') {
    const message = detail.line ? t('error.yaml', { line: detail.line }) : t('error.yamlNoLine');
    return { title: t('error.failedTitle'), message, log: detail.message };
  }
  if (kind === 'merge') return { title: t('error.failedTitle'), message: t(`merge.${detail.code}`, detail.params) };
  if (kind === 'validate') return { title: t('error.failedTitle'), message: t('error.validate'), log: validateOutput(detail.output) };
  return { title: t('error.reloadTitle'), message: t('error.reload'), log: detail.message, applied: true };
}

function showError(err) {
  const { title, message, log, applied } = describe(err);
  $('error-title').textContent = title;
  $('error-message').textContent = message;
  $('error-log').hidden = !log;
  $('error-log').textContent = log ?? '';
  $('error-close').textContent = t(applied ? 'error.ok' : 'error.back');
  $('error-dialog').showModal();
}

async function renderPreview() {
  $('preview-text').textContent = '';
  $('preview-error').hidden = true;
  try {
    $('preview-text').textContent = await buildConfig();
  } catch (err) {
    const { message, log } = describe(err);
    $('preview-error').hidden = false;
    $('preview-error').textContent = log ? `${message}\n${log}` : message;
  }
}

function renderSaveBar() {
  const visible = !$('view-main').hidden && isDirty();
  $('savebar').hidden = !visible;
  document.body.classList.toggle('has-savebar', visible);
  if (visible) {
    const count = changeCount();
    $('savebar-text').textContent = count ? t('savebar.count', { count }) : t('savebar.unknown');
  }
}

async function save() {
  const buttons = document.querySelectorAll('[data-action="save"]');
  for (const b of buttons) {
    b.disabled = true;
    b.textContent = t('save.saving');
  }
  try {
    await saveDraft();
    toast(t('save.done'));
  } catch (err) {
    showError(err);
  } finally {
    for (const b of buttons) {
      b.disabled = false;
      b.textContent = t('save.save');
    }
    onSaved();
  }
}

// onSavedCallback refreshes what depends on the running config, such as the status card.
export function initEditor(onSavedCallback) {
  onSaved = onSavedCallback;
  history.replaceState({ view: 'main' }, '');
  addEventListener('popstate', (e) => show(e.state?.view ?? 'main'));
  $('advanced-edit').addEventListener('click', () => open('editor'));
  $('advanced-preview').addEventListener('click', () => open('preview'));
  $('editor-preview').addEventListener('click', () => open('preview'));
  for (const b of document.querySelectorAll('[data-action="back"]')) b.addEventListener('click', () => history.back());
  for (const b of document.querySelectorAll('[data-action="save"]')) b.addEventListener('click', save);
  $('savebar-discard').addEventListener('click', discardDraft);
  $('editor-text').addEventListener('input', (e) => setDraft(e.target.value));
  $('error-close').addEventListener('click', () => $('error-dialog').close());
  onDraftChange(renderSaveBar);
}
