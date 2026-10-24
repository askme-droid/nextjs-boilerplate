/** "5 Nov 2024" — a listing's created date, in Singapore time. */
export function formatListingDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });
}
