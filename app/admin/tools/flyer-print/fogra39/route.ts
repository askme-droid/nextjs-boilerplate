import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { auth } from "@/lib/auth/auth";
import { isStaff } from "@/lib/auth/roles";

/**
 * The FOGRA39 colour profile the flyer print tool converts to CMYK with (see
 * lib/flyer-print/cmyk.ts). It is not in public/ on purpose: it is handed only
 * to signed-in staff, unmodified — see lib/flyer-print/profiles/NOTICE.txt.
 * Checked here because a route, like a Server Action, is reachable directly.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !isStaff(session.user.role)) {
    return new Response("Not found", { status: 404 });
  }

  const profile = await readFile(join(process.cwd(), "lib/flyer-print/profiles/ISOcoated_v2_eci.icc"));
  return new Response(new Uint8Array(profile), {
    headers: {
      "Content-Type": "application/vnd.iccprofile",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
