"use server";

import { requireStaff } from "@/lib/auth/require-staff";
import { suggestAeo, type AeoSource, type AeoSuggestion } from "@/lib/ai/suggest-aeo";

/** "Suggest from listing" in the Answer engines panel. Returns a draft only —
 *  nothing is saved until staff click Save. */
export async function suggestAeoFields(input: AeoSource): Promise<{ suggestion?: AeoSuggestion; error?: string }> {
  await requireStaff();
  const src: AeoSource = {
    title: String(input.title ?? "").slice(0, 300),
    description: String(input.description ?? "").slice(0, 6000),
    location: String(input.location ?? "").slice(0, 200),
    companyName: String(input.companyName ?? "").slice(0, 200),
    category: String(input.category ?? "").slice(0, 100),
    expiresAt: String(input.expiresAt ?? "").slice(0, 10),
    ctaLabel: String(input.ctaLabel ?? "").slice(0, 100),
    ctaUrl: String(input.ctaUrl ?? "").slice(0, 500),
  };
  if (!src.description.trim() && !src.title.trim()) {
    return { error: "Add a title and description first — the suggestion is drafted from them." };
  }
  return { suggestion: await suggestAeo(src) };
}
