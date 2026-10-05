"use client";

import { deleteCategory } from "./actions";

const styles = {
  // Compact text link, for a row in the categories list.
  link: { className: "text-sm text-red-600 hover:underline dark:text-red-400", label: "Delete" },
  // Outlined button, for the danger zone on a category's edit page.
  button: {
    className:
      "w-fit rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20",
    label: "Delete category",
  },
} as const;

/**
 * Delete button for a category. Deleting is immediate and permanent, and
 * quietly un-categorizes every listing in it (listings.category_id is ON
 * DELETE SET NULL), so ask first and say how many listings that touches.
 */
export function DeleteCategoryButton({
  id,
  name,
  listingCount,
  variant = "link",
}: {
  id: string;
  name: string;
  listingCount: number;
  variant?: keyof typeof styles;
}) {
  const consequence =
    listingCount === 0
      ? "No listings use it."
      : `${listingCount} listing${listingCount === 1 ? "" : "s"} will be left uncategorized (${
          listingCount === 1 ? "it isn't" : "they aren't"
        } deleted).`;
  const { className, label } = styles[variant];

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
      <button type="submit" className={className} aria-label={`Delete category ${name}`}>
        {label}
      </button>
    </form>
  );
}
