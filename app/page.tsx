import { createClient } from "@/lib/supabase/server";

type CategoryCount =
  | { ok: true; count: number }
  | { ok: false; message: string };

async function getCategoryCount(): Promise<CategoryCount> {
  try {
    const supabase = await createClient();
    // Not `head: true`: a HEAD response has no body, so PostgREST errors would
    // come back with an empty message. limit(0) still returns the exact count.
    const { count, error } = await supabase
      .from("categories")
      .select("id", { count: "exact" })
      .limit(0);

    if (error) {
      const code = error.code ? `[${error.code}] ` : "";
      return { ok: false, message: `${code}${error.message}` };
    }
    if (count === null) return { ok: false, message: "No count returned." };
    return { ok: true, count };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Unknown error.",
    };
  }
}

// Temporary connectivity check; replaced by the real home page later.
export default async function Home() {
  const result = await getCategoryCount();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        Supabase connection
      </h1>

      {result.ok ? (
        <>
          <p className="text-lg text-emerald-600 dark:text-emerald-400">
            Connected. <code className="font-mono">categories</code> has{" "}
            <strong>{result.count}</strong> {result.count === 1 ? "row" : "rows"}.
          </p>
          {result.count === 0 && (
            <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              Zero rows: the table may be empty, or RLS may be hiding its rows
              from the public (anon) role.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-lg text-red-600 dark:text-red-400">
            Could not read <code className="font-mono">categories</code>.
          </p>
          <p className="max-w-md font-mono text-sm text-zinc-600 dark:text-zinc-400">
            {result.message}
          </p>
        </>
      )}
    </main>
  );
}
