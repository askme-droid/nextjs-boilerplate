import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AUDIENCE_MAX, KEY_POINT_MAX, OFFER_DISCOUNT_MAX, QUICK_ANSWER_MAX, REDEMPTION_MAX } from "@/lib/seo/aeo";

/** What the listing already says, read from the editor. */
export type AeoSource = {
  title: string;
  description: string;
  location: string;
  companyName: string;
  category: string;
  expiresAt: string;
  ctaLabel: string;
  ctaUrl: string;
};

export type AeoSuggestion = {
  quickSummary: string;
  audience: string;
  keyPoints: string[];
  offerDiscount: string;
  offerPrice: string;
  redemption: string;
  /** "ai" = written by Claude; "basic" = picked out of the description (no API key or the call failed). */
  source: "ai" | "basic";
};

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

function sentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    // New line, or a full stop followed by a new sentence — with or without a
    // space ("pick-up.Order…"), but not "$25.90" or "fd.sg".
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9"“(])|(?<=[a-z)][.!?])(?=[A-Z][a-z])/)
    .map((s) => s.replace(/^[\s•\-*–]+/, "").trim())
    .filter((s) => s.length > 3);
}

/** Free fallback: lifts the summary and points straight out of the description. */
export function basicSuggestion(src: AeoSource): AeoSuggestion {
  const all = sentences(src.description);
  let summary = "";
  // At most two sentences: the rest become key points.
  for (const s of all.slice(0, 2)) {
    if ((summary + " " + s).trim().length > QUICK_ANSWER_MAX) break;
    summary = (summary + " " + s).trim();
    if (summary.length >= 120) break;
  }
  if (!summary) summary = src.title;
  const used = new Set(summary ? all.filter((s) => summary.includes(s)) : []);
  const keyPoints = all
    .filter((s) => !used.has(s))
    // A long sentence keeps its first clause (up to the first comma or
    // bracket) so the bullet stays short.
    .map((s) => (s.length > KEY_POINT_MAX ? s.split(/[,(]/)[0] : s).replace(/[.;]$/, "").trim())
    .filter((s) => s.length > 3)
    .map((s) => clip(s, KEY_POINT_MAX))
    .slice(0, 5);
  const text = `${src.title} ${src.description}`;
  const discount =
    text.match(/\b\d+\s*-?\s*for\s*-?\s*\d+\b/i)?.[0] ??
    text.match(/\b\d{1,3}\s?% off\b/i)?.[0] ??
    text.match(/\bfree (?:trial|gift|delivery|class|lesson)\b/i)?.[0] ??
    "";
  const price = text.match(/(?:S?\$)\s?(\d{1,6}(?:\.\d{2})?)/)?.[1] ?? "";
  return {
    quickSummary: clip(summary, QUICK_ANSWER_MAX),
    audience: "",
    keyPoints,
    offerDiscount: clip(discount, OFFER_DISCOUNT_MAX),
    offerPrice: price,
    redemption: "",
    source: "basic",
  };
}

/** Claude drafts the Answer-engine fields from the listing's own text. Falls
 *  back to basicSuggestion when there's no API key or the call fails. */
export async function suggestAeo(src: AeoSource): Promise<AeoSuggestion> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("your-")) return basicSuggestion(src);

  const schema = z.object({
    quick_summary: z
      .string()
      .describe(`1-2 factual sentences (max ${QUICK_ANSWER_MAX} chars): who offers what, where, and until when if known.`),
    audience: z.string().describe(`One line (max ${AUDIENCE_MAX} chars) on who this offer suits. Empty string if unclear.`),
    key_points: z.array(z.string()).describe(`3-6 short bullet points (each max ${KEY_POINT_MAX} chars), no trailing full stops.`),
    offer_discount: z
      .string()
      .describe(`The deal in a few words, e.g. "1-for-1", "20% off first order". Empty string if none stated.`),
    offer_price: z.string().describe('A single main price as a number, e.g. "25.90". Empty string if none stated.'),
    redemption: z.string().describe(`How to redeem, claim or book (max ${REDEMPTION_MAX} chars). Empty string if not stated.`),
  });

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            "Draft answer-engine (AEO) fields for a Singapore deals directory listing, so AI assistants can quote it accurately.",
            "Use only facts stated below. Never invent prices, dates, outlets, codes or conditions. Plain, factual tone; no hype.",
            "",
            `Title: ${src.title}`,
            src.companyName && `Business: ${src.companyName}`,
            src.category && `Category: ${src.category}`,
            src.location && `Location: ${src.location}`,
            src.expiresAt && `Offer ends: ${src.expiresAt}`,
            src.ctaLabel || src.ctaUrl ? `Button: ${src.ctaLabel} ${src.ctaUrl}`.trim() : null,
            "",
            `Description:\n${src.description}`,
          ]
            .filter((l) => l !== null && l !== "")
            .join("\n"),
        },
      ],
      output_config: { format: zodOutputFormat(schema) },
    });
    const p = response.parsed_output;
    if (!p) return basicSuggestion(src);
    return {
      quickSummary: clip(p.quick_summary, QUICK_ANSWER_MAX),
      audience: clip(p.audience, AUDIENCE_MAX),
      keyPoints: p.key_points.map((k) => clip(k.replace(/[.;]$/, ""), KEY_POINT_MAX)).filter(Boolean).slice(0, 6),
      offerDiscount: clip(p.offer_discount, OFFER_DISCOUNT_MAX),
      offerPrice: /^\d{1,8}(\.\d{1,2})?$/.test(p.offer_price.replace(/^S?\$/, "").trim())
        ? p.offer_price.replace(/^S?\$/, "").trim()
        : "",
      redemption: clip(p.redemption, REDEMPTION_MAX),
      source: "ai",
    };
  } catch (e) {
    console.error("AEO suggestion failed, using the basic one:", e instanceof Error ? e.message : e);
    return basicSuggestion(src);
  }
}
