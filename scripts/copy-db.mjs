// Copies the whole database from one Postgres to another — used to move from
// Railway to Neon. Reads only from the source; writes only to the target.
//
//   node --env-file=.env.local scripts/copy-db.mjs "<target connection link>"
//
// Source = DATABASE_URL (from .env.local). Target = the link you pass in.
// Steps: create the tables on the target (from drizzle/*.sql), copy every
// row, then compare row counts table by table. The target must be empty;
// nothing is changed on the source.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const SOURCE = process.env.DATABASE_URL;
const TARGET = process.argv[2] || process.env.TARGET_DATABASE_URL;
if (!SOURCE || !TARGET) {
  console.error(
    'Usage: node --env-file=.env.local scripts/copy-db.mjs "postgresql://…neon.tech/…"',
  );
  process.exit(1);
}
if (SOURCE === TARGET) {
  console.error("The target is the same database as the source — stopping.");
  process.exit(1);
}

const host = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return "?";
  }
};
const src = postgres(SOURCE, { max: 1, onnotice: () => {} });
const dst = postgres(TARGET, { max: 1, onnotice: () => {} });
const BATCH = 300;

async function publicTables(sql) {
  const rows = await sql`select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not like '\\_\\_%'`;
  return rows.map((r) => r.table_name);
}

/** Tables ordered so a table comes after the ones it references. */
async function dependencyOrder(sql, tables) {
  const fks = await sql`
    select tc.table_name as child, ccu.table_name as parent
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`;
  const ordered = [];
  const remaining = new Set(tables);
  while (remaining.size) {
    const ready = [...remaining].filter((t) =>
      fks.every(
        (f) => f.child !== t || f.parent === t || !remaining.has(f.parent),
      ),
    );
    if (ready.length === 0)
      throw new Error(
        "Circular table references: " + [...remaining].join(", "),
      );
    ready.sort().forEach((t) => {
      ordered.push(t);
      remaining.delete(t);
    });
  }
  return ordered;
}

async function main() {
  console.log(`From: ${host(SOURCE)}\nTo:   ${host(TARGET)}\n`);

  // 1. The target must be empty (no listings yet), so nothing gets doubled.
  const existing = await publicTables(dst);
  if (existing.includes("listings")) {
    const [{ n }] = await dst`select count(*)::int as n from listings`;
    if (n > 0)
      throw new Error(
        `The target already has ${n} listings — use a new, empty database.`,
      );
  }

  // 2. Create the tables on the target from the migration files, in order.
  if (!existing.includes("listings")) {
    console.log("Creating tables…");
    // pgvector (Neon has it). Without it, image embeddings fall back to a
    // plain number list — "search by image" is switched off anyway.
    let hasVector = true;
    try {
      await dst.unsafe("create extension if not exists vector");
    } catch {
      hasVector = false;
      console.log(
        "(pgvector not available — storing image embeddings as a plain list)",
      );
    }
    const dir = "drizzle";
    // All or nothing: a failure leaves the target empty to try again.
    await dst.begin(async (tx) => {
      for (const file of readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .sort()) {
        const statements = readFileSync(join(dir, file), "utf8")
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const statement of statements) {
          if (!hasVector && /create extension/i.test(statement)) continue;
          await tx.unsafe(
            hasVector
              ? statement
              : statement.replace(/vector\(\d+\)/g, "real[]"),
          );
        }
      }
    });
  }

  // 3. Copy rows, parents before children. Rows go across as JSON, so every
  //    column type (arrays, JSON, dates, vectors) survives as-is.
  const sourceTables = await publicTables(src);
  const targetTables = new Set(await publicTables(dst));
  const missing = sourceTables.filter((t) => !targetTables.has(t));
  if (missing.length)
    console.log(
      `Not copied (no such table in the app any more): ${missing.join(", ")}`,
    );
  const tables = await dependencyOrder(
    src,
    sourceTables.filter((t) => targetTables.has(t)),
  );

  // Seed rows the migrations add (e.g. hero slides) are replaced by the real data.
  for (const t of [...tables].reverse()) await dst.unsafe(`delete from "${t}"`);

  const results = [];
  for (const table of tables) {
    const [{ n: total }] = await src.unsafe(
      `select count(*)::int as n from "${table}"`,
    );
    process.stdout.write(`Copying ${table} (${total})… `);
    for (let offset = 0; offset < total; offset += BATCH) {
      const [{ data }] = await src.unsafe(
        `select coalesce(json_agg(t), '[]')::text as data from (select * from "${table}" order by 1 limit ${BATCH} offset ${offset}) t`,
      );
      await dst.unsafe(
        `insert into "${table}" select * from json_populate_recordset(null::"${table}", ($1::text)::json)`,
        [data],
      );
    }
    const [{ n: copied }] = await dst.unsafe(
      `select count(*)::int as n from "${table}"`,
    );
    console.log(copied === total ? "ok" : `MISMATCH (${copied})`);
    results.push({ table, source: total, target: copied });
  }

  // 4. Check.
  console.log("\nTable                      Source  Target");
  for (const r of results)
    console.log(
      `${r.table.padEnd(26)} ${String(r.source).padStart(6)}  ${String(r.target).padStart(6)}`,
    );
  const bad = results.filter((r) => r.source !== r.target);
  if (bad.length)
    throw new Error(
      `Row counts differ for: ${bad.map((r) => r.table).join(", ")}`,
    );
  console.log(
    "\nDone — every table copied and the counts match. Nothing was changed on the source.",
  );
}

try {
  await main();
} catch (e) {
  console.error(`\nStopped: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  await src.end();
  await dst.end();
}
