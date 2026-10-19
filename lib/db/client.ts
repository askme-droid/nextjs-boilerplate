import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Database access, safe for Cloudflare Workers.
 *
 * Workers don't allow a connection opened during one request to be reused
 * by another ("Cannot perform I/O on behalf of a different request"), so the
 * old module-level Postgres pool can't be used there. Instead each request
 * gets its own small client, created on first use and keyed by the request's
 * ExecutionContext. Connection pooling across requests is Hyperdrive's job:
 * when a HYPERDRIVE binding exists (wrangler.jsonc), its connection string is
 * used; otherwise DATABASE_URL is used directly (slower, but works).
 *
 * Outside Workers (next build, plain `node`), the old per-process singleton
 * is used.
 *
 * `db` stays a plain object to import, so no call site had to change.
 */

const perRequest = new WeakMap<object, Db>();

declare global {
  var __nodeDb: Db | undefined;
}

function connectionStringFrom(env?: { HYPERDRIVE?: { connectionString: string } }): string {
  const url = env?.HYPERDRIVE?.connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL (or a HYPERDRIVE binding). See .env.local.example.");
  }
  return url;
}

function workerContext() {
  try {
    return getCloudflareContext();
  } catch {
    return null; // not running inside a Worker request
  }
}

export function getDb(): Db {
  const cf = workerContext();
  if (cf?.ctx) {
    const existing = perRequest.get(cf.ctx);
    if (existing) return existing;
    const client = postgres(connectionStringFrom(cf.env as { HYPERDRIVE?: { connectionString: string } }), {
      // One request rarely runs more than a few queries at once.
      max: 5,
      // Skips an extra round trip on connect; this schema uses no custom types.
      fetch_types: false,
    });
    const db = drizzle(client, { schema });
    perRequest.set(cf.ctx, db);
    return db;
  }

  globalThis.__nodeDb ??= drizzle(postgres(connectionStringFrom()), { schema });
  return globalThis.__nodeDb;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
