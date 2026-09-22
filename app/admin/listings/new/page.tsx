import { getCategories } from "@/lib/listings/queries";
import { ListingForm } from "../listing-form";

export default async function NewListingPage() {
  const categories = await getCategories();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New listing</h1>
      <ListingForm categories={categories} submitLabel="Create listing" />
    </div>
  );
}
