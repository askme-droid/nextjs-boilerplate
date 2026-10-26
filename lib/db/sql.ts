// SQL pieces that differ between Postgres and Cloudflare D1 (SQLite), kept in
// one place so queries read the same as before the move.
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * Case-insensitive "contains"-style match (Postgres ILIKE). SQLite's LIKE is
 * already case-insensitive for English letters; ESCAPE makes `\%`, `\_` and
 * `\\` in the pattern match literally, as Postgres does by default.
 */
export function ilike(column: SQLWrapper, pattern: string): SQL {
  return sql`${column} like ${pattern} escape '\\'`;
}

/** Today's date in Singapore as "YYYY-MM-DD", plus `days` (SQL). */
export function sgToday(days = 0): SQL {
  const offset = Math.trunc(days);
  return offset
    ? sql.raw(`date('now', '+8 hours', '${offset >= 0 ? "+" : ""}${offset} days')`)
    : sql.raw(`date('now', '+8 hours')`);
}
