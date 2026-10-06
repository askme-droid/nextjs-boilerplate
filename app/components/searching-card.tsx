import { Search } from "lucide-react";
import Image from "next/image";

/** Viewfinder corner (one of four). */
function Corner({ className }: { className: string }) {
  return <span aria-hidden className={`absolute size-3 border-brand-teal ${className}`} />;
}

/**
 * The "search in progress" card, shared by text search and photo search.
 * With a `previewUrl` it shows the visitor's own photo with a scanner beam
 * over it; without one, a magnifying glass sweeping around. Fixed to the
 * bottom of the screen and click-through, so it never blocks the page.
 */
export function SearchingCard({
  previewUrl,
  subtitle,
}: {
  previewUrl?: string | null;
  subtitle: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 pr-5 shadow-xl motion-safe:animate-pop-in dark:border-zinc-700 dark:bg-zinc-900">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
          {previewUrl ? (
            <>
              <Image src={previewUrl} alt="" fill unoptimized className="object-cover" />
              <span
                aria-hidden
                className="absolute inset-x-0 hidden h-0.5 bg-brand-orange shadow-[0_0_10px_2px] shadow-brand-orange motion-safe:block motion-safe:animate-scan-line"
              />
            </>
          ) : (
            <span className="grid size-full place-items-center bg-brand-teal/10">
              <Search
                aria-hidden
                className="size-7 text-brand-teal motion-safe:animate-search-sweep"
              />
            </span>
          )}
          <Corner className="left-1 top-1 border-l-2 border-t-2" />
          <Corner className="right-1 top-1 border-r-2 border-t-2" />
          <Corner className="bottom-1 left-1 border-b-2 border-l-2" />
          <Corner className="bottom-1 right-1 border-b-2 border-r-2" />
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Hidden deals searching now…
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
