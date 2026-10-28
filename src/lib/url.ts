// The app can be served from a sub-path (GitHub Pages: /stubstash/).
// BASE_URL always ends with "/".

/** Full absolute URL for an in-app path like "/app/auth/callback" (for emails, invite links, QR codes). */
export function appUrl(path: string): string {
  return location.origin + import.meta.env.BASE_URL.replace(/\/$/, "") + path;
}
