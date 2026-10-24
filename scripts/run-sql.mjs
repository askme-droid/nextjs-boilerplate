// Runs a .sql file against the database in DATABASE_URL — for applying a
// schema change when Railway's web query box isn't available.
//
//   node --env-file=.env.local scripts/run-sql.mjs scripts/sql/hero-slides.sql
//
// The whole file runs in one transaction: either every statement applies or
// none do.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node --env-file=.env.local scripts/run-sql.mjs <file.sql>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url || url.includes("user:password@host")) {
  console.error("DATABASE_URL isn't set — run it with --env-file=.env.local from the project folder.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await sql.begin((tx) => tx.unsafe(readFileSync(file, "utf8")));
  console.log(`Done: ${file} applied.`);
} catch (e) {
  console.error(`Failed — nothing was changed: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
