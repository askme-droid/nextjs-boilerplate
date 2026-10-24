"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestScrollToResults } from "./search-scroll";
import { ScanCameraIcon } from "./scan-camera-icon";
import { SearchingCard } from "./searching-card";

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

/**
 * Upload a photo, find visually similar listings. Posts straight to
 * /api/search-by-image (see that route for the actual CLIP + pgvector
 * lookup) and lands on "/" with the matched ids in `imageMatch` — read by
 * loadPageData in app/page.tsx, which swaps the normal filtered query for
 * getListingsByIds so the result order (best match first) survives the
 * navigation.
 *
 * The "searching" card stays up for the whole wait: the request itself, then
 * the navigation that renders the results (a transition, so React tells us
 * when it has finished). Once the results are in, the form component scrolls
 * the search card to the top of the screen (see search-scroll.ts).
 */
export function ImageSearchButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [isNavigating, startTransition] = useTransition();
  const router = useRouter();

  const busy = requesting || isNavigating;

  // The photo preview lives as long as the card does, then is released.
  useEffect(() => {
    if (busy || !previewUrl) return;
    URL.revokeObjectURL(previewUrl);
    // Flagged by the stricter react-hooks rule that came with Next 16.4. Left
    // as-is: this component is hidden while search by image is turned off
    // (see lib/listings/embeddings.ts); revisit when it's brought back.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrl(null);
  }, [busy, previewUrl]);

  // Play the attention ring the first time the button actually scrolls into
  // view (not on page load, when it's usually off-screen), once per session.
  useEffect(() => {
    const button = buttonRef.current;
    if (!button || hintAlreadySeen() || typeof IntersectionObserver === "undefined") return;
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
    setHint(false);
    markHintSeen();
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setRequesting(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/search-by-image", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not search by image.");
        return;
      }
      requestScrollToResults();
      startTransition(() => {
        router.push(`/?imageMatch=${(data.ids as string[]).join(",")}`, { scroll: false });
      });
    } catch {
      setError("Could not search by image. Try again.");
    } finally {
      // Back to idle for the request itself; the navigation (if any) keeps
      // the card up via isNavigating. This is also what un-sticks the button
      // after a search + "Clear", since the component never unmounts.
      setRequesting(false);
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
        {hint && !busy && (
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
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          title="Search by image"
          aria-label="Search by image"
          className="group/scan relative flex items-center justify-center rounded-md border border-zinc-300 p-2.5 text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <ScanCameraIcon always={busy} />
        </button>
      </div>
      {busy && (
        <SearchingCard previewUrl={previewUrl} subtitle="Matching your photo to similar listings" />
      )}
      {error && (
        <p className="absolute top-full left-0 z-10 mt-1 w-48 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
