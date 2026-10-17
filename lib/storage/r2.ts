import "server-only";
import { randomUUID } from "node:crypto";
import { AwsClient } from "aws4fetch";

/**
 * Photo and video storage on Cloudflare R2 (S3-compatible).
 *
 * Moved off Vercel Blob because the Hobby plan only includes 10 GB of
 * downloads a month and blocks the store for ~30 days once that's used: the
 * homepage video slider used 13.2 GB in Oct 2026 from ~17 MB of files. R2 has
 * no download (egress) charge, so the slider can't trip a limit again.
 *
 * Env vars (Vercel -> Project -> Settings -> Environment Variables):
 *   R2_ENDPOINT          https://<account-id>.r2.cloudflarestorage.com
 *   R2_ACCESS_KEY_ID     from an R2 API token scoped to the bucket
 *   R2_SECRET_ACCESS_KEY  "
 *   R2_BUCKET            e.g. fdsg-media
 *   R2_PUBLIC_URL        the bucket's public base, e.g. https://pub-xxxx.r2.dev
 *                        (or a custom domain such as https://media.fd.sg)
 */

type R2Config = {
  endpoint: string;
  bucket: string;
  publicUrl: string;
  client: AwsClient;
};

let cached: R2Config | null = null;

function config(): R2Config {
  if (cached) return cached;
  const endpoint = process.env.R2_ENDPOINT?.replace(/\/+$/, "");
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error(
      "File storage isn't configured: set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_URL.",
    );
  }
  cached = {
    endpoint,
    bucket,
    publicUrl,
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
  };
  return cached;
}

/** Encodes each path segment but keeps the slashes. */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function objectUrl(key: string): string {
  const { endpoint, bucket } = config();
  return `${endpoint}/${bucket}/${encodeKey(key)}`;
}

/** The public address visitors load a stored file from. */
export function publicUrlFor(key: string): string {
  return `${config().publicUrl}/${encodeKey(key)}`;
}

/**
 * A storage key under `folder` that won't collide with an existing file:
 * a random id plus a cleaned-up version of the original name, so the same
 * file uploaded twice gets two keys (same effect as Blob's addRandomSuffix).
 */
export function makeKey(folder: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "file";
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  return `${folder.replace(/\/+$/, "")}/${randomUUID().slice(0, 8)}-${base}${ext ? `.${ext}` : ""}`;
}

/** Uploads bytes and returns the file's public URL. */
export async function putFile(
  key: string,
  body: ArrayBuffer | Uint8Array | Blob,
  contentType: string,
): Promise<string> {
  const res = await config().client.fetch(objectUrl(key), {
    method: "PUT",
    body: body as BodyInit,
    headers: {
      "Content-Type": contentType,
      // Uploaded files never change in place (every upload gets a new key),
      // so browsers and Cloudflare can keep them for a long time.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
  if (!res.ok) {
    throw new Error(`File upload failed (${res.status}). ${(await res.text()).slice(0, 200)}`);
  }
  return publicUrlFor(key);
}

/**
 * A short-lived URL the browser can PUT one file to directly — used for
 * slider videos, which are too big to pass through a Server Action (Vercel
 * caps request bodies at 4.5MB). Content-Type and Content-Length are part of
 * the signature, so the upload must be exactly the type and size the server
 * approved.
 */
export async function presignUpload(
  key: string,
  contentType: string,
  contentLength: number,
  expiresInSeconds = 600,
): Promise<{ uploadUrl: string; publicUrl: string; headers: Record<string, string> }> {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  // The browser must send exactly these headers with its PUT (it sets
  // Content-Length itself from the file, so that one isn't returned).
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  const signed = await config().client.sign(url.toString(), {
    method: "PUT",
    headers: { ...headers, "Content-Length": String(contentLength) },
    aws: { signQuery: true, allHeaders: true },
  });
  return { uploadUrl: signed.url, publicUrl: publicUrlFor(key), headers };
}

/** The storage key for one of our own public URLs, or null if the URL isn't
 *  ours (an fd.sg image, an old Vercel Blob URL, anything typed in). */
export function keyFromPublicUrl(value: string): string | null {
  let base: string;
  try {
    base = config().publicUrl;
  } catch {
    return null;
  }
  if (!value.startsWith(`${base}/`)) return null;
  try {
    return value
      .slice(base.length + 1)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
  } catch {
    return null;
  }
}

/** True only for URLs that really point into our bucket — used before saving
 *  a URL the browser sent back, since it's rendered into <video src>. */
export function isStoredFileUrl(value: string): boolean {
  return keyFromPublicUrl(value) !== null;
}

/** Best-effort delete of one of our own files; ignores anything else. */
export async function deleteFileByUrl(value: string | null | undefined): Promise<void> {
  if (!value) return;
  const key = keyFromPublicUrl(value);
  if (!key) return;
  try {
    await config().client.fetch(objectUrl(key), { method: "DELETE" });
  } catch {
    // An orphaned file isn't worth failing a staff action over.
  }
}
