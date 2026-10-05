"use client";

import { deleteCategory } from "./actions";

/**
 * Delete button for a category row. Deleting is immediate and permanent, and
 * quietly un-categorizes every listing in it (listings.category_id is ON
 * DELETE SET NULL), so ask first and say how many listings that touches.
 */
export function DeleteCategoryButton({
  id,
  name,
  listingCount,
}: {
  id: string;
  name: string;
  listingCount: number;
}) {
  const consequence =
    listingCount === 0
      ? "No listings use it."
      : `${listingCount} listing${listingCount === 1 ? "" : "s"} will be left uncategorized (${
          listingCount === 1 ? "it isn't" : "they aren't"
        } deleted).`;

  return (
    <form
      action={deleteCategory}
      onSubmit={(event) => {
        if (!window.confirm(`Delete the category "${name}"?\n\n${consequence}\n\nThis cannot be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-sm text-red-600 hover:underline dark:text-red-400"
        aria-label={`Delete category ${name}`}
      >
        Delete
      </button>
    </form>
  );
}
