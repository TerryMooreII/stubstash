// Builds an update patch from an edit form: only the fields that changed.

/**
 * Trimmed form fields that differ from `row`. A null/undefined row value counts
 * as "", numbers are compared as text. `required` fields are left out when empty.
 */
export function diffPatch<K extends string>(
  form: Record<K, string>,
  row: { [P in NoInfer<K>]?: unknown },
  opts: { required?: NoInfer<K>[] } = {},
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const k of Object.keys(form) as K[]) {
    const v = form[k].trim();
    const was = row[k] == null ? "" : String(row[k]);
    if (!v && opts.required?.includes(k)) continue;
    if (v !== was) out[k] = v;
  }
  return out;
}
