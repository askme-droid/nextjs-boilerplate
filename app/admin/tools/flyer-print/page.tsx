import Link from "next/link";
import { requireStaff } from "@/lib/auth/require-staff";
import { FlyerPrintTool } from "./flyer-print-tool";

export const metadata = { title: "Flyer print prep" };

// The tool itself runs entirely in the browser (see lib/flyer-print/render.ts),
// so there is nothing to protect on the server beyond who can open this page.
export default async function FlyerPrintPage() {
  await requireStaff("/admin/tools/flyer-print");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/admin"
          className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Flyer print prep</h1>
        <p className="max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          Turn a flyer image into a print-ready file: resized to exactly 300 dpi for the paper size,
          with optional bleed and crop marks. It all happens in your browser, so the flyer is never
          uploaded.
        </p>
      </div>
      <FlyerPrintTool />
    </div>
  );
}
