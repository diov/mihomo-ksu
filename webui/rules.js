// prepend-rules / append-rules edits on a parsed override; the card and edit page live in rules-card.js.
// Every function returns new objects and leaves its input untouched.

export const RULE_TYPES = ['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'GEOSITE', 'IP-CIDR', 'IP-CIDR6', 'GEOIP', 'DST-PORT', 'PROCESS-NAME'];
// Types that accept the no-resolve option.
export const IP_TYPES = ['IP-CIDR', 'IP-CIDR6', 'GEOIP'];
export const POSITIONS = ['prepend', 'append'];
const KEYS = { prepend: 'prepend-rules', append: 'append-rules' };

// { type, value, policy, noResolve }, or null for anything the form cannot express.
export function parseRule(rule) {
  if (typeof rule !== 'string') return null;
  const parts = rule.split(',').map((p) => p.trim());
  const [type, value, policy, option] = parts;
  if (!RULE_TYPES.includes(type) || !value || !policy || parts.length > 4) return null;
  if (parts.length === 4 && !(option === 'no-resolve' && IP_TYPES.includes(type))) return null;
  return { type, value, policy, noResolve: parts.length === 4 };
}

export function formatRule({ type, value, policy, noResolve }) {
  return [type, value, policy, ...(noResolve && IP_TYPES.includes(type) ? ['no-resolve'] : [])].join(',');
}

// { prepend: [...], append: [...] } of { rule, parsed }; null when either key is not a list.
export function listRules(override) {
  const out = {};
  for (const position of POSITIONS) {
    const list = override?.[KEYS[position]] ?? [];
    if (!Array.isArray(list)) return null;
    out[position] = list.map((rule) => ({ rule, parsed: parseRule(rule) }));
  }
  return out;
}

// { value? } with an error code when the match value is unusable; empty when valid.
export function validateRule({ value }) {
  if (!value) return { value: 'value-required' };
  if (value.includes(',')) return { value: 'value-comma' };
  return {};
}

function withList(override, position, list) {
  const { [KEYS[position]]: old, ...rest } = override ?? {};
  return list.length ? { ...rest, [KEYS[position]]: list } : rest;
}

// original: { position, index } of the rule being edited, or null to add. New rules, and rules
// moved to the other position, go to the end of their list.
export function saveRule(override, original, position, rule) {
  const text = formatRule(rule);
  if (original && original.position === position) {
    const list = [...override[KEYS[position]]];
    list[original.index] = text;
    return withList(override, position, list);
  }
  const base = original ? removeRule(override, original.position, original.index) : override;
  return withList(base, position, [...(base?.[KEYS[position]] ?? []), text]);
}

export function removeRule(override, position, index) {
  return withList(override, position, override[KEYS[position]].filter((_, i) => i !== index));
}

// Per position, the indexes of draft rules with no counterpart in the saved list.
export function changedRules(saved, draft) {
  const out = {};
  for (const position of POSITIONS) {
    const remaining = [...(Array.isArray(saved?.[KEYS[position]]) ? saved[KEYS[position]] : [])];
    const list = Array.isArray(draft?.[KEYS[position]]) ? draft[KEYS[position]] : [];
    out[position] = new Set();
    list.forEach((rule, i) => {
      const at = remaining.indexOf(rule);
      if (at === -1) out[position].add(i);
      else remaining.splice(at, 1);
    });
  }
  return out;
}

// Policies a rule can point to: the proxy groups of the merged config, then the built-ins.
export function policyOptions(config) {
  const groups = Array.isArray(config?.['proxy-groups']) ? config['proxy-groups'].map((g) => g?.name).filter(Boolean) : [];
  return [...new Set([...groups, 'DIRECT', 'REJECT'])];
}
