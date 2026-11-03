// Shared by the fd.sg sync and the delete clean-up (lib/listings/cleanup.ts).

/** Normalised form of an fd.sg listing URL for matching (scheme, www,
 *  case and trailing slash ignored). */
export function normalizeSourceUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${decodeURIComponent(u.pathname).replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  }
}
