"use client";

import { useRef, useState, useTransition } from "react";
import {
  FEATURED_IMAGE_MAX_BYTES,
  FEATURED_IMAGE_TYPES,
  FEATURED_VIDEO_MAX_BYTES,
  FEATURED_VIDEO_TYPES,
} from "@/lib/listings/constants";
import { setFeaturedImage, setFeaturedVideo } from "../featured-actions";

type Kind = "video" | "image";
const LIMITS: Record<Kind, { types: readonly string[]; maxBytes: number; typeError: string }> = {
  video: { types: FEATURED_VIDEO_TYPES, maxBytes: FEATURED_VIDEO_MAX_BYTES, typeError: "The video must be an MP4 or WebM file." },
  image: { types: FEATURED_IMAGE_TYPES, maxBytes: FEATURED_IMAGE_MAX_BYTES, typeError: "The image must be a JPG, PNG, WebP or GIF file." },
};

const buttonClass =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 disabled:hover:bg-transparent dark:border-zinc-700 dark:hover:bg-zinc-800";


/** PUTs a file to a presigned R2 URL, reporting progress (fetch() can't). */
function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`The upload failed (${xhr.status}). Try again.`));
    xhr.onerror = () =>
      reject(new Error("The upload failed — check the connection, or the storage CORS settings."));
    xhr.send(file);
  });
}

/**
 * Pick a clip (or, with kind="image", an image / animated GIF), send it straight to R2 storage (Server Actions can't carry
 * more than 4.5MB on Vercel) using a short-lived upload URL from
 * /api/featured-video/upload, then hand the resulting URL to the Server
 * Action that saves it against the (already picked) listing.
 */
export function MediaUpload({ listingId, label, kind = "video" }: { listingId: string; label: string; kind?: Kind }) {
  const limits = LIMITS[kind];
  const maxMb = limits.maxBytes / (1024 * 1024);
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const busy = progress !== null || saving;

  async function handleFile(file: File) {
    setError(null);

    if (!limits.types.includes(file.type)) {
      setError(limits.typeError);
      return;
    }
    if (file.size > limits.maxBytes) {
      setError(`That file is ${(file.size / (1024 * 1024)).toFixed(0)}MB — the limit is ${maxMb}MB.`);
      return;
    }

    setProgress(0);
    try {
      const res = await fetch("/api/featured-video/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, fileName: file.name, contentType: file.type, size: file.size, kind }),
      });
      const signed = (await res.json()) as {
        uploadUrl?: string;
        publicUrl?: string;
        headers?: Record<string, string>;
        error?: string;
      };
      if (!res.ok || !signed.uploadUrl || !signed.publicUrl) {
        throw new Error(signed.error ?? "Could not start the upload.");
      }

      await putWithProgress(signed.uploadUrl, file, signed.headers ?? {}, setProgress);

      const formData = new FormData();
      formData.set("id", listingId);
      formData.set(kind === "image" ? "imageUrl" : "videoUrl", signed.publicUrl);
      startSaving(async () => {
        await (kind === "image" ? setFeaturedImage(formData) : setFeaturedVideo(formData));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed. Try again.");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={limits.types.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        className={buttonClass}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {progress !== null ? `Uploading ${progress}%…` : saving ? "Saving…" : label}
      </button>
      {progress !== null && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-1.5 w-40 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        >
          <div className="h-full bg-brand-teal transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <p className="max-w-xs text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
