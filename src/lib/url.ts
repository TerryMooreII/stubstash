// The app can be served from a sub-path (GitHub Pages: /stubstash/).
// BASE_URL always ends with "/".

/** Full absolute URL for an in-app path like "/app/auth/callback" (for emails, invite links, QR codes). */
export function appUrl(path: string): string {
  return location.origin + import.meta.env.BASE_URL.replace(/\/$/, "") + path;
}

/** Public host shown on share cards and profile links. */
export const SITE_HOST = "stubstash.terrymooreii.dev";

/** A `?next=` value that's safe to redirect to: an in-app path, not "//evil.com". */
export function safeNext(next: unknown, fallback = "/app"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
