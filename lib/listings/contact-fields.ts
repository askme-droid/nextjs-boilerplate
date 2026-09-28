// Validation for the business-identity fields on a listing (company name,
// UEN, social links, call-to-action). Shared by the admin and self-service
// save actions so both accept exactly the same input.

export type ContactFieldValues = {
  company_name: string;
  company_uen: string;
  social_links: string;
  cta_label: string;
  cta_url: string;
};

export type ContactFieldErrors = Partial<Record<keyof ContactFieldValues, string>>;

export type ParsedContactFields = {
  companyName: string | null;
  companyUen: string | null;
  socialLinks: string[];
  ctaLabel: string | null;
  ctaUrl: string | null;
};

export const MAX_SOCIAL_LINKS = 8;

// Singapore UEN formats: businesses (8 digits + letter), local companies
// (4-digit year + 5 digits + letter), and other entities (T/S/R + 2-digit
// year + 2-letter entity type + 4 digits + letter).
const UEN_PATTERNS = [/^\d{8}[A-Z]$/, /^\d{9}[A-Z]$/, /^[TSR]\d{2}[A-Z]{2}\d{4}[A-Z]$/];

/** Only http(s) — never javascript:, data: or similar in a rendered link. */
export function normalizeHttpUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function parseContactFields(values: ContactFieldValues): {
  parsed: ParsedContactFields;
  errors: ContactFieldErrors;
} {
  const errors: ContactFieldErrors = {};

  const companyName = values.company_name.trim() || null;

  const uenRaw = values.company_uen.trim().toUpperCase().replace(/\s+/g, "");
  let companyUen: string | null = null;
  if (uenRaw) {
    if (UEN_PATTERNS.some((p) => p.test(uenRaw))) companyUen = uenRaw;
    else errors.company_uen = "Enter a valid Singapore UEN, for example 201912345K.";
  }

  const socialLinks: string[] = [];
  const lines = values.social_links
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > MAX_SOCIAL_LINKS) {
    errors.social_links = `Add at most ${MAX_SOCIAL_LINKS} links.`;
  } else {
    for (const line of lines) {
      const url = normalizeHttpUrl(line);
      if (!url) {
        errors.social_links = `"${line}" is not a valid web address.`;
        break;
      }
      if (!socialLinks.includes(url)) socialLinks.push(url);
    }
  }

  let ctaUrl: string | null = null;
  const ctaUrlRaw = values.cta_url.trim();
  if (ctaUrlRaw) {
    ctaUrl = normalizeHttpUrl(ctaUrlRaw);
    if (!ctaUrl) errors.cta_url = "Enter a valid web address for the button.";
  }
  const ctaLabelRaw = values.cta_label.trim();
  if (ctaLabelRaw && !ctaUrlRaw) errors.cta_url = "Add the web address this button goes to.";
  const ctaLabel = ctaUrl ? ctaLabelRaw || "Learn more" : null;

  return { parsed: { companyName, companyUen, socialLinks, ctaLabel, ctaUrl }, errors };
}

/** Friendly name for a social link, from its host. */
export function socialLabel(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
  const known: [RegExp, string][] = [
    [/(^|\.)facebook\.com$|^fb\.com$|^fb\.me$/, "Facebook"],
    [/(^|\.)instagram\.com$/, "Instagram"],
    [/(^|\.)tiktok\.com$/, "TikTok"],
    [/(^|\.)youtube\.com$|^youtu\.be$/, "YouTube"],
    [/(^|\.)linkedin\.com$/, "LinkedIn"],
    [/(^|\.)twitter\.com$|^x\.com$/, "X"],
    [/(^|\.)telegram\.(me|org)$|^t\.me$/, "Telegram"],
    [/(^|\.)wa\.me$|(^|\.)whatsapp\.com$/, "WhatsApp"],
  ];
  return known.find(([re]) => re.test(host))?.[1] ?? host;
}
