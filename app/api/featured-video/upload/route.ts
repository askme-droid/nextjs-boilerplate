import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { isStaff } from "@/lib/auth/roles";
import {
  FEATURED_IMAGE_MAX_BYTES,
  FEATURED_IMAGE_TYPES,
  FEATURED_VIDEO_MAX_BYTES,
  FEATURED_VIDEO_TYPES,
} from "@/lib/listings/constants";
import { makeKey, presignUpload } from "@/lib/storage/r2";

/**
 * Hands out a short-lived upload URL for one slider video or slide image
 * (`kind`: "video" | "image", default "video") (see
 * app/admin/listings/featured/media-upload.tsx). Videos are too big for a
 * Server Action (Vercel caps the request body at 4.5MB), so the browser PUTs
 * the file straight to R2 with this URL, then passes the returned public URL
 * to a Server Action that saves it. The staff check lives here because this
 * route, like a Server Action, is reachable directly.
 *
 * Type and exact size are part of the signature, so the browser can't use
 * the URL to upload anything other than what was approved here.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !isStaff(session.user.role)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let body: { listingId?: unknown; fileName?: unknown; contentType?: unknown; size?: unknown; kind?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const listingId = typeof body.listingId === "string" ? body.listingId : "";
  const fileName = typeof body.fileName === "string" ? body.fileName : "video";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const size = typeof body.size === "number" ? body.size : 0;
  const kind = body.kind === "image" ? "image" : "video";
  const types: readonly string[] = kind === "image" ? FEATURED_IMAGE_TYPES : FEATURED_VIDEO_TYPES;
  const maxBytes = kind === "image" ? FEATURED_IMAGE_MAX_BYTES : FEATURED_VIDEO_MAX_BYTES;

  if (!/^[0-9a-f-]{36}$/i.test(listingId)) {
    return NextResponse.json({ error: "Missing listing." }, { status: 400 });
  }
  if (!types.includes(contentType)) {
    return NextResponse.json(
      {
        error:
          kind === "image"
            ? "The image must be a JPG, PNG, WebP or GIF file."
            : "The video must be an MP4 or WebM file.",
      },
      { status: 400 },
    );
  }
  if (!Number.isInteger(size) || size <= 0 || size > maxBytes) {
    return NextResponse.json({ error: `That ${kind} is too large.` }, { status: 400 });
  }

  try {
    const signed = await presignUpload(makeKey(`${kind === "image" ? "featured-images" : "featured-videos"}/${listingId}`, fileName), contentType, size);
    return NextResponse.json(signed);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start the upload." },
      { status: 500 },
    );
  }
}
