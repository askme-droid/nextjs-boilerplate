"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 animate-spin" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.25"
      />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Upload a photo, find visually similar listings. Posts straight to
 * /api/search-by-image (see that route for the actual CLIP + pgvector
 * lookup) and lands on "/" with the matched ids in `imageMatch` — read by
 * loadPageData in app/page.tsx, which swaps the normal filtered query for
 * getListingsByIds so the result order (best match first) survives the
 * navigation.
 */
export function ImageSearchButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ status: "idle" | "loading"; error: string | null }>({
    status: "idle",
    error: null,
  });
  const router = useRouter();

  async function handleFile(file: File) {
    setState({ status: "loading", error: null });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/search-by-image", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setState({ status: "idle", error: data.error ?? "Could not search by image." });
        return;
      }
      router.push(`/?imageMatch=${(data.ids as string[]).join(",")}`);
    } catch {
      setState({ status: "idle", error: "Could not search by image. Try again." });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        disabled={state.status === "loading"}
        onClick={() => inputRef.current?.click()}
        title="Search by image"
        aria-label="Search by image"
        className="flex items-center justify-center rounded-md border border-zinc-300 p-2.5 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {state.status === "loading" ? <SpinnerIcon /> : <CameraIcon />}
      </button>
      {state.error && (
        <p className="absolute top-full left-0 z-10 mt-1 w-48 text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </div>
  );
}
