import type { MetadataRoute } from "next";
import { getSitemapListings } from "@/lib/listings/queries";

const SITE_URL = "https://directories.fd.sg";

// Built from the database, so it must not be frozen at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listings = await getSitemapListings();
  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/faq`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.3 },
    ...listings.map((l) => ({
      url: `${SITE_URL}/listings/${l.slug}`,
      lastModified: l.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
