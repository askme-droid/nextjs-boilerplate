import { requireUser } from "@/lib/auth/require-user";
import { getCategories } from "@/lib/listings/queries";
import { MyListingForm } from "../listing-form";

export default async function NewMyListingPage() {
  await requireUser();
  const categories = await getCategories();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">New listing</h1>
      <MyListingForm categories={categories} />
    </main>
  );
}
