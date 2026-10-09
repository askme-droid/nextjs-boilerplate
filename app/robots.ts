import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Staff and account pages: nothing a search engine should index.
      disallow: ["/admin/", "/api/", "/my-listings/"],
    },
    sitemap: "https://directories.fd.sg/sitemap.xml",
  };
}
