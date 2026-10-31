// Shared helpers for the admin artist and venue lists.
import type { AdminCatalogRow, AdminVenue } from "@/lib/admin";

type Tone = "teal" | "lavender" | "butter" | "dark" | "outline";
export interface TagInfo { label: string; tone: Tone }

/** Where the row came from. */
export function sourceTag(r: AdminCatalogRow, setlistTone: Tone): TagInfo {
  return r.source === "manual" ? { label: "ADDED BY USER", tone: "lavender" } : { label: "SETLIST.FM", tone: setlistTone };
}

/** Image found, none found, or still looking. */
export function imageTag(r: AdminCatalogRow): TagInfo {
  if (r.image_url) return { label: r.image_source ?? "image", tone: "outline" };
  return { label: r.image_checked_at ? "NO IMAGE" : "LOOKING…", tone: "butter" };
}

/** How good the venue's map pin is. */
export function pinTag(v: AdminVenue): TagInfo {
  if (v.lat != null && v.geo_source === "user") return { label: "PIN SET BY HAND", tone: "lavender" };
  if (v.lat != null) return { label: "EXACT PIN", tone: "teal" };
  return { label: "CITY ONLY", tone: "butter" };
}

/** True when there's an image URL but it isn't https. */
export function imageUrlInvalid(url: string): boolean {
  const u = url.trim();
  return !!u && !/^https:\/\//i.test(u);
}
