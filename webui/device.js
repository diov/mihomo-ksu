// The only place that touches the device: every call runs in KSU's root shell.
import { exec } from './vendor/kernelsu.js';

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

export function readFile(path) {
  return sh(`cat ${quote(path)}`);
}

export function readFileIfExists(path) {
  return sh(`[ ! -f ${quote(path)} ] || cat ${quote(path)}`);
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

export function removeFiles(...paths) {
  return sh(`rm -f ${paths.map(quote).join(' ')}`);
}

// Replaces both files, then records the base.yaml they were built from and clears the description hint.
export function commitConfig(overrideTmp, configTmp) {
  return sh(
    `mv ${quote(overrideTmp)} ${DATA}/override.yaml && mv ${quote(configTmp)} ${DATA}/config.yaml && ` +
      `${MODDIR}/scripts/template.sh applied`,
  );
}

// template.sh changed exits 0 when base.yaml differs from the one config.yaml was generated from.
export async function templateChanged() {
  return (await exec(`${MODDIR}/scripts/template.sh changed`)).errno === 0;
}

export async function logTail(lines) {
  return sh(`tail -n ${Number(lines)} ${DATA}/log/mihomo.log`);
}

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
