import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-staff";
import { getExperienceTagById, getListingCountForExperienceTag } from "@/lib/experience-tags/queries";
import { ExperienceTagForm } from "../../experience-tag-form";
import { deleteExperienceTag } from "../../actions";

export default async function EditExperienceTagPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const { saved } = await searchParams;

  const tag = await getExperienceTagById(id);
  if (!tag) notFound();

  const listingCount = await getListingCountForExperienceTag(id);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Edit experience</h1>

      {saved && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          Saved.
        </p>
      )}

      <ExperienceTagForm
        tagId={tag.id}
        submitLabel="Save changes"
        initialValues={{ name: tag.name, slug: tag.slug }}
      />

      <section className="flex flex-col gap-2 rounded-lg border border-red-200 p-4 dark:border-red-900/50">
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">Delete experience</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {listingCount === 0
            ? "No listings carry this experience."
            : `${listingCount} listing${listingCount === 1 ? "" : "s"} currently ${
                listingCount === 1 ? "carries" : "carry"
              } this experience — deleting it will remove the tag from ${listingCount === 1 ? "that listing" : "them"}, not delete ${listingCount === 1 ? "it" : "them"}.`}
        </p>
        <form action={deleteExperienceTag}>
          <input type="hidden" name="id" value={tag.id} />
          <button
            type="submit"
            className="w-fit rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Delete experience
          </button>
        </form>
      </section>
    </div>
  );
}
