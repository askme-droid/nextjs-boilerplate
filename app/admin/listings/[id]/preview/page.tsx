import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/require-staff";
import { isExpired } from "@/lib/listings/expiry-dates";
import { getListingForPreview } from "@/lib/listings/queries";
import { ListingView } from "@/app/listings/[slug]/listing-view";
import { publishListing } from "../../actions";

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending review",
  published: "Published",
  rejected: "Rejected",
};

/** Staff-only preview of a listing's page as visitors will see it, whatever
 *  its status. Never counts a view. */
export default async function PreviewListingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const listing = await getListingForPreview(id);
  if (!listing) notFound();

  const isLive = listing.status === "published" && !isExpired(listing.expires_at);
  const goesElsewhere = listing.redirect_url ?? listing.external_url;

  const banner = (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <p>
        <span className="font-semibold">Preview</span> — this is how the listing page will look.{" "}
        Status: <span className="font-semibold">{STATUS_LABEL[listing.status] ?? listing.status}</span>
        {isLive ? " (visible to the public now)." : " — not visible to the public yet."}
      </p>
      {goesElsewhere && (
        <p>
          Note: when published, visitors who open this listing are sent to{" "}
          <a href={goesElsewhere} target="_blank" rel="noopener noreferrer nofollow" className="underline">
            {goesElsewhere}
          </a>{" "}
          instead of this page.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/admin/listings/${listing.id}/edit`}
          className="rounded-md border border-amber-400 bg-white px-3 py-1.5 font-medium text-zinc-900 hover:bg-amber-100 dark:bg-transparent dark:text-amber-100"
        >
          ← Back to editing
        </Link>
        {listing.status !== "published" && (
          <form action={publishListing}>
            <input type="hidden" name="id" value={listing.id} />
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:opacity-90 dark:bg-emerald-700"
            >
              Publish
            </button>
          </form>
        )}
        {isLive && (
          <Link href={`/listings/${listing.slug}`} className="self-center underline underline-offset-4">
            Open the live page
          </Link>
        )}
      </div>
    </div>
  );

  return <ListingView listing={listing} banner={banner} />;
}
