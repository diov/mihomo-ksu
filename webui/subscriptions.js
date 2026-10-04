// Subscription edits on a parsed override (proxy-providers); the card and edit page live in subscriptions-card.js.
// Every function returns new objects and leaves its input untouched.
import { deepEqual } from './changes.js';

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// [{ name, source, url, interval }] in file order; null when proxy-providers is not a map the form can edit.
// source is 'file' for a type: file provider (decisions #6) and 'url' otherwise.
export function listSubscriptions(override) {
  const providers = override?.['proxy-providers'];
  if (providers === undefined || providers === null) return [];
  if (!isMap(providers)) return null;
  return Object.entries(providers).map(([name, entry]) => ({
    name,
    source: isMap(entry) && entry.type === 'file' ? 'file' : 'url',
    url: isMap(entry) ? entry.url : undefined,
    interval: isMap(entry) ? entry.interval : undefined,
  }));
}

// Names whose entry differs from the saved override (new ones included).
export function changedSubscriptions(saved, draft) {
  const before = isMap(saved?.['proxy-providers']) ? saved['proxy-providers'] : {};
  const after = isMap(draft?.['proxy-providers']) ? draft['proxy-providers'] : {};
  return new Set(Object.keys(after).filter((name) => !deepEqual(before[name], after[name])));
}

// { name?, url?, file? } with an error code per invalid field; empty when valid. hasFile tells
// whether a file subscription has its file, picked now or already saved under this name.
export function validateSubscription(override, originalName, { source, name, url, hasFile }) {
  const errors = {};
  const providers = isMap(override?.['proxy-providers']) ? override['proxy-providers'] : {};
  if (!name) errors.name = 'name-required';
  else if (name.includes('/')) errors.name = 'name-slash';
  else if (name !== originalName && name in providers) errors.name = 'name-taken';
  if (source === 'url' && !/^https?:\/\/\S+$/i.test(url ?? '')) errors.url = 'url-invalid';
  if (source === 'file' && !hasFile) errors.file = 'file-required';
  return errors;
}

// Adds (originalName null) or updates a subscription. Only type, url and interval are touched, so
// hand-written fields survive; interval null means the template default. A rename keeps its position.
export function saveSubscription(override, originalName, { source, name, url, interval }) {
  const providers = isMap(override?.['proxy-providers']) ? override['proxy-providers'] : {};
  const entry = { ...(isMap(providers[originalName]) ? providers[originalName] : {}) };
  if (source === 'file') {
    delete entry.url;
    delete entry.interval;
    entry.type = 'file';
  } else {
    if (entry.type === 'file') delete entry.type;
    entry.url = url;
    if (interval === null) delete entry.interval;
    else entry.interval = interval;
  }

  const next = {};
  for (const [key, value] of Object.entries(providers)) next[key === originalName ? name : key] = key === originalName ? entry : value;
  if (originalName === null) next[name] = entry;
  return { ...override, 'proxy-providers': next };
}

export function removeSubscription(override, name) {
  const { [name]: removed, ...rest } = override['proxy-providers'];
  const { 'proxy-providers': providers, ...others } = override;
  return Object.keys(rest).length ? { ...others, 'proxy-providers': rest } : others;
}

// Nodes mihomo reads from a subscription file: the proxies of a Clash config (parsed is the YAML
// value, undefined when the text is not YAML), else v2rayN-style links one per line, plain or base64.
export function countNodes(parsed, text) {
  if (isMap(parsed) && Array.isArray(parsed.proxies)) return parsed.proxies.length;
  const links = (s) => s.split(/\r?\n/).filter((line) => /^[a-z][a-z0-9+.-]*:\/\/\S/i.test(line.trim())).length;
  const plain = links(text);
  if (plain) return plain;
  try {
    return links(atob(text.replace(/\s/g, '').replaceAll('-', '+').replaceAll('_', '/')));
  } catch {
    return 0;
  }
}

// Host and path only: the query string usually carries the account token.
export function displayUrl(url) {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === '/' ? '' : u.pathname) + (u.search || u.hash ? '?…' : '');
  } catch {
    return String(url ?? '');
  }
}
