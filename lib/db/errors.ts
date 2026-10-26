// Drizzle wraps database errors in its own "Failed query: <the whole SQL and
// every value>" error, with the database's actual error as `cause`. These
// helpers look through that wrapper so code checks keep working and staff see
// the real reason instead of a wall of SQL.
//
// The database is Cloudflare D1 (SQLite), whose errors carry no SQLSTATE code,
// only a message such as "D1_ERROR: UNIQUE constraint failed: listings.slug:
// SQLITE_CONSTRAINT". pgErrorCode maps those messages to the Postgres codes
// the call sites already check, so they didn't have to change.

type MaybePgError = { code?: unknown; message?: unknown; cause?: unknown };

function innermost(e: unknown): MaybePgError | undefined {
  let current = e as MaybePgError | undefined;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    if ("code" in current && current.code) return current;
    if (!current.cause) return current;
    current = current.cause as MaybePgError;
  }
  return current;
}

function messagesOf(e: unknown): string {
  const parts: string[] = [];
  let current = e as MaybePgError | undefined;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    if (typeof current.message === "string") parts.push(current.message);
    current = current.cause as MaybePgError | undefined;
  }
  return parts.join(" | ");
}

/** "23505" (already exists: unique) or "23503" (points at something that
 *  doesn't exist: foreign key), as Postgres numbered them; wrapped or not. */
export function pgErrorCode(e: unknown): string | undefined {
  const inner = innermost(e);
  if (inner?.code && /^\d{5}$/.test(String(inner.code))) return String(inner.code);
  const text = messagesOf(e);
  if (/UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(text)) return "23505";
  if (/FOREIGN KEY constraint failed/i.test(text)) return "23503";
  return inner?.code ? String(inner.code) : undefined;
}

/** A short, readable message for staff. */
export function dbErrorMessage(e: unknown, fallback: string): string {
  const inner = innermost(e);
  const message = typeof inner?.message === "string" ? inner.message : e instanceof Error ? e.message : "";
  if (!message) return fallback;
  if (/no such (column|table)|has no column named|^column .+ does not exist|^relation .+ does not exist/i.test(message)) {
    return `${fallback} The database is missing a recent update (${message}) — run the latest database change, then try again.`;
  }
  if (/D1_ERROR: (Network|Internal)|overloaded|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|Connection terminated|connect_timeout|too many clients/i.test(message)) {
    return `${fallback} Couldn't reach the database (${message}). Try again in a minute.`;
  }
  return `${fallback} ${message.length > 300 ? `${message.slice(0, 300)}…` : message}`;
}
