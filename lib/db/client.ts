import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

type Db = DrizzleD1Database<typeof schema>;

/**
 * Database access: Cloudflare D1 (SQLite), through the Worker's `DB` binding
 * (wrangler.jsonc -> d1_databases).
 *
 * `next dev` gets the binding too (initOpenNextCloudflareForDev in
 * next.config.ts), backed by a local copy of the database under .wrangler/.
 *
 * D1 has no interactive transactions: use `db.batch([...])` to run several
 * writes all-or-nothing.
 *
 * `db` stays a plain object to import, so call sites don't change.
 */

const byBinding = new WeakMap<D1Database, Db>();

function binding(): D1Database {
  let env: { DB?: D1Database } | undefined;
  try {
    env = getCloudflareContext().env as { DB?: D1Database };
  } catch {
    env = undefined;
  }
  if (!env?.DB) {
    throw new Error(
      "The database (D1 binding \"DB\") isn't available here. Run the site with `npm run dev` or on Cloudflare; see wrangler.jsonc.",
    );
  }
  return env.DB;
}

export function getDb(): Db {
  const d1 = binding();
  let db = byBinding.get(d1);
  if (!db) {
    db = drizzle(d1, { schema });
    byBinding.set(d1, db);
  }
  return db;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
