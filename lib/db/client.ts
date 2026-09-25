import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Module-scope singleton: Next.js dev hot-reload would otherwise create a new
// TCP pool on every edit. Same reasoning as the old Supabase client's
// per-request-not-per-module pattern, but a real Postgres pool needs to
// persist across requests, not be recreated each time.
declare global {
  // eslint-disable-next-line no-var
  var __dbClient: postgres.Sql | undefined;
}

function getClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Missing DATABASE_URL. Add it to .env.local — see .env.local.example.",
    );
  }
  if (!globalThis.__dbClient) {
    globalThis.__dbClient = postgres(url);
  }
  return globalThis.__dbClient;
}

export const db = drizzle(getClient(), { schema });
