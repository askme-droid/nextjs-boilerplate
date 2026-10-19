import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listings } from "@/lib/db/schema";

/**
 * Listing view counts (ACADP-style "views"). One view per page load by a
 * visitor; not counted:
 *  - search engines and other bots (by user agent),
 *  - Next.js link prefetches (hovering a card in the grid),
 *  - HEAD requests.
 * Counted after the response is sent (next/server `after`), so it never
 * slows the page down, and a failed count never breaks it.
 */

const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|discord|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|go-http|axios|node-fetch|okhttp|java\//i;

export function shouldCountView(headers: Headers, method = "GET"): boolean {
  if (method !== "GET") return false;
  if (headers.get("next-router-prefetch") || headers.get("purpose") === "prefetch") return false;
  if (headers.get("sec-purpose")?.includes("prefetch")) return false;
  if (headers.get("x-middleware-prefetch")) return false;
  const ua = headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return false;
  return true;
}

export async function incrementViewsById(id: string): Promise<void> {
  try {
    await db
      .update(listings)
      .set({ viewCount: sql`${listings.viewCount} + 1` })
      .where(eq(listings.id, id));
  } catch (e) {
    console.error("view count failed:", e instanceof Error ? e.message : e);
  }
}

export async function incrementViewsBySlug(slug: string): Promise<void> {
  try {
    await db
      .update(listings)
      .set({ viewCount: sql`${listings.viewCount} + 1` })
      .where(eq(listings.slug, slug));
  } catch (e) {
    console.error("view count failed:", e instanceof Error ? e.message : e);
  }
}

/** "1 view", "1,234 views". */
export function formatViews(count: number): string {
  return `${count.toLocaleString("en-SG")} view${count === 1 ? "" : "s"}`;
}
