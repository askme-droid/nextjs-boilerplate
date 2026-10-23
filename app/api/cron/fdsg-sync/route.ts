import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { syncFdsgListings } from "@/lib/listings/fdsg-sync";

// Called on a schedule (.github/workflows/fdsg-sync.yml) to keep synced
// listings current without anyone clicking "Refresh from fd.sg": copies fd.sg's
// latest view counts (never lowering one), posting dates, fixes thumbnails and
// imports up to 20 new listings per run. Needs CRON_SECRET, sent as
// "Authorization: Bearer <secret>".
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    const result = await syncFdsgListings();
    revalidatePath("/");
    revalidatePath("/admin/listings/synced");
    return Response.json({ ok: true, ms: Date.now() - started, ...result });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
