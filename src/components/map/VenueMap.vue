<script setup lang="ts">
// Leaflet venue map from the design ("Stubstash Map.html").
//   pins  - yellow glowing pins sized by visits, number inside
//   glow  - soft colored blobs
//   arcs  - road-trip arcs from the home you had at the time, with a year scrubber
// Optional region chips, top-venues panel and a "pick location" mode used to
// fix a venue's pin.
import L from "leaflet";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { MapHome, MapTrip, MapVenue } from "@/lib/types";
import { num, place } from "@/lib/format";

const props = withDefaults(
  defineProps<{
    venues: MapVenue[];
    /** Single home (used when `homes` isn't given). */
    home?: { lat: number; lng: number; city?: string | null } | null;
    /** Every home over time, oldest first. Takes over from `home`. */
    homes?: MapHome[] | null;
    /** Venue + home pairs for the arcs. Without them, arcs come from `home`. */
    trips?: MapTrip[] | null;
    mode?: "pins" | "glow" | "arcs";
    regions?: boolean;
    panel?: boolean;
    scrollZoom?: boolean;
    height?: string;
    /** When true, clicking the map emits pick-location instead of opening popups. */
    editPin?: boolean;
  }>(),
  { home: null, homes: null, trips: null, mode: "pins", regions: false, panel: false, scrollZoom: true, height: "100%", editPin: false },
);
const emit = defineEmits<{ "open-venue": [venueId: string]; "pick-location": [lat: number, lng: number] }>();

const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>';
// CARTO basemaps need a free key (carto.com/basemaps/apikey). Without one the
// tiles come back watermarked "API KEY REQUIRED".
const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY;
if (!CARTO_KEY) console.warn("VITE_CARTO_API_KEY is not set; map tiles will show 'API KEY REQUIRED'.");
const tileUrl = (style: string) =>
  `https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}{r}.png${CARTO_KEY ? `?key=${encodeURIComponent(CARTO_KEY)}` : ""}`;
const GLOW = ["#f4b811", "#76a9b9", "#ffa800", "#9db161", "#ff5f6c"];

const el = ref<HTMLDivElement>();
const map = shallowRef<L.Map | null>(null);
let tiles: L.TileLayer | null = null;
let layer: L.LayerGroup | null = null;
let ro: ResizeObserver | null = null;
let fitted = false;
const markers = new Map<string, L.Marker | L.CircleMarker>();

// City/street names on the map. CARTO has no dark style without roads, so
// this only toggles labels.
const labels = ref(true);
const activeRegion = ref("all");

type Placed = MapVenue & { lat: number; lng: number };
const placed = computed<Placed[]>(() =>
  props.venues.filter((v): v is Placed => v.lat != null && v.lng != null).sort((a, b) => b.visits - a.visits),
);

// ---------- summary numbers (panel + scrubber)
const cityCount = computed(() => new Set(props.venues.map((v) => `${(v.city ?? "").toLowerCase()}|${v.country_code}`)).size);
const countryCount = computed(() => new Set(props.venues.map((v) => v.country_code).filter(Boolean)).size);
const farthest = computed(() =>
  props.trips?.length
    ? Math.max(0, ...props.trips.map((t) => t.miles ?? 0))
    : Math.max(0, ...props.venues.map((v) => v.miles_from_home ?? 0)),
);
const topVenues = computed(() => placed.value.slice(0, 6));

// ---------- homes over time
interface HomePin { city: string | null; lat: number; lng: number; from: number | null; to: number | null; current: boolean }
const yearOf = (d: string | null) => (d ? Number(d.slice(0, 4)) : null);
const homePins = computed<HomePin[]>(() => {
  if (props.homes?.length) {
    return props.homes.map((h) => ({ city: h.city, lat: h.lat, lng: h.lng, from: yearOf(h.moved_in), to: yearOf(h.moved_out), current: h.is_current }));
  }
  return props.home ? [{ city: props.home.city ?? null, lat: props.home.lat, lng: props.home.lng, from: null, to: null, current: true }] : [];
});
const currentHome = computed(() => homePins.value.find((h) => h.current) ?? homePins.value[homePins.value.length - 1] ?? null);
/** Lived there at some point during year y (a moving year has two). */
const livedIn = (h: HomePin, y: number) => (h.from == null || h.from <= y) && (h.to == null || h.to >= y);
const shortCity = (c: string | null) => (c ?? "Home").split(",")[0]!.trim();
function yearsLabel(h: HomePin): string {
  if (h.from == null && h.to == null) return "";
  return `${h.from ?? "before"}–${h.to ?? "now"}`.replace(/^before–/, "until ");
}

