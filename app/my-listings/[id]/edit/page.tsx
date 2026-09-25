import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getCategories } from "@/lib/listings/queries";
import { getMyListingById } from "@/lib/listings/user-queries";
import { MyListingForm } from "../../listing-form";

export default async function EditMyListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireUser();
  const { id } = await params;

  const [listing, categories] = await Promise.all([
    getMyListingById(id, user.id),
    getCategories(),
  ]);

  if (!listing) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit listing</h1>
      <MyListingForm
        listingId={listing.id}
        categories={categories}
        currentStatus={listing.status}
        initialValues={{
          title: listing.title,
          slug: listing.slug,
          category_id: listing.category_id ?? "",
          location: listing.location ?? "",
          keywords: (listing.keywords ?? []).join(", "),
          description: listing.description ?? "",
          expires_at: listing.expires_at ?? "",
        }}
      />
    </main>
  );
}
