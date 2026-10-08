import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth/auth";
import { isStaff } from "@/lib/auth/roles";
import { FEATURED_VIDEO_MAX_BYTES, FEATURED_VIDEO_TYPES } from "@/lib/listings/constants";

/**
 * Token endpoint for slider videos (see app/admin/listings/featured/
 * video-upload.tsx). Videos are too big for a Server Action (Vercel caps the
 * request body at 4.5MB), so the browser uploads straight to Vercel Blob and
 * only needs a short-lived, tightly scoped token from here. The staff check
 * lives here because this route, like a Server Action, is reachable directly.
 *
 * No onUploadCompleted: nothing needs to happen when Blob finishes — the
 * browser hands the resulting URL to a Server Action, which saves it.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !isStaff(session.user.role)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [...FEATURED_VIDEO_TYPES],
        maximumSizeInBytes: FEATURED_VIDEO_MAX_BYTES,
        addRandomSuffix: true,
      }),
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start the upload." },
      { status: 400 },
    );
  }
}