// Arcs: one per venue + home. Without trips, every venue goes to the single home.
interface Trip { venue_id: string; lat: number; lng: number; years: number[]; miles: number | null }
const trips = computed<Trip[]>(() => {
  if (props.trips?.length) {
    return props.trips.map((t) => ({ venue_id: t.venue_id, lat: t.home_lat, lng: t.home_lng, years: t.years, miles: t.miles }));
  }
  const h = currentHome.value;
  if (!h) return [];
  return placed.value.map((v) => ({ venue_id: v.venue_id, lat: h.lat, lng: h.lng, years: [v.first_year], miles: v.miles_from_home }));
});

// ---------- arcs scrubber
const minYear = computed(() => Math.min(...placed.value.map((v) => v.first_year)));
const maxYear = computed(() => Math.max(...placed.value.map((v) => v.last_year)));
const year = ref(new Date().getFullYear());
const venuesByYear = computed(() => placed.value.filter((v) => v.first_year <= year.value));
const tripsByYear = computed(() => trips.value.filter((t) => t.years[0]! <= year.value));
const farthestByYear = computed(() => Math.max(0, ...tripsByYear.value.map((t) => t.miles ?? 0)));
/** Venues you went to in the scrubbed year. */
const thisYear = computed(() => new Set(trips.value.filter((t) => t.years.includes(year.value)).map((t) => t.venue_id)));
const homesThisYear = computed(() => (homePins.value.length > 1 ? homePins.value.filter((h) => livedIn(h, year.value)) : []));

// ---------- regions
function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}
interface Region { key: string; label: string; bounds: L.LatLngBounds }
function boundsOf(points: [number, number][]): L.LatLngBounds {
  return L.latLngBounds(points.map(([a, b]) => L.latLng(a, b)));
}
const regionList = computed<Region[]>(() => {
  const vs = placed.value;
  const out: Region[] = [];
  if (!vs.length) return out;
  // One "area" chip per home, newest first.
  const homes = [...homePins.value].reverse();
  homes.forEach((h, i) => {
    const near = vs.filter((v) => milesBetween(h.lat, h.lng, v.lat, v.lng) <= 150);
    const pts: [number, number][] = [[h.lat, h.lng], ...near.map((v): [number, number] => [v.lat, v.lng])];
    const b = near.length ? boundsOf(pts) : boundsOf([[h.lat - 0.3, h.lng - 0.4], [h.lat + 0.3, h.lng + 0.4]]);
    out.push({ key: `home${i}`, label: homes.length > 1 ? `${shortCity(h.city)} area` : "Home area", bounds: b });
  });
  const americas = vs.filter((v) => v.lng < -30);
  if (americas.length && americas.length < vs.length) {
    out.push({ key: "americas", label: "Americas", bounds: boundsOf(americas.map((v) => [v.lat, v.lng])) });
  }
  const europe = vs.filter((v) => v.lng >= -25 && v.lng <= 45 && v.lat >= 34);
  if (europe.length && europe.length < vs.length) {
    out.push({ key: "europe", label: "Europe", bounds: boundsOf(europe.map((v) => [v.lat, v.lng])) });
  }
  out.push({ key: "all", label: "Everywhere", bounds: boundsOf(vs.map((v) => [v.lat, v.lng])) });
  return out;
});

function goRegion(r: Region) {
  activeRegion.value = r.key;
  map.value?.flyToBounds(r.bounds, { padding: [40, 40], duration: 0.8, maxZoom: 13 });
}

