import { MODDIR, readFile, api } from './device.js';
import { t, translatePage } from './i18n.js';
import { initStatus, refreshStatus } from './status.js';
import { loadDraft } from './draft.js';
import { initEditor } from './editor.js';
import { initSubscriptions } from './subscriptions-card.js';
import { initRules } from './rules-card.js';

async function renderVersions() {
  const prop = await readFile(`${MODDIR}/module.prop`);
  const module = /^version=(.*)$/m.exec(prop)?.[1] ?? '?';
  let core;
  try {
    core = (await api('GET', '/version')).version;
  } catch {
    core = t('header.coreUnavailable');
  }
  document.getElementById('versions').textContent = t('header.versions', { module, core });
}

translatePage();
renderVersions();
initStatus(renderVersions);
initEditor(() => Promise.all([refreshStatus(), renderVersions()]));
initSubscriptions();
initRules();
loadDraft();
