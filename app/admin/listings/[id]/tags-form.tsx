import type { ListingTag } from "@/lib/listings/queries";
import { saveTags } from "../actions";

export function TagsForm({
  listingId,
  allTags,
  selectedIds,
}: {
  listingId: string;
  allTags: ListingTag[];
  selectedIds: string[];
}) {
  const selected = new Set(selectedIds);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Experience tags</h2>

      {allTags.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No experience tags exist yet.
        </p>
      ) : (
        <form action={saveTags} className="flex flex-col gap-3">
          <input type="hidden" name="listingId" value={listingId} />
          <div className="flex flex-wrap gap-3">
            {allTags.map((tag) => (
              <label
                key={tag.id}
                className="flex items-center gap-2 rounded-full border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
              >
                <input
                  type="checkbox"
                  name="tagIds"
                  value={tag.id}
                  defaultChecked={selected.has(tag.id)}
                />
                {tag.name}
              </label>
            ))}
          </div>
          <button
            type="submit"
            className="w-fit rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Save tags
          </button>
        </form>
      )}
    </section>
  );
}
