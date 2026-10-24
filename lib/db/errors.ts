// Drizzle wraps database errors in its own "Failed query: <the whole SQL and
// every value>" error, with Postgres's actual error as `cause`. These helpers
// look through that wrapper so code checks keep working and staff see the
// real reason instead of a wall of SQL.

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

/** Postgres SQLSTATE (e.g. "23505" unique violation), wrapped or not. */
export function pgErrorCode(e: unknown): string | undefined {
  const inner = innermost(e);
  return inner?.code ? String(inner.code) : undefined;
}

/** A short, readable message for staff. */
export function dbErrorMessage(e: unknown, fallback: string): string {
  const inner = innermost(e);
  const message = typeof inner?.message === "string" ? inner.message : e instanceof Error ? e.message : "";
  if (!message) return fallback;
  if (/^column .+ does not exist/i.test(message) || /^relation .+ does not exist/i.test(message)) {
    return `${fallback} The database is missing a recent update (${message}) — run the latest database change, then try again.`;
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|Connection terminated|connect_timeout|too many clients/i.test(message)) {
    return `${fallback} Couldn't reach the database (${message}). Try again in a minute.`;
  }
  return `${fallback} ${message.length > 300 ? `${message.slice(0, 300)}…` : message}`;
}
