import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ListingFormValues } from "@/app/admin/listings/actions";
import type { ListingCategory } from "@/lib/listings/queries";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Add it to .env.local — see .env.local.example.",
    );
  }
  return new Anthropic({ apiKey });
}

export type GenerateListingInput = {
  description: string;
  image?: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" };
  /** Must be non-empty — the model can only pick a category that really exists. */
  categories: ListingCategory[];
};

/**
 * Calls Claude to turn a free-text description and/or a flyer image into
 * draft listing fields. Never touches images/tags/status — this only fills
 * fields on the `listings` row itself, for a human to review before saving.
 * Status is always "draft" regardless of what the input implies: nothing
 * this generates should be able to reach the public site un-reviewed.
 */
export async function generateListingDraft({
  description,
  image,
  categories,
}: GenerateListingInput): Promise<ListingFormValues> {
  if (categories.length === 0) {
    throw new Error("No categories exist yet — create one first.");
  }
  const categoryIds = categories.map((c) => c.id) as [string, ...string[]];
  const categoryList = categories.map((c) => `${c.id} = ${c.name}`).join("\n");

  const schema = z.object({
    title: z.string().describe("A concise, human-friendly listing title."),
    description: z
      .string()
      .describe("2-4 sentences describing the listing for a public directory."),
    location: z
      .string()
      .nullable()
      .describe("Neighbourhood or address if one is mentioned/shown, else null."),
    category_id: z
      .enum(categoryIds)
      .nullable()
      .describe(
        "The id of the single best-matching category from the provided list, or null if none fit well.",
      ),
    keywords: z.array(z.string()).describe("3-8 short search keywords."),
    expires_at: z
      .string()
      .nullable()
      .describe("ISO date (YYYY-MM-DD) only if an end date/expiry is clearly stated, else null."),
  });

  const content: Anthropic.MessageParam["content"] = [];
  if (image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.base64 },
    });
  }
  content.push({
    type: "text",
    text: [
      "Extract structured listing data for a business/event directory from the material below.",
      description ? `Description provided by staff:\n${description}` : null,
      image ? "An image of a flyer or promotional material is attached." : null,
      "",
      "Available categories — pick the id of the single best match, or null if none fit:",
      categoryList,
      "",
      "Only use facts stated or clearly shown in the input. Do not invent an address, price, " +
        "dates, or amenities that aren't actually there.",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const client = getClient();
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2048,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(schema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("Claude didn't return a usable result — try rephrasing, or a clearer image.");
  }

  return {
    title: parsed.title,
    slug: "", // regenerated from the title on save, same as manual entry
    category_id: parsed.category_id ?? "",
    location: parsed.location ?? "",
    // Business-identity fields are never guessed by the model.
    company_name: "",
    company_uen: "",
    social_links: "",
    cta_label: "",
    cta_url: "",
    // Set by staff on a client's request, never the model's; kept from the
    // saved listing by edit-listing-client.tsx like homepage_featured.
    redirect_url: "",
    // AEO fields are written by staff; kept from the saved listing.
    quick_answer: "",
    faqs_json: "",
    offer_price: "",
    offer_discount: "",
    redemption_info: "",
    audience: "",
    key_points_json: "",
    published_date: "",
    // SEO fields are kept from the saved listing (edit-listing-client.tsx).
    seo_title: "",
    seo_description: "",
    focus_keyword: "",
    og_title: "",
    og_description: "",
    og_image_url: "",
    keywords: parsed.keywords.join(", "),
    description: parsed.description,
    status: "draft",
    expires_at: parsed.expires_at ?? "",
    view_count: "0", // kept from the saved listing by edit-listing-client.tsx
    // An editorial choice, never the model's; the edit form keeps whatever's
    // saved (see edit-listing-client.tsx), so this blank is never applied.
    homepage_featured: "",
  };
}
