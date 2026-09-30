import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/require-staff";
import {
  getAdminListingById,
  getExperienceTags,
} from "@/lib/listings/admin-queries";
import { getCategories } from "@/lib/listings/queries";
import { EditListingClient } from "../edit-listing-client";
import { ImageManager } from "../image-manager";
import { deleteListing } from "../../actions";

export default async function EditListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const { role } = await requireStaff();

  const [listing, categories, allTags] = await Promise.all([
    getAdminListingById(id, role),
    getCategories(),
    getExperienceTags(),
  ]);

  if (!listing) notFound();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Edit listing</h1>

      {saved && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          Saved.
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </p>
      )}

      {listing.external_url && (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
          Synced from{" "}
          <a href={listing.external_url} target="_blank" rel="noopener noreferrer nofollow" className="underline">
            {listing.external_url}
          </a>
          . Changes below only affect how this listing's card looks in search — the actual content stays at the source.
        </p>
      )}

      <EditListingClient
        listingId={listing.id}
        categories={categories}
        initialValues={{
          title: listing.title,
          slug: listing.slug,
          category_id: listing.category_id ?? "",
          location: listing.location ?? "",
          company_name: listing.company_name ?? "",
          company_uen: listing.company_uen ?? "",
          social_links: listing.social_links.join("\n"),
          cta_label: listing.cta_label ?? "",
          cta_url: listing.cta_url ?? "",
          keywords: (listing.keywords ?? []).join(", "),
          description: listing.description ?? "",
          status: listing.status,
          expires_at: listing.expires_at ?? "",
        }}
        allTags={allTags}
        selectedTagIds={listing.tagIds}
      >
        <ImageManager listingId={listing.id} images={listing.listing_images} />

        <section className="flex flex-col gap-2 rounded-lg border border-red-200 p-4 dark:border-red-900/50">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">Delete listing</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {listing.status === "published"
              ? "This listing is live — deleting it removes it from the site immediately, along with its images and tags. This cannot be undone."
              : "Deleting removes this listing, its images, and its tags. This cannot be undone."}
          </p>
          <form action={deleteListing}>
            <input type="hidden" name="id" value={listing.id} />
            <button
              type="submit"
              className="w-fit rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Delete listing
            </button>
          </form>
        </section>
      </EditListingClient>
    </div>
  );
}
