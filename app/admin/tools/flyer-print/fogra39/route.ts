import { auth } from "@/lib/auth/auth";
import { isStaff } from "@/lib/auth/roles";
import { FOGRA39_ICC_BASE64 } from "@/lib/flyer-print/profiles/fogra39.generated";

/**
 * The FOGRA39 colour profile the flyer print tool converts to CMYK with (see
 * lib/flyer-print/cmyk.ts). It is not in public/ on purpose: it is handed only
 * to signed-in staff, unmodified — see lib/flyer-print/profiles/NOTICE.txt.
 * Checked here because a route, like a Server Action, is reachable directly.
 *
 * Embedded in the server bundle (scripts/embed-icc-profile.mjs) rather than
 * read from disk, since Cloudflare Workers have no filesystem.
 */
let profile: Uint8Array | null = null;

function profileBytes(): Uint8Array {
  if (!profile) {
    const binary = atob(FOGRA39_ICC_BASE64);
    profile = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) profile[i] = binary.charCodeAt(i);
  }
  return profile;
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !isStaff(session.user.role)) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(profileBytes() as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.iccprofile",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
