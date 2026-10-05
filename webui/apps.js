// tun.exclude-package edits on a parsed override; the card and picker live in apps-card.js.
// Every function returns new objects and leaves its input untouched.

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The override's excluded packages; null when tun or its list has a shape the page cannot edit.
export function listExcluded(override) {
  if (override?.tun === undefined) return [];
  if (!isMap(override.tun)) return null;
  const list = override.tun['exclude-package'];
  if (list === undefined) return [];
  return Array.isArray(list) ? list : null;
}

// Keeps the current order and appends newly selected packages, so the YAML diff stays small.
export function setExcluded(override, selected) {
  const chosen = new Set(selected);
  const current = listExcluded(override) ?? [];
  const list = [...current.filter((p) => chosen.has(p)), ...[...chosen].filter((p) => !current.includes(p))];
  const { tun = {}, ...rest } = override ?? {};
  const { 'exclude-package': old, ...others } = tun;
  const next = list.length ? { ...others, 'exclude-package': list } : others;
  return Object.keys(next).length ? { ...rest, tun: next } : rest;
}

// Draft packages missing from the saved list.
export function changedExcluded(saved, draft) {
  const before = new Set(listExcluded(saved) ?? []);
  return new Set((listExcluded(draft) ?? []).filter((p) => !before.has(p)));
}
