import { getCategories, getLlmsListings } from "@/lib/listings/queries";
import { SITE_URL } from "@/lib/seo/listing-seo";

// Built from the database on each request, like the sitemap.
export const dynamic = "force-dynamic";

/** One line of plain text: collapses whitespace and trims to `max`. */
function oneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-SG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * /llms.txt — a plain-text guide to the site for AI assistants and answer
 * engines (the llmstxt.org convention): what FDSG is, its main pages and
 * categories, and every current listing with a one-line summary.
 */
export async function GET() {
  const [categories, listings] = await Promise.all([getCategories(), getLlmsListings()]);

  const lines: string[] = [
    "# FDSG Directory",
    "",
    "> FDSG (directories.fd.sg) is a Singapore directory of flyer deals, e-vouchers and promotions from local businesses. Each listing describes one offer: who is offering it, what it is, where, and until when. Businesses marked \"Verified business\" have had their UEN checked against ACRA's register.",
    "",
    "## Main pages",
    "",
    `- [All deals](${SITE_URL}/): browse and search every current listing`,
    `- [About FDSG](${SITE_URL}/about)`,
    `- [FAQ](${SITE_URL}/faq): how the directory works`,
    `- [Contact](${SITE_URL}/contact)`,
    `- [Sitemap](${SITE_URL}/sitemap.xml)`,
    "",
    "## Categories",
    "",
    ...categories.map((c) => `- [${c.name}](${SITE_URL}/?category=${encodeURIComponent(c.slug)})`),
    "",
    "## Current listings",
    "",
    ...listings.map((l) => {
      const summary = l.quickAnswer || l.description || "";
      const facts = [
        l.category,
        l.location,
        l.expiresAt ? `until ${formatDate(l.expiresAt)}` : null,
      ].filter(Boolean);
      const meta = facts.length > 0 ? ` (${facts.join(" · ")})` : "";
      const forWhom = l.audience ? ` For: ${oneLine(l.audience, 160)}.` : "";
      return `- [${oneLine(l.title, 120)}](${SITE_URL}/listings/${l.slug})${meta}${summary ? `: ${oneLine(summary, 300)}` : ""}${forWhom}`;
    }),
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Fresh enough for crawlers without hitting the database on every hit.
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
