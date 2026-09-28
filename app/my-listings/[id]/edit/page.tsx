import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getCategories } from "@/lib/listings/queries";
import { getMyListingById, getMyListingImages } from "@/lib/listings/user-queries";
import { MyListingForm } from "../../listing-form";
import { MyImageManager } from "../image-manager";

export default async function EditMyListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { user } = await requireUser();
  const { id } = await params;
  const { saved, error } = await searchParams;

  const [listing, categories, images] = await Promise.all([
    getMyListingById(id, user.id),
    getCategories(),
    getMyListingImages(id, user.id),
  ]);

  if (!listing) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
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

      <MyListingForm
        listingId={listing.id}
        categories={categories}
        currentStatus={listing.status}
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
          expires_at: listing.expires_at ?? "",
        }}
      >
        <MyImageManager listingId={listing.id} images={images} />
      </MyListingForm>
    </main>
  );
}
