import { api, ctl, corePid, logTail, openDashboard, privateDnsMode } from './device.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

// mihomo keeps running when the controller or the tun fails (decisions #2),
// so each is checked separately; the first failure becomes the headline.
async function check() {
  if ((await ctl('status')) !== 0) return { problem: 'stopped' };
  const pid = await corePid();
  try {
    await api('GET', '/version');
  } catch {
    return { problem: 'controller', pid };
  }
  const configs = await api('GET', '/configs');
  if (!configs.tun?.enable) return { problem: 'tun', pid };
  return { pid };
}

async function renderPrivateDns() {
  const mode = await privateDnsMode();
  $('status-private-dns').hidden = mode === 'off';
  if (mode !== 'off') {
    $('status-private-dns-text').textContent = t('status.privateDns', { mode: t(`status.privateDnsMode.${mode}`) });
  }
}

export async function refreshStatus() {
  const { problem, pid } = await check();
  $('status').dataset.state = problem ? 'error' : 'ok';
  $('status-title').textContent = t(problem ? `status.${problem}.title` : 'status.running');
  $('status-pid').textContent = pid ? t('status.pid', { pid }) : '';
  $('status-desc').hidden = !problem;
  $('status-log').hidden = !problem;
  $('status-log').open = false;
  if (problem) {
    $('status-desc').textContent = t(`status.${problem}.desc`);
    $('status-log-text').textContent = await logTail(20).catch(() => '');
  }
  await renderPrivateDns();
}

async function restart(onRestarted) {
  const button = $('status-restart');
  button.disabled = true;
  button.querySelector('span').textContent = t('status.restarting');
  try {
    await ctl('restart');
    await Promise.all([refreshStatus(), onRestarted()]);
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = t('status.restart');
  }
}

// onRestarted refreshes what else depends on the core, such as the version in the top bar.
export function initStatus(onRestarted) {
  // Newest lines are at the bottom of the capped log box.
  $('status-log').addEventListener('toggle', (e) => {
    if (e.target.open) $('status-log-text').scrollTop = $('status-log-text').scrollHeight;
  });
  $('status-open-dashboard').addEventListener('click', () => openDashboard());
  $('status-restart').addEventListener('click', () => restart(onRestarted));
  return refreshStatus();
}
