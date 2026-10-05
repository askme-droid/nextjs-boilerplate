"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ScanCameraIcon } from "./scan-camera-icon";

// One attention ring per browser session is enough: the point is to show
// first-time visitors where the feature lives, not to nag returning ones.
const HINT_SEEN_KEY = "image-search-hint-seen";

function hintAlreadySeen(): boolean {
  try {
    return sessionStorage.getItem(HINT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markHintSeen() {
  try {
    sessionStorage.setItem(HINT_SEEN_KEY, "1");
  } catch {
    // Private mode etc. — the hint just plays again next time.
  }
}

/** Viewfinder corner (one of four) for the scan card's photo. */
function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`absolute size-3 border-brand-teal ${className}`}
    />
  );
}

/**
 * Shown while a photo is being matched (the first search can take a few
 * seconds while the model warms up): the visitor's own photo with a scanner
 * beam over it, so the wait reads as "it's looking at my picture".
 */
function ScanningCard({ previewUrl }: { previewUrl: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 pr-5 shadow-xl motion-safe:animate-pop-in dark:border-zinc-700 dark:bg-zinc-900">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
          {previewUrl && (
            <Image
              src={previewUrl}
              alt=""
              fill
              unoptimized
              className="object-cover"
            />
          )}
          <span
            aria-hidden
            className="absolute inset-x-0 hidden h-0.5 bg-brand-orange shadow-[0_0_10px_2px] shadow-brand-orange motion-safe:block motion-safe:animate-scan-line"
          />
          <Corner className="left-1 top-1 border-l-2 border-t-2" />
          <Corner className="right-1 top-1 border-r-2 border-t-2" />
          <Corner className="bottom-1 left-1 border-b-2 border-l-2" />
          <Corner className="bottom-1 right-1 border-b-2 border-r-2" />
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Analyzing your photo…
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Finding listings that look similar
          </p>
        </div>
      </div>
    </div>
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<{
    status: "idle" | "loading";
    error: string | null;
    previewUrl: string | null;
  }>({ status: "idle", error: null, previewUrl: null });
  const [hint, setHint] = useState(false);
  const router = useRouter();

  // Play the attention ring the first time the button actually scrolls into
  // view (not on page load, when it's usually off-screen), once per session.
  useEffect(() => {
    const button = buttonRef.current;
    if (
      !button ||
      hintAlreadySeen() ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHint(true);
          observer.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, []);

  async function handleFile(file: File) {
    const previewUrl = URL.createObjectURL(file);
    setHint(false);
    markHintSeen();
    setState({ status: "loading", error: null, previewUrl });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/search-by-image", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setState({ status: "idle", error: data.error ?? "Could not search by image.", previewUrl: null });
        return;
      }
      // #search: the search card sits well below the hero, and a plain push
      // would land back at the top of the page with the results out of sight.
      router.push(`/?imageMatch=${(data.ids as string[]).join(",")}#search`);
      // router.push doesn't unmount this component (same layout persists
      // across the navigation, and still doesn't on "Clear" back to "/") —
      // without this, the button is stuck showing the scan card forever.
      setState({ status: "idle", error: null, previewUrl: null });
    } catch {
      setState({ status: "idle", error: "Could not search by image. Try again.", previewUrl: null });
    } finally {
      URL.revokeObjectURL(previewUrl);
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
      {/* w-fit: this wrapper is as wide as the whole form row on small screens,
          and the ring must hug the button, not the row. */}
      <div className="relative w-fit">
        {hint && state.status === "idle" && (
          <span
            aria-hidden
            onAnimationEnd={() => {
              setHint(false);
              markHintSeen();
            }}
            className="pointer-events-none absolute inset-0 hidden rounded-md border-2 border-brand-teal motion-safe:block motion-safe:animate-attention-ping"
          />
        )}
        <button
          ref={buttonRef}
          type="button"
          disabled={state.status === "loading"}
          onClick={() => inputRef.current?.click()}
          title="Search by image"
          aria-label="Search by image"
          className="group/scan relative flex items-center justify-center rounded-md border border-zinc-300 p-2.5 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <ScanCameraIcon always={state.status === "loading"} />
        </button>
      </div>
      {state.status === "loading" && (
        <ScanningCard previewUrl={state.previewUrl} />
      )}
      {state.error && (
        <p className="absolute top-full left-0 z-10 mt-1 w-48 text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </div>
  );
}
