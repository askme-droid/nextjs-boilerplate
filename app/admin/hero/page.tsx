import Link from "next/link";
import { requireStaff } from "@/lib/auth/require-staff";
import { getAllHeroSlides } from "@/lib/hero/queries";
import { addHeroSlide, deleteHeroSlide, moveHeroSlide, toggleHeroSlide, updateHeroSlide } from "./actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";
const buttonClass =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-sm font-medium hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent dark:border-zinc-700 dark:hover:bg-zinc-800";

export const metadata = { title: "Homepage header slider" };

export default async function HeroSlidesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  await requireStaff("/admin/hero");
  const { msg, error } = await searchParams;
  const slides = await getAllHeroSlides();
  const shown = slides.filter((s) => s.active).length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400">
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Homepage header slider</h1>
        <p className="max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          The flyers scrolling at the top of the homepage, in the order below ({shown} shown). Portrait A4-shaped images
          fit best (e.g. 1240 × 1754 px). Hide a slide to take it off the homepage without deleting it.
        </p>
      </div>

      {msg && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          {msg}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Slides</h2>
        {slides.length === 0 && (
          <p className="text-sm text-zinc-500">No slides yet — the homepage header shows just the text. Add one below.</p>
        )}
        <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {slides.map((slide, i) => (
            <li key={slide.id} className={`flex flex-col gap-3 p-3 sm:flex-row ${slide.active ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-3">
                <span className="w-5 pt-1 text-right text-sm tabular-nums text-zinc-500">{i + 1}</span>
                {/* Plain <img>: any address, and animated GIFs keep moving. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slide.imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-28 w-20 shrink-0 rounded object-cover shadow-sm"
                />
              </div>
              <form action={updateHeroSlide} className="flex min-w-0 flex-1 flex-col gap-2">
                <input type="hidden" name="id" value={slide.id} />
                <label className="text-xs font-medium">
                  Description (alt text)
                  <input name="altText" defaultValue={slide.altText} maxLength={300} className={inputClass} />
                </label>
                <label className="text-xs font-medium">
                  Link when clicked (optional)
                  <input
                    name="linkUrl"
                    defaultValue={slide.linkUrl ?? ""}
                    placeholder="/listings/your-listing or https://…"
                    className={inputClass}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="submit" className={buttonClass}>
                    Save
                  </button>
                  {!slide.active && (
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium dark:bg-zinc-800">Hidden</span>
                  )}
                </div>
              </form>
              <div className="flex flex-wrap items-start gap-2 sm:w-44 sm:flex-col sm:items-stretch">
                <div className="flex gap-2">
                  <form action={moveHeroSlide}>
                    <input type="hidden" name="id" value={slide.id} />
                    <input type="hidden" name="direction" value="up" />
                    <button type="submit" disabled={i === 0} className={buttonClass} aria-label="Move up">
                      ↑
                    </button>
                  </form>
                  <form action={moveHeroSlide}>
                    <input type="hidden" name="id" value={slide.id} />
                    <input type="hidden" name="direction" value="down" />
                    <button
                      type="submit"
                      disabled={i === slides.length - 1}
                      className={buttonClass}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </form>
                </div>
                <form action={toggleHeroSlide}>
                  <input type="hidden" name="id" value={slide.id} />
                  <button type="submit" className={`${buttonClass} w-full`}>
                    {slide.active ? "Hide" : "Show"}
                  </button>
                </form>
                <form action={deleteHeroSlide}>
                  <input type="hidden" name="id" value={slide.id} />
                  <button
                    type="submit"
                    className={`${buttonClass} w-full border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400`}
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <h2 className="text-lg font-semibold">Add a slide</h2>
        <form action={addHeroSlide} className="flex flex-col gap-3">
          <label className="text-sm font-medium">
            Image file (JPG, PNG, WebP or GIF, up to 10MB)
            <input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif" className="mt-1 block text-sm" />
          </label>
          <label className="text-sm font-medium">
            …or an image address
            <input name="imageUrl" type="url" placeholder="https://…/flyer.jpg" className={inputClass} />
            <span className="mt-1 block text-xs font-normal text-zinc-500">
              Use this until file uploads are set up (Cloudflare R2), e.g. a flyer image already on fd.sg.
            </span>
          </label>
          <label className="text-sm font-medium">
            Description (alt text)
            <input
              name="altText"
              maxLength={300}
              placeholder="e.g. Kumon — save $50 on registration"
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium">
            Link when clicked (optional)
            <input name="linkUrl" placeholder="/listings/your-listing or https://…" className={inputClass} />
          </label>
          <button
            type="submit"
            className="w-fit rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Add slide
          </button>
        </form>
      </section>
    </div>
  );
}
