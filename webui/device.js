// The only place that touches the device: every call runs in KSU's root shell.
import { exec, getPackagesInfo, listPackages } from './vendor/kernelsu.js';

export { toast } from './vendor/kernelsu.js';

export const MODDIR = '/data/adb/modules/mihomo-ksu';
export const DATA = '/data/adb/mihomo-ksu';
const API = 'http://127.0.0.1:9090';

export class DeviceError extends Error {
  constructor(message, { errno, stderr } = {}) {
    super(message);
    this.name = 'DeviceError';
    this.errno = errno;
    this.stderr = stderr;
  }
}

const quote = (s) => `'${String(s).replaceAll("'", `'\\''`)}'`;

async function sh(command) {
  const { errno, stdout, stderr } = await exec(command);
  if (errno !== 0) throw new DeviceError(`shell command exited with ${errno}`, { errno, stderr });
  return stdout;
}

// The manager returns stdout as lines joined by "\n", dropping the final newline and any \r,
// so file contents travel as base64 to come back byte for byte.
async function readBase64(command) {
  const b64 = (await sh(command)).replace(/\s/g, '');
  return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

export function readFile(path) {
  return readBase64(`base64 ${quote(path)}`);
}

export function readFileIfExists(path) {
  return readBase64(`[ ! -f ${quote(path)} ] || base64 ${quote(path)}`);
}

// base64 keeps YAML quotes, $ and newlines away from the shell.
export async function writeFile(path, text) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  await sh(`echo ${btoa(binary)} | base64 -d > ${quote(path)}`);
}

export async function testConfig(path) {
  const { errno, stdout } = await exec(`${MODDIR}/bin/mihomo -t -d ${DATA} -f ${quote(path)} 2>&1`);
  return { ok: errno === 0, output: stdout };
}

export function makeDir(path) {
  return sh(`mkdir -p ${quote(path)}`);
}

export function removeFiles(...paths) {
  return sh(`rm -f ${paths.map(quote).join(' ')}`);
}

// Moves subscription files ([from, to] pairs) and both configs into place, then records the
// base.yaml they were built from and clears the description hint.
export function commitConfig(overrideTmp, configTmp, moves) {
  return sh(
    [
      ...moves.map(([from, to]) => `mv ${quote(from)} ${quote(to)}`),
      `mv ${quote(overrideTmp)} ${DATA}/override.yaml`,
      `mv ${quote(configTmp)} ${DATA}/config.yaml`,
      `${MODDIR}/scripts/template.sh applied`,
    ].join(' && '),
  );
}

// template.sh changed exits 0 when base.yaml differs from the one config.yaml was generated from.
export async function templateChanged() {
  return (await exec(`${MODDIR}/scripts/template.sh changed`)).errno === 0;
}

export async function logTail(lines) {
  return sh(`tail -n ${Number(lines)} ${DATA}/log/mihomo.log`);
}

// Installed packages of type 'user' or 'system', from the manager's cached app list.
export const installedPackages = (type) => listPackages(type);

// Package name → { label, system }, or null for a package that is not installed. A label equal
// to the package name means the app has none (common among system packages).
export function packageInfo(packages) {
  const out = new Map();
  for (const info of getPackagesInfo(packages)) {
    const label = info.appLabel === info.packageName ? '' : info.appLabel;
    out.set(info.packageName, info.error ? null : { label, system: info.isSystem === true });
  }
  return out;
}

// The manager serves app icons at this address (KernelSU, KernelSU Next and APatch alike).
export const iconUrl = (pkg) => `ksu://icon/${encodeURIComponent(pkg)}`;

// Resolves to the exit code: ctl.sh status exits 0 only while mihomo is running.
export async function ctl(action) {
  return (await exec(`${MODDIR}/scripts/ctl.sh ${action}`)).errno;
}

export async function corePid() {
  return (await readFile(`${DATA}/mihomo.pid`)).trim();
}

// "off", "opportunistic", "hostname", or "null" when never set (the system then uses automatic mode).
export async function privateDnsMode() {
  return (await sh('settings get global private_dns_mode')).trim();
}

// The secret is filled in by the shell, so it never passes through the page.
export function openDashboard() {
  return sh(
    `am start -a android.intent.action.VIEW -d ` +
      `"http://127.0.0.1:9090/ui/#/setup?hostname=127.0.0.1&port=9090&secret=$(cat ${DATA}/secret)"`,
  );
}

// The secret reaches curl through stdin (printf is a shell builtin), never argv.
export async function api(method, path, body) {
  const data = body === undefined ? '' : ` -H 'Content-Type: application/json' --data-binary ${quote(JSON.stringify(body))}`;
  const out = await sh(
    `printf 'Authorization: Bearer %s' "$(cat ${DATA}/secret)" | ` +
      `curl -sS -m 5 -X ${method} -H @-${data} -w '\\n%{http_code}' ${quote(API + path)}`,
  );
  const cut = out.lastIndexOf('\n');
  const status = Number(out.slice(cut + 1));
  const text = out.slice(0, cut);
  if (status < 200 || status >= 300) throw new DeviceError(`${method} ${path}: HTTP ${status}`, { stderr: text });
  return text ? JSON.parse(text) : null;
}
