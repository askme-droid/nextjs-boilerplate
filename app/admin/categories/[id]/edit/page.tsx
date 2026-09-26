import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-staff";
import { getCategoryById, getListingCountForCategory } from "@/lib/categories/queries";
import { CategoryForm } from "../../category-form";
import { deleteCategory } from "../../actions";

export default async function EditCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { saved } = await searchParams;

  const category = await getCategoryById(id);
  if (!category) notFound();

  const listingCount = await getListingCountForCategory(id);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Edit category</h1>

      {saved && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          Saved.
        </p>
      )}

      <CategoryForm
        categoryId={category.id}
        submitLabel="Save changes"
        initialValues={{
          name: category.name,
          slug: category.slug,
          description: category.description ?? "",
        }}
      >
        <section className="flex flex-col gap-2 rounded-lg border border-red-200 p-4 dark:border-red-900/50">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">Delete category</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {listingCount === 0
              ? "No listings use this category."
              : `${listingCount} listing${listingCount === 1 ? "" : "s"} currently ${
                  listingCount === 1 ? "uses" : "use"
                } this category — deleting it will leave ${listingCount === 1 ? "that listing" : "them"} uncategorized, not delete ${listingCount === 1 ? "it" : "them"}.`}
          </p>
          <form action={deleteCategory}>
            <input type="hidden" name="id" value={category.id} />
            <button
              type="submit"
              className="w-fit rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Delete category
            </button>
          </form>
        </section>
      </CategoryForm>
    </div>
  );
}
