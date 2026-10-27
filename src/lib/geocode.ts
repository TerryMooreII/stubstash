// City search for "home base", using OpenStreetMap Nominatim from the browser.
// Nominatim asks for light use (max ~1 req/sec): callers should debounce.

export interface PlaceResult {
  label: string;
  city: string;
  country_code: string | null;
  lat: number;
  lng: number;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  suburb?: string;
  borough?: string;
  county?: string;
  state?: string;
  country_code?: string;
  "ISO3166-2-lvl4"?: string;
}

interface NominatimHit {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: NominatimAddress;
}

function stateCode(a: NominatimAddress): string | null {
  const iso = a["ISO3166-2-lvl4"];
  if (iso && iso.includes("-")) return iso.split("-")[1] ?? null;
  return null;
}

export async function searchPlaces(q: string): Promise<PlaceResult[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "5",
    featureType: "settlement",
    "accept-language": "en",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const hits = (await res.json()) as NominatimHit[];
  const seen = new Set<string>();
  const out: PlaceResult[] = [];
  for (const h of hits) {
    const a = h.address ?? {};
    const city = a.city ?? a.town ?? a.village ?? a.borough ?? a.suburb ?? a.municipality ?? a.hamlet ?? h.name ?? h.display_name.split(",")[0]!;
    const cc = a.country_code ? a.country_code.toUpperCase() : null;
    const region = cc === "US" ? stateCode(a) ?? a.state ?? null : cc;
    const label = region ? `${city}, ${region}` : city;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, city, country_code: cc, lat: Number(h.lat), lng: Number(h.lon) });
  }
  return out;
}
