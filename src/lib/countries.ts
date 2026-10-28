// Country list for pickers, built from the browser's own region names so it
// needs no data file. Codes are ISO 3166-1 alpha-2 (what setlist.fm uses).

let cache: { value: string; label: string }[] | null = null;

/** Most-used first, then everything else A-Z. */
const PINNED = ["US", "CA", "GB", "AU", "IE", "DE", "NL", "FR", "ES", "MX", "BR", "JP"];

export function countryOptions(): { value: string; label: string }[] {
  if (cache) return cache;
  const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  const all: { value: string; label: string }[] = [];
  const A = 65;
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(A + i, A + j);
      let label: string | undefined;
      try {
        label = names.of(code);
      } catch {
        label = undefined;
      }
      // Skip unknown codes and grouping codes like "EU", "UN", "QO".
      if (!label || label === code || /^(EU|EZ|UN|QO|XA|XB|ZZ|AA|XK)$/.test(code)) continue;
      all.push({ value: code, label });
    }
  }
  all.sort((a, b) => a.label.localeCompare(b.label));
  const pinned = PINNED.map((c) => all.find((o) => o.value === c)).filter((o): o is { value: string; label: string } => !!o);
  cache = [...pinned, ...all.filter((o) => !PINNED.includes(o.value))];
  return cache;
}
