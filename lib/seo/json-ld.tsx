/**
 * Renders schema.org structured data (JSON-LD) for search engines and AI
 * assistants. Per the Next.js JSON-LD guide, "<" is escaped so text from a
 * listing (titles, descriptions) can never close the <script> tag early.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

/** Drops keys whose value is null, undefined, "" or an empty array, so the
 *  JSON-LD only claims what we actually know. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0),
    ),
  ) as Partial<T>;
}
