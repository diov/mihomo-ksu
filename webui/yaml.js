// The only place that parses or prints YAML (docs/override.md, "文件").
import { loadAll, dump, CORE_SCHEMA, mergeTag, YAMLException } from './vendor/js-yaml.js';

// js-yaml 5's default Core Schema has no `<<`; base.yaml's proxy groups rely on it, as go-yaml v3 allows.
const schema = CORE_SCHEMA.withTags(mergeTag);

export { YAMLException };

// Empty or comment-only text is an empty stream: null, where js-yaml 5's load() would throw.
export function parse(text) {
  const docs = loadAll(text, undefined, { schema });
  if (docs.length > 1) throw new YAMLException('expected a single YAML document, found several separated by ---');
  return docs[0] ?? null;
}

// No anchors (merged subscriptions share one defaults object) and no folding of long URLs.
export function stringify(value) {
  return dump(value, { noRefs: true, lineWidth: -1 });
}
