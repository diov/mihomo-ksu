// The only place that touches the device: every call runs in KSU's root shell.
import { exec } from './vendor/kernelsu.js';

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
