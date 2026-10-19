import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listings } from "@/lib/db/schema";

/**
 * Where a published listing's page should send visitors instead of
 * rendering, or `null` to render it normally: the fd.sg source for a synced
 * listing (external_url), else the client's own landing page (redirect_url).
 *
 * Used by proxy.ts so the redirect is a real HTTP 307 sent before the page
 * starts streaming. A redirect() inside the page itself can only fall back to
 * a client-side meta-refresh once the root loading.tsx has begun streaming,
 * which search engines and link previews read as a normal 200 page.
 */
export async function getListingOutboundUrl(
  slug: string,
): Promise<{ url: string; countsAsView: boolean } | null> {
  const [row] = await db
    .select({ externalUrl: listings.externalUrl, redirectUrl: listings.redirectUrl })
    .from(listings)
    .where(and(eq(listings.slug, slug), eq(listings.status, "published")))
    .limit(1);
  if (row?.externalUrl) return { url: row.externalUrl, countsAsView: false };
  // A client-redirected listing is still one of ours, so a visit through
  // here counts as a view of it (lib/listings/views.ts).
  if (row?.redirectUrl) return { url: row.redirectUrl, countsAsView: true };
  return null;
}
