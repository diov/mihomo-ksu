import { MODDIR, readFile, api } from './device.js';
import { t, translatePage } from './i18n.js';

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
