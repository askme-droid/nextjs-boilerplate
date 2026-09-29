const UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: "year", seconds: 31536000 },
  { unit: "month", seconds: 2592000 },
  { unit: "week", seconds: 604800 },
  { unit: "day", seconds: 86400 },
  { unit: "hour", seconds: 3600 },
  { unit: "minute", seconds: 60 },
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2 days ago" style relative time (no author — we don't expose who
 *  created a listing publicly), falling back to "just now" under a minute. */
export function formatRelativeTime(iso: string): string {
  const diffSeconds = (Date.now() - new Date(iso).getTime()) / 1000;

  for (const { unit, seconds } of UNITS) {
    if (diffSeconds >= seconds) {
      return rtf.format(-Math.floor(diffSeconds / seconds), unit);
    }
  }

  return "just now";
}
