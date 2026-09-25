import { requireAdmin } from "@/lib/auth/require-staff";
import { ExperienceTagForm } from "../experience-tag-form";

// requireAdmin() here, not just in the action: the layout only checks
// requireStaff() (admin or editor), so without this an editor would see the
// form render fine and only discover on submit that it 404s.
export default async function NewExperienceTagPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New experience</h1>
      <ExperienceTagForm submitLabel="Create experience" />
    </div>
  );
}
