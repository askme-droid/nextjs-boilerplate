import { defineConfig } from "drizzle-kit";

// Cloudflare D1 (SQLite). `npx drizzle-kit generate` writes SQL migrations to
// ./migrations, which wrangler applies:
//   npx wrangler d1 migrations apply DB --local            (your computer)
//   npx wrangler d1 migrations apply DB --remote [--env staging]
// The ./drizzle folder holds the old Postgres (Railway/Neon) migrations, kept
// for reference and for scripts/neon-to-d1.mjs.
export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schema/index.ts",
  out: "./migrations",
});
