/**
 * Validates a post-login `next` target so the login flow can't be used as an
 * open redirect. Only same-site paths are allowed; anything else (absolute
 * URLs, `//evil.com`, `/\evil.com`, tab/newline tricks) falls back.
 */
export function safeNextPath(next: unknown, fallback = "/admin"): string {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;

  // Resolve like a browser would; if the origin changes, it wasn't a local path.
  const base = "http://localhost";
  try {
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
