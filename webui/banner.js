// Template update banner: shown while base.yaml differs from the one config.yaml was generated from.
// Applying is an ordinary save, since every save merges with the current base.yaml.
import { templateChanged } from './device.js';
import { isDirty, onDraftChange } from './draft.js';
import { save } from './editor.js';
import { t } from './i18n.js';
import { openView } from './views.js';

const $ = (id) => document.getElementById(id);

// With unsaved changes, applying would also commit edits the user has not confirmed,
// so the button gives way to the save bar.
function renderDirty() {
  const dirty = isDirty();
  $('banner-apply').hidden = dirty;
  $('banner-desc').textContent = t(dirty ? 'banner.descDirty' : 'banner.desc');
}

async function apply() {
  const button = $('banner-apply');
  button.disabled = true;
  button.textContent = t('banner.applying');
  try {
    await save();
  } finally {
    button.disabled = false;
    button.textContent = t('banner.apply');
  }
}

export async function refreshBanner() {
  $('banner').hidden = !(await templateChanged());
}

export function initBanner() {
  $('banner-preview').addEventListener('click', () => openView('preview'));
  $('banner-apply').addEventListener('click', apply);
  onDraftChange(renderDirty);
  renderDirty();
  return refreshBanner();
}
