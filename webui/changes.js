// countChanges(saved, draft): how many edits the unsaved-changes bar reports, on parsed overrides.

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isMap(a) && isMap(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

// Each added, removed or changed subscription counts once.
function countProviders(before, after) {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...names].filter((name) => !deepEqual(before[name], after[name])).length;
}

// Each added or removed rule counts once; a pure reorder counts once.
function countRules(before, after) {
  const remaining = new Map();
  for (const rule of before) remaining.set(rule, (remaining.get(rule) ?? 0) + 1);
  let added = 0;
  for (const rule of after) {
    const left = remaining.get(rule) ?? 0;
    if (left > 0) remaining.set(rule, left - 1);
    else added++;
  }
  const removed = [...remaining.values()].reduce((sum, n) => sum + n, 0);
  if (added + removed > 0) return added + removed;
  return deepEqual(before, after) ? 0 : 1;
}

const RULE_KEYS = new Set(['prepend-rules', 'append-rules']);

export function countChanges(saved, draft) {
  const before = saved ?? {};
  const after = draft ?? {};
  let count = 0;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[key];
    const b = after[key];
    if (key === 'proxy-providers' && (a == null || isMap(a)) && (b == null || isMap(b))) {
      count += countProviders(a ?? {}, b ?? {});
    } else if (RULE_KEYS.has(key) && (a == null || Array.isArray(a)) && (b == null || Array.isArray(b))) {
      count += countRules(a ?? [], b ?? []);
    } else if (!deepEqual(a, b)) {
      count += 1;
    }
  }
  return count;
}
