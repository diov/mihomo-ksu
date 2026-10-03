#!/usr/bin/env node
// Evaluates JavaScript in the module WebUI over the WebView DevTools protocol (via adb).
// Usage: node tools/cdp.mjs [--reload] <file.js>
//   The file holds one expression (wrap statements in an async IIFE); its value is printed as JSON,
//   followed by page errors seen meanwhile. Needs the WebUI open in the foreground with the
//   manager's WebView debugging enabled (docs/dev-testing.md).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PORT = 9333;
// A backgrounded WebView (or a sleeping screen) accepts the connection but never answers.
setTimeout(() => {
  console.error('no answer from the page within 20s: keep the WebUI in the foreground with the screen on');
  process.exit(1);
}, 20000).unref();
const args = process.argv.slice(2);
const reload = args.includes('--reload');
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node tools/cdp.mjs [--reload] <file.js>');
  process.exit(2);
}

const socket = execSync('adb shell cat /proc/net/unix').toString().match(/webview_devtools_remote_\d+/)?.[0];
if (!socket) throw new Error('no WebView devtools socket: open the WebUI and enable WebView debugging');
execSync(`adb forward tcp:${PORT} localabstract:${socket}`);

const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = pages.find((p) => p.type === 'page');
if (!page) throw new Error('no page: bring the WebUI to the foreground');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id) return pending.get(msg.id)?.(msg);
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  // The WebView always requests /favicon.ico; its 404 is noise.
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && !msg.params.entry.url?.endsWith('/favicon.ico')) errors.push(msg.params.entry.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
await send('Log.enable');
if (reload) {
  await send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 3000));
}
const res = await send('Runtime.evaluate', { expression: readFileSync(file, 'utf8'), awaitPromise: true, returnByValue: true });
await new Promise((r) => setTimeout(r, 300));
console.log(JSON.stringify(res.result.exceptionDetails ?? res.result.result.value, null, 2));
console.log('page errors:', errors.length ? errors : 'none');
ws.close();
