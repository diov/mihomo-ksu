// merge(base, override) -> config object. The rules are specified in docs/override.md.

// Keys the module's scripts and WebUI depend on; an override may not set them.
const MANAGED_FIELDS = [['external-controller'], ['secret'], ['external-ui'], ['tun', 'device']];

// `code` and `params` let the UI show a translated message; `message` is for logs.
export class MergeError extends Error {
  constructor(code, params, message) {
    super(message);
    this.name = 'MergeError';
    this.code = code;
    this.params = params;
  }
}

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Never mutates its inputs: the same base is merged again for every preview and save.
function deepMerge(base, over) {
  const out = { ...base };
  for (const [key, value] of Object.entries(over)) {
    out[key] = isMap(out[key]) && isMap(value) ? deepMerge(out[key], value) : value;
  }
  return out;
}

function hasPath(obj, path) {
  let node = obj;
  for (const key of path) {
    if (!isMap(node) || !(key in node)) return false;
    node = node[key];
  }
  return true;
}

function fillProviders(providers, defaults) {
  const out = {};
  for (const [name, entry] of Object.entries(providers)) {
    if (name.includes('/')) {
      throw new MergeError('provider-name-slash', { name }, `proxy-providers: "${name}" must not contain "/"`);
    }
    if (!isMap(entry)) {
      throw new MergeError('provider-not-map', { name }, `proxy-providers.${name} must be a map`);
    }
    const filled = deepMerge(defaults, entry);
    if (!('path' in entry)) filled.path = `./providers/${name}.yaml`;
    out[name] = filled;
  }
  return out;
}

const isMatchRule = (rule) => typeof rule === 'string' && rule.split(',')[0].trim() === 'MATCH';

function insertRules(rules, prepend, append) {
  let cut = rules.length;
  for (let i = rules.length - 1; i >= 0; i--) {
    if (isMatchRule(rules[i])) {
      cut = i;
      break;
    }
  }
  return [...prepend, ...rules.slice(0, cut), ...append, ...rules.slice(cut)];
}

export function merge(base, override) {
  // An empty override.yaml parses to null/undefined.
  if (override === null || override === undefined) return base;
  if (!isMap(override)) {
    throw new MergeError('root-not-map', {}, 'override must be a map at the top level');
  }
  for (const path of MANAGED_FIELDS) {
    if (hasPath(override, path)) {
      const field = path.join('.');
      throw new MergeError('managed-field', { field }, `"${field}" is managed by the module and cannot be overridden`);
    }
  }

  const {
    'prepend-rules': prepend = [],
    'append-rules': append = [],
    'append-proxy-groups': appendGroups = [],
    ...plain
  } = override;
  for (const [key, value] of [['prepend-rules', prepend], ['append-rules', append], ['append-proxy-groups', appendGroups]]) {
    if (!Array.isArray(value)) {
      throw new MergeError('not-array', { key }, `"${key}" must be a list`);
    }
  }

  const out = deepMerge(base, plain);
  if (isMap(out['proxy-providers'])) {
    out['proxy-providers'] = fillProviders(out['proxy-providers'], out['x-provider-defaults'] ?? {});
  }
  if (prepend.length > 0 || append.length > 0) {
    out.rules = insertRules(out.rules ?? [], prepend, append);
  }
  if (appendGroups.length > 0) {
    const groups = out['proxy-groups'] ?? [];
    if (!Array.isArray(groups)) {
      throw new MergeError('not-array', { key: 'proxy-groups' }, '"proxy-groups" must be a list');
    }
    // A new list: the base's own list is shared with every later merge.
    out['proxy-groups'] = [...groups, ...appendGroups];
  }
  // What the module excludes in base.yaml stays excluded whatever the user lists.
  for (const key of ['exclude-package', 'exclude-uid']) {
    if (!isMap(plain.tun) || !(key in plain.tun)) continue;
    const excluded = plain.tun[key];
    if (!Array.isArray(excluded)) {
      throw new MergeError('not-array', { key: `tun.${key}` }, `"tun.${key}" must be a list`);
    }
    out.tun = { ...out.tun, [key]: [...new Set([...(base.tun?.[key] ?? []), ...excluded])] };
  }
  return out;
}