// ---------- rendering
function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function popupHtml(v: Placed): string {
  const artists = v.recent_artists?.filter(Boolean) ?? [];
  return `<div class="ssm-pop">
    <div class="ssm-pop__k">${v.visits} visit${v.visits === 1 ? "" : "s"} · since ${v.first_year}</div>
    <div class="ssm-pop__n">${esc(v.name)}</div>
    <div class="ssm-pop__c">${esc(place(v.city, v.state_code, v.country_code))}</div>
    ${artists.length ? `<div class="ssm-pop__c ssm-pop__a">Saw: ${artists.map(esc).join(", ")}</div>` : ""}
    <button type="button" class="ssm-pop__b" data-venue="${esc(v.venue_id)}">Open venue →</button>
  </div>`;
}

function attachPopup(m: L.Marker | L.CircleMarker, v: Placed) {
  if (props.editPin) return;
  m.bindPopup(popupHtml(v), { className: "ssm-popup", maxWidth: 280 });
}

function arc(a: [number, number], b: [number, number]): [number, number][] {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[1] - a[1], dy = b[0] - a[0];
  const cx = mx + dx * 0.25, cy = my - dy * 0.25;
  const pts: [number, number][] = [];
  for (let t = 0; t <= 1.001; t += 0.04) {
    pts.push([
      (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * b[0],
      (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * b[1],
    ]);
  }
  return pts;
}

function render() {
  const m = map.value;
  if (!m || !layer) return;
  layer.clearLayers();
  markers.clear();

  if (props.mode === "pins") {
    for (const v of placed.value) {
      const s = Math.round(22 + Math.sqrt(v.visits) * 11);
      const icon = L.divIcon({
        className: "",
        html: `<div class="ssm-pin" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.42)}px">${v.visits}</div>`,
        iconSize: [s, s],
        iconAnchor: [s / 2, s / 2],
      });
      const mk = L.marker([v.lat, v.lng], { icon, zIndexOffset: v.visits * 10, keyboard: true, title: v.name }).addTo(layer);
      attachPopup(mk, v);
      markers.set(v.venue_id, mk);
    }
  } else if (props.mode === "glow") {
    placed.value.forEach((v, i) => {
      const s = Math.round(40 + Math.min(v.visits, 12) * 16);
      const c = GLOW[i % GLOW.length];
      const icon = L.divIcon({
        className: "",
        html: `<div class="ssm-blob" style="width:${s}px;height:${s}px;background:radial-gradient(circle, ${c} 0%, ${c}88 18%, ${c}22 45%, transparent 70%)"></div>`,
        iconSize: [s, s],
        iconAnchor: [s / 2, s / 2],
      });
      const mk = L.marker([v.lat, v.lng], { icon, title: v.name }).addTo(layer!);
      attachPopup(mk, v);
      markers.set(v.venue_id, mk);
    });
  } else {
    const byId = new Map(placed.value.map((v) => [v.venue_id, v]));
    // Older trips first so this year's arcs draw on top.
    const ts = [...tripsByYear.value].sort((a, b) => Number(a.years.includes(year.value)) - Number(b.years.includes(year.value)));
    for (const t of ts) {
      const v = byId.get(t.venue_id);
      if (!v) continue;
      const recent = t.years.includes(year.value);
      L.polyline(arc([t.lat, t.lng], [v.lat, v.lng]), {
        color: recent ? "#f4b811" : "#76a9b9",
        weight: recent ? 3 : 1.6,
        opacity: recent ? 1 : 0.7,
        dashArray: recent ? undefined : "4 6",
        interactive: false,
        pane: "ssm-arcs",
      }).addTo(layer);
    }
    for (const v of venuesByYear.value) {
      const recent = thisYear.value.has(v.venue_id);
      const mk = L.circleMarker([v.lat, v.lng], {
        radius: Math.min(14, (10 + v.visits * 2) / 2),
        color: "#0a090c",
        weight: 2,
        fillColor: recent ? "#f4b811" : "#b8d3db",
        fillOpacity: 1,
      }).addTo(layer);
      attachPopup(mk, v);
      markers.set(v.venue_id, mk);
    }
  }

  for (const h of homePins.value) {
    // Through time: only homes you'd moved into by then; bright if you lived there that year.
    if (props.mode === "arcs" && h.from != null && h.from > year.value) continue;
    const active = props.mode === "arcs" ? livedIn(h, year.value) : h.current;
    const icon = L.divIcon({
      className: "",
      html: `<div class="ssm-home${active ? "" : " ssm-home--past"}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const when = yearsLabel(h);
    L.marker([h.lat, h.lng], { icon, interactive: true, keyboard: false, pane: "ssm-homes", zIndexOffset: active ? 10 : 0 })
      .addTo(layer)
      .bindTooltip(`${h.current ? "Home base" : "Lived here"}${h.city ? " · " + esc(h.city) : ""}${when ? " · " + when : ""}`);
  }
}

function maybeFit() {
  const m = map.value;
  if (!m || fitted || !el.value?.clientWidth || !el.value.clientHeight) return;
  const vs = placed.value;
  if (!vs.length) {
    if (currentHome.value) m.setView([currentHome.value.lat, currentHome.value.lng], 9);
    return;
  }
  m.invalidateSize();
  if (vs.length === 1) m.setView([vs[0]!.lat, vs[0]!.lng], 14);
  else m.fitBounds(boundsOf(vs.map((v) => [v.lat, v.lng])), { padding: [30, 30], maxZoom: 13 });
  fitted = true;
}

function focusVenue(v: Placed) {
  map.value?.flyTo([v.lat, v.lng], 13, { duration: 1 });
  setTimeout(() => markers.get(v.venue_id)?.openPopup(), 1050);
}

/** Re-fits the map to all venues. */
function fit() {
  fitted = false;
  maybeFit();
}
defineExpose({ fit });

onMounted(() => {
  const m = L.map(el.value!, {
    zoomControl: false,
    attributionControl: true,
    worldCopyJump: true,
    scrollWheelZoom: props.scrollZoom,
    center: [39, -96],
    zoom: 4,
  });
  m.attributionControl.setPrefix(false);
  L.control.zoom({ position: "bottomright" }).addTo(m);
  tiles = L.tileLayer(tileUrl(labels.value ? "dark_all" : "dark_nolabels"), {
    attribution: ATTRIBUTION,
    maxZoom: 19,
    detectRetina: false,
  }).addTo(m);
  layer = L.layerGroup().addTo(m);
  // Stacking, bottom to top: tiles, arcs, home pins, venue markers (overlay 400, markers 600).
  m.createPane("ssm-arcs").style.zIndex = "380";
  m.createPane("ssm-homes").style.zIndex = "390";

  m.on("popupopen", (e: L.PopupEvent) => {
    const btn = e.popup.getElement()?.querySelector<HTMLButtonElement>("[data-venue]");
    btn?.addEventListener("click", () => emit("open-venue", btn.dataset.venue!), { once: true });
  });
  m.on("click", (e: L.LeafletMouseEvent) => {
    if (props.editPin) emit("pick-location", e.latlng.lat, e.latlng.lng);
  });

  map.value = m;
  year.value = maxYear.value === -Infinity ? new Date().getFullYear() : maxYear.value;
  render();
  ro = new ResizeObserver(() => {
    m.invalidateSize();
    maybeFit();
  });
  ro.observe(el.value!);
  maybeFit();
});

onBeforeUnmount(() => {
  ro?.disconnect();
  map.value?.remove();
  map.value = null;
});

watch(() => [props.venues, props.mode, props.home, props.homes, props.trips, props.editPin, year.value], render);
watch(
  () => placed.value.length,
  (n, o) => {
    if (n && !o) fit();
  },
);
watch(
  () => props.mode,
  (m) => {
    if (m === "arcs" && placed.value.length) year.value = maxYear.value;
  },
);
watch(labels, (on) => tiles?.setUrl(tileUrl(on ? "dark_all" : "dark_nolabels")));
watch(
  () => props.scrollZoom,
  (on) => (on ? map.value?.scrollWheelZoom.enable() : map.value?.scrollWheelZoom.disable()),
);
</script>

<template>
  <div class="venue-map" :class="{ 'is-editing': editPin }" :style="{ height }">
    <div ref="el" class="venue-map__canvas" role="region" aria-label="Map of venues you've been to" />

    <div v-if="regions && placed.length" class="venue-map__regions">
      <button
        v-for="r in regionList"
        :key="r.key"
        type="button"
        class="vm-chip"
        :class="{ on: activeRegion === r.key }"
        @click="goRegion(r)"
      >
        {{ r.label }}
      </button>
      <button type="button" class="vm-chip vm-chip--gap" :class="{ on: labels }" :aria-pressed="labels" @click="labels = !labels">
        Labels
      </button>
    </div>

    <div v-if="panel && mode === 'pins' && placed.length" class="venue-map__panel">
      <div class="ss-kicker">Your venue map</div>
      <h3>{{ num(venues.length) }} venues · {{ num(cityCount) }} cities</h3>
      <div class="vm-mono">
        {{ num(countryCount) }} {{ countryCount === 1 ? "country" : "countries" }}<template v-if="farthest"> · farthest {{ num(farthest) }} mi</template>
      </div>
      <button v-for="(v, i) in topVenues" :key="v.venue_id" type="button" class="vm-row" @click="focusVenue(v)">
        <span class="vm-row__k">{{ String(i + 1).padStart(2, "0") }}</span>
        <span class="vm-row__n">{{ v.name }}</span>
        <span class="vm-row__v">{{ v.visits }}×</span>
      </button>
    </div>

    <div v-if="mode === 'arcs' && placed.length" class="venue-map__scrub">
      <div class="vm-scrub__text">
        <span class="vm-scrub__yr">{{ year }}</span>
        <span>
          {{ num(venuesByYear.length) }} venue{{ venuesByYear.length === 1 ? "" : "s" }}<template v-if="farthestByYear"> · farthest {{ num(farthestByYear) }} mi from home</template>
        </span>
      </div>
      <div v-if="homesThisYear.length" class="vm-mono vm-scrub__home">
        {{ homesThisYear.length > 1 ? "Moved" : "Living in" }} {{ homesThisYear.map((h) => shortCity(h.city)).join(" → ") }}
      </div>
      <input
        v-model.number="year"
        type="range"
        :min="minYear"
        :max="maxYear"
        step="1"
        aria-label="Year"
        :disabled="minYear === maxYear"
      />
      <div class="vm-mono vm-scrub__ends">
        <span>{{ minYear }}</span><span>Drag through time</span><span>{{ maxYear }}</span>
      </div>
    </div>

    <div v-if="editPin" class="venue-map__hint">Tap the map where the venue really is</div>
  </div>
</template>

<style scoped>
.venue-map {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: var(--ss-bg);
}
.venue-map__canvas {
  position: absolute;
  inset: 0;
  background: var(--ss-bg);
}
.is-editing .venue-map__canvas {
  cursor: crosshair;
}

.venue-map__regions {
  position: absolute;
  z-index: 500;
  top: 16px;
  left: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  pointer-events: none;
}
.venue-map__regions::-webkit-scrollbar { display: none; }
.vm-chip {
  pointer-events: auto;
  flex-shrink: 0;
  padding: 8px 14px;
  border-radius: var(--ss-radius-pill);
  background: rgba(30, 32, 34, 0.92);
  color: var(--ss-text-2);
  border: 1px solid var(--ss-line);
  font: 600 13px var(--ss-font);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.vm-chip.on {
  background: var(--ss-accent);
  color: var(--ss-on-accent);
  border-color: var(--ss-accent);
}
.vm-chip--gap { margin-left: 8px; }

.venue-map__panel {
  position: absolute;
  z-index: 500;
  left: 16px;
  bottom: 24px;
  width: 270px;
  max-width: calc(100% - 32px);
  background: rgba(20, 21, 22, 0.94);
  border: 1px solid var(--ss-line);
  border-radius: var(--ss-radius-md);
  padding: 16px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.venue-map__panel h3 {
  margin: 4px 0 2px;
  font-weight: 900;
  font-size: 22px;
  letter-spacing: -0.01em;
  line-height: 1.1;
}
.vm-mono {
  font: 600 10px var(--ss-font-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ss-text-muted);
}
.venue-map__panel .vm-mono { margin-bottom: 8px; }
.vm-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  border: 0;
  border-top: 1px solid var(--ss-line);
  background: transparent;
  color: var(--ss-text);
  text-align: left;
}
.vm-row:hover .vm-row__n { color: var(--ss-accent); }
.vm-row__k { font: 600 11px var(--ss-font-mono); color: var(--ss-text-faint); width: 18px; }
.vm-row__n { flex: 1; min-width: 0; font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vm-row__v { font-weight: 900; color: var(--ss-accent); }
@media (max-width: 640px) {
  .venue-map__panel { display: none; }
}

.venue-map__scrub {
  position: absolute;
  z-index: 500;
  left: 50%;
  transform: translateX(-50%);
  bottom: 24px;
  width: min(520px, calc(100% - 32px));
  background: rgba(20, 21, 22, 0.94);
  border: 1px solid var(--ss-line);
  border-radius: var(--ss-radius-md);
  padding: 12px 16px;
}
.vm-scrub__text {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 6px;
  font-weight: 700;
  font-size: 14px;
}
.vm-scrub__yr { font-weight: 900; font-size: 28px; color: var(--ss-accent); line-height: 1; }
.venue-map__scrub input { width: 100%; accent-color: var(--ss-accent); }
.vm-scrub__ends { display: flex; justify-content: space-between; }
.vm-scrub__home { color: var(--ss-text-2); margin: -2px 0 6px; }

.venue-map__hint {
  position: absolute;
  z-index: 500;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  padding: 8px 14px;
  border-radius: var(--ss-radius-pill);
  background: var(--ss-accent);
  color: var(--ss-on-accent);
  font-weight: 900;
  font-size: 13px;
  white-space: nowrap;
  pointer-events: none;
}
</style>

<!-- Leaflet builds these elements outside Vue's scoped styles, so they're global (prefixed). -->
<style>
.venue-map .leaflet-container {
  font-family: var(--ss-font);
  background: var(--ss-bg);
}
.venue-map .leaflet-control-attribution {
  background: rgba(10, 9, 12, 0.75) !important;
  color: var(--ss-text-muted) !important;
  font-size: 10px;
}
.venue-map .leaflet-control-attribution a { color: var(--ss-text-2) !important; }
.venue-map .leaflet-control-zoom a {
  background: var(--ss-surface-2) !important;
  color: var(--ss-text) !important;
  border-color: var(--ss-line) !important;
}
.ssm-pin {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f4b811;
  color: #0a090c;
  font-weight: 900;
  border: 2px solid #0a090c;
  box-shadow: 0 0 0 4px rgba(244, 184, 17, 0.25), 0 0 24px rgba(244, 184, 17, 0.55);
  cursor: pointer;
  transition: transform 0.15s;
}
.ssm-pin:hover { transform: scale(1.12); }
.ssm-blob { border-radius: 50%; cursor: pointer; mix-blend-mode: screen; }
.ssm-home {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #76a9b9;
  border: 3px solid #0a090c;
  box-shadow: 0 0 0 3px #76a9b9;
}
.ssm-home--past {
  background: #4b5a5f;
  box-shadow: 0 0 0 3px #4b5a5f;
  opacity: 0.85;
}
.ssm-popup .leaflet-popup-content-wrapper,
.ssm-popup .leaflet-popup-tip {
  background: #1e2022;
  color: #eff2f5;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
}
.ssm-popup .leaflet-popup-content { margin: 14px 16px; min-width: 200px; }
.ssm-popup a.leaflet-popup-close-button { color: #9da1a5; }
.ssm-pop__k { font: 600 10px Monaco, Consolas, monospace; letter-spacing: 0.12em; color: #f4b811; text-transform: uppercase; }
.ssm-pop__n { font-weight: 900; font-size: 20px; line-height: 1.1; margin: 4px 0 2px; }
.ssm-pop__c { color: #b9bdc1; font-size: 13px; }
.ssm-pop__a { margin-top: 6px; }
.ssm-pop__b {
  margin-top: 10px;
  display: inline-flex;
  padding: 6px 12px;
  border-radius: 999px;
  background: #f4b811;
  color: #0a090c;
  font-weight: 700;
  font-size: 13px;
  border: 0;
  cursor: pointer;
}
</style>
