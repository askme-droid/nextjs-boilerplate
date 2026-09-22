import { requireAdmin } from "@/lib/auth/require-staff";
import { CategoryForm } from "../category-form";

// requireAdmin() here, not just in the action: the layout only checks
// requireStaff() (admin or editor), so without this an editor would see the
// form render fine and only discover on submit that it 404s.
export default async function NewCategoryPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New category</h1>
      <CategoryForm submitLabel="Create category" />
    </div>
  );
}
