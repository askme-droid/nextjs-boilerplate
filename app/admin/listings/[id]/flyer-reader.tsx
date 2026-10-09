"use client";

import { useState } from "react";
import { readFlyer } from "@/lib/flyer-reader/ocr";
import { analyse, createSegmenter, type CorpusItem, type FlyerReading } from "@/lib/flyer-reader/text";
import type { ListingCategory } from "@/lib/listings/queries";
import { getCategoryCorpus } from "../reader-actions";

const hintClass = "text-xs text-zinc-500 dark:text-zinc-400";
const smallButton =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800";

type FieldName = "title" | "description" | "keywords" | "expires_at" | "location" | "category_id";

/** The edit form's inputs are plain uncontrolled fields, so setting the DOM
 *  value (and announcing it) is what changes them — and what gets saved. */
function formField(name: FieldName) {
  const form = document.getElementById("listing-form") as HTMLFormElement | null;
  return (form?.elements.namedItem(name) ?? null) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
}

function setFormField(name: FieldName, value: string): boolean {
  const element = formField(name);
  if (!element) return false;
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

const isEmpty = (name: FieldName) => (formField(name)?.value ?? "").trim() === "";

const LABELS: Record<FieldName, string> = {
  title: "title",
  description: "description",
  keywords: "keywords",
  expires_at: "expiry date",
  location: "location",
  category_id: "category",
};

/**
 * "Read the flyer (free)": reads the text on the flyer chosen in the box above
 * with an OCR model that runs in this browser, then suggests values for the
 * form. It never overwrites anything on its own — "Fill empty fields" only
 * touches blank fields, and each suggestion has its own button.
 *
 * It is the free alternative to the Claude "Generate" button next to it. It
 * finds things with a recognisable shape (dates, phone numbers, addresses,
 * the biggest lettering); it does not understand the flyer.
 */
export function FlyerReader({
  categories,
  getFile,
  loadCorpus = getCategoryCorpus,
}: {
  categories: ListingCategory[];
  getFile: () => File | null;
  /** Where the category hints come from; the staff-only server action unless a test supplies its own. */
  loadCorpus?: () => Promise<CorpusItem[]>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<FlyerReading | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";

  async function run() {
    const file = getFile();
    setNote(null);
    if (!file) {
      setError("Choose a flyer image in the box above first.");
      return;
    }
    setError(null);
    setReading(null);
    setBusy("Loading the reader…");
    try {
      const [corpus, read] = await Promise.all([
        // The category hints are a bonus: if this fails, the rest still works.
        loadCorpus().catch(() => []),
        readFlyer(file, (p) =>
          setBusy(p.phase === "loading" ? "Loading the reader…" : `Reading the flyer… ${p.done} of ${p.total}`),
        ),
      ]);
      const result = analyse(read.lines, { segment: createSegmenter(read.words), corpus });
      if (!result.lines.length) {
        setError("The reader couldn't find any text on that image. Try a clearer or larger copy.");
        return;
      }
      setReading(result);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? `The flyer could not be read: ${e.message}`
          : "The flyer could not be read in this browser.",
      );
    } finally {
      setBusy(null);
    }
  }

  function use(name: FieldName, value: string) {
    if (setFormField(name, value)) setNote(`Set the ${LABELS[name]} — review it, then save.`);
  }

  function fillEmpty() {
    if (!reading) return;
    const wanted: [FieldName, string][] = [
      ["description", reading.description],
      ["keywords", reading.keywords.join(", ")],
      ["expires_at", reading.expiry?.iso ?? ""],
      ["location", reading.location],
    ];
    const filled = wanted.filter(([name, value]) => value && isEmpty(name) && setFormField(name, value)).map(([name]) => LABELS[name]);
    setNote(
      filled.length
        ? `Filled ${filled.join(", ")}. Nothing existing was changed — review it, then save.`
        : "Nothing to fill: those fields already have content, or nothing was found for them.",
    );
  }

  const rowClass = "flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3";
  const labelClass = "w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

  return (
    <div className="flex flex-col gap-3 border-t border-dashed border-zinc-300 pt-4 dark:border-zinc-700">
      <div>
        <h3 className="text-sm font-semibold">Or read the flyer for free</h3>
        <p className={hintClass}>
          Reads the text on the flyer above, on this computer — no credits, nothing uploaded. It finds
          dates, phone numbers and addresses and suggests wording, but it doesn&apos;t understand the
          flyer the way the AI does, so check everything.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={busy !== null}
          className="w-fit rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {busy ?? "Read flyer (free)"}
        </button>
        {!busy && !reading && <span className={hintClass}>Works with PNG, JPEG and WebP. The first read downloads about 16 MB.</span>}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {reading && (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">What the reader found</p>
            <button type="button" onClick={fillEmpty} className={smallButton}>
              Fill empty fields
            </button>
          </div>

          {note && (
            <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              {note}
            </p>
          )}

          {reading.title && (
            <div className={rowClass}>
              <span className={labelClass}>Title</span>
              <span className="flex-1 text-sm">{reading.title}</span>
              <button type="button" onClick={() => use("title", reading.title)} className={smallButton}>
                Use
              </button>
            </div>
          )}

          {reading.categories.length > 0 && (
            <div className={rowClass}>
              <span className={labelClass}>Category</span>
              <span className="flex flex-1 flex-wrap items-center gap-2">
                {reading.categories.map((hint) => (
                  <button
                    key={hint.categoryId}
                    type="button"
                    onClick={() => use("category_id", hint.categoryId)}
                    className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:border-brand-teal hover:text-brand-teal dark:border-zinc-700"
                  >
                    {categoryName(hint.categoryId) || "Category"}
                  </button>
                ))}
                <span className={hintClass}>closest to existing listings — a guess, not always right</span>
              </span>
            </div>
          )}

          {reading.description && (
            <div className={rowClass}>
              <span className={labelClass}>Description</span>
              <span className="flex-1 text-sm">{reading.description}</span>
              <button type="button" onClick={() => use("description", reading.description)} className={smallButton}>
                Use
              </button>
            </div>
          )}

          {reading.keywords.length > 0 && (
            <div className={rowClass}>
              <span className={labelClass}>Keywords</span>
              <span className="flex-1 text-sm">{reading.keywords.join(", ")}</span>
              <button type="button" onClick={() => use("keywords", reading.keywords.join(", "))} className={smallButton}>
                Use
              </button>
            </div>
          )}

          {reading.expiry && (
            <div className={rowClass}>
              <span className={labelClass}>Expiry date</span>
              <span className="flex-1 text-sm">
                {reading.expiry.iso} <span className={hintClass}>(from &quot;{reading.expiry.raw}&quot;)</span>
              </span>
              <button type="button" onClick={() => use("expires_at", reading.expiry!.iso)} className={smallButton}>
                Use
              </button>
            </div>
          )}

          {reading.location && (
            <div className={rowClass}>
              <span className={labelClass}>Location</span>
              <span className="flex-1 text-sm">{reading.location}</span>
              <button type="button" onClick={() => use("location", reading.location)} className={smallButton}>
                Use
              </button>
            </div>
          )}

          {reading.phones.length > 0 && (
            <div className={rowClass}>
              <span className={labelClass}>Phone</span>
              <span className="flex-1 text-sm">
                {reading.phones.join(", ")} <span className={hintClass}>(the form has no phone field — add it to the description if needed)</span>
              </span>
            </div>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-400">
              All the text found ({reading.lines.length} lines)
            </summary>
            <ul className="mt-2 flex flex-col gap-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              {reading.lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
