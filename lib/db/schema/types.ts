// Column helpers for Cloudflare D1 (SQLite), so the tables read back the same
// JavaScript values the app got from Postgres:
//   - ids are random UUIDs stored as text
//   - timestamps are Date objects (stored as milliseconds since 1970)
//   - booleans are true/false (stored as 0/1)
//   - dates ("2026-10-31") and JSON lists stay strings / arrays
import { sql } from "drizzle-orm";
import { integer, text } from "drizzle-orm/sqlite-core";

/** SQL for "now" in the same unit as timestamp(): milliseconds. */
export const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

export const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** A uuid column that points at another table's id. */
export const uuidRef = (name: string) => text(name);

export const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

export const createdAt = (name = "created_at") =>
  timestamp(name)
    .notNull()
    .default(nowMs)
    .$defaultFn(() => new Date());

export const boolean = (name: string) => integer(name, { mode: "boolean" });

/** A calendar date, "YYYY-MM-DD" (Postgres `date`). */
export const date = (name: string) => text(name);

export const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();
