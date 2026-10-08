"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  DEFAULT_BLEED_MM,
  DPI,
  MAX_BLEED_MM,
  PAPER_SIZES,
  autoOrientation,
  croppedShare,
  effectiveDpi,
  judgeDpi,
  planPrint,
  type FitMode,
  type Orientation,
  type PaperKey,
} from "@/lib/flyer-print/geometry";
import { renderPrintFiles, type BleedMode } from "@/lib/flyer-print/render";

const fieldClass =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
const labelClass = "flex flex-col gap-1 text-sm font-medium";
const hintClass = "text-xs font-normal text-zinc-500 dark:text-zinc-400";
const downloadClass =
  "inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90";

// Decoding and resizing hold several full-size copies in memory at once.
const MAX_SOURCE_PIXELS = 120_000_000;

type Source = { name: string; bitmap: ImageBitmap; previewUrl: string };

type Result = {
  key: string;
  baseName: string;
  pngUrl: string;
  pdfUrl: string;
  previewUrl: string;
  pngBytes: number;
  pdfBytes: number;
};

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const verdictClass = {
  great: "text-emerald-700 dark:text-emerald-400",
  good: "text-emerald-700 dark:text-emerald-400",
  soft: "text-amber-700 dark:text-amber-400",
  low: "text-red-600 dark:text-red-400",
} as const;

export function FlyerPrintTool() {
  const [source, setSource] = useState<Source | null>(null);
  const [paper, setPaper] = useState<PaperKey>("A4");
  const [orientationChoice, setOrientationChoice] = useState<"auto" | Orientation>("auto");
  const [fit, setFit] = useState<FitMode>("fill");
  const [addBleed, setAddBleed] = useState(true);
  const [bleedInput, setBleedInput] = useState(String(DEFAULT_BLEED_MM));
  const [bleedMode, setBleedMode] = useState<BleedMode>("mirror");
  const [marks, setMarks] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Everything we've made an object URL for, so it can be released.
  const urls = useRef<string[]>([]);
  const track = (url: string) => {
    urls.current.push(url);
    return url;
  };
  useEffect(() => {
    const held = urls.current;
    return () => held.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const orientation: Orientation =
    orientationChoice === "auto"
      ? source
        ? autoOrientation(source.bitmap.width, source.bitmap.height)
        : "portrait"
      : orientationChoice;
  const bleedMm = addBleed ? Math.min(MAX_BLEED_MM, Math.max(0, Number.parseFloat(bleedInput) || 0)) : 0;
  const plan = planPrint({ paper, orientation, bleedMm, marks });

  const dpi = source ? effectiveDpi(source.bitmap.width, source.bitmap.height, plan, fit) : null;
  const verdict = dpi === null ? null : judgeDpi(dpi);
  const cropped = source && fit === "fill" ? croppedShare(source.bitmap.width, source.bitmap.height, plan) : 0;

  // The downloads belong to the settings they were made with.
  const settingsKey = JSON.stringify([
    source?.name,
    source?.bitmap.width,
    source?.bitmap.height,
    paper,
    orientation,
    fit,
    bleedMm,
    bleedMode,
    marks,
  ]);
  const current = result && result.key === settingsKey ? result : null;

  async function loadFile(file: File) {
    setError(null);
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setError("Choose a PNG, JPEG or WebP image.");
      return;
    }
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      setError("That image could not be opened. Try saving it again as a JPEG or PNG.");
      return;
    }
    if (bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) {
      bitmap.close();
      setError("That image is too large to process in the browser (over 120 megapixels).");
      return;
    }
    source?.bitmap.close();
    setSource({ name: file.name, bitmap, previewUrl: track(URL.createObjectURL(file)) });
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  }

  async function create() {
    if (!source) return;
    setError(null);
    setWorking("Starting…");
    const baseName = source.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-") || "flyer";
    const title = `${baseName} — ${paper} print file`;
    try {
      const made = await renderPrintFiles(source.bitmap, { plan, fit, bleedMode, title }, setWorking);
      setResult({
        key: settingsKey,
        baseName,
        pngUrl: track(URL.createObjectURL(made.png)),
        pdfUrl: track(URL.createObjectURL(made.pdf)),
        previewUrl: track(made.previewUrl),
        pngBytes: made.png.size,
        pdfBytes: made.pdf.size,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong while creating the files. Try a smaller image.",
      );
    } finally {
      setWorking(null);
    }
  }

  const suffix = `${paper}-300dpi${plan.bleedMm > 0 ? `-bleed${plan.bleedMm}mm` : ""}${plan.marks ? "-marks" : ""}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">1. Choose the flyer</h2>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
              dragging
                ? "border-brand-teal bg-brand-teal/5"
                : "border-zinc-300 hover:border-brand-teal dark:border-zinc-700"
            }`}
          >
            <span className="font-medium">Click to choose, or drop an image here</span>
            <span className={hintClass}>PNG, JPEG or WebP. It stays on this computer — nothing is uploaded.</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void loadFile(file);
                e.target.value = "";
              }}
            />
          </label>

          {source && (
            <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, not a site image */}
              <img src={source.previewUrl} alt="" className="h-16 w-16 rounded object-cover" />
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{source.name}</p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  {source.bitmap.width} × {source.bitmap.height} px
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">2. Print settings</h2>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Paper size
              <select
                value={paper}
                onChange={(e) => setPaper(e.target.value as PaperKey)}
                className={fieldClass}
              >
                {Object.entries(PAPER_SIZES).map(([key, size]) => (
                  <option key={key} value={key}>
                    {size.label} · {size.w} × {size.h} mm
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Orientation
              <select
                value={orientationChoice}
                onChange={(e) => setOrientationChoice(e.target.value as "auto" | Orientation)}
                className={fieldClass}
              >
                <option value="auto">Automatic</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
          </div>

          <label className={labelClass}>
            If the shape doesn&apos;t match the paper
            <select
              value={fit}
              onChange={(e) => setFit(e.target.value as FitMode)}
              className={fieldClass}
            >
              <option value="fill">Fill the page (trims a little off the edges)</option>
              <option value="fit">Fit inside (leaves white margins)</option>
            </select>
          </label>

          <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={addBleed}
                onChange={(e) => setAddBleed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Add bleed</span>
                <span className={`${hintClass} block`}>
                  Extra picture past the trim line so the cut never leaves a white edge.
                </span>
              </span>
            </label>

            {addBleed && (
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  Bleed (mm)
                  <input
                    type="number"
                    min={0}
                    max={MAX_BLEED_MM}
                    step={0.5}
                    inputMode="decimal"
                    value={bleedInput}
                    onChange={(e) => setBleedInput(e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  Bleed made by
                  <select
                    value={bleedMode}
                    onChange={(e) => setBleedMode(e.target.value as BleedMode)}
                    className={fieldClass}
                  >
                    <option value="mirror">Mirror the edges</option>
                    <option value="stretch">Stretch edge colour</option>
                  </select>
                </label>
              </div>
            )}

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={marks}
                onChange={(e) => setMarks(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Add crop marks</span>
                <span className={`${hintClass} block`}>
                  Small corner lines outside the bleed that show the printer where to cut.
                </span>
              </span>
            </label>
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">3. Check and create</h2>

          <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-zinc-200 p-4 text-sm sm:grid-cols-[auto_1fr] dark:border-zinc-800">
            <dt className="text-zinc-500 dark:text-zinc-400">Finished size</dt>
            <dd>
              {PAPER_SIZES[paper].label} {orientation} — {plan.trimWmm} × {plan.trimHmm} mm
              <span className="text-zinc-500 dark:text-zinc-400">
                {" "}
                ({plan.trimW} × {plan.trimH} px at {DPI} dpi)
              </span>
            </dd>

            {(plan.bleedMm > 0 || plan.marks) && (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Page with bleed{plan.marks ? " and marks" : ""}</dt>
                <dd>
                  {Number(plan.pageWmm.toFixed(1))} × {Number(plan.pageHmm.toFixed(1))} mm
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {" "}
                    ({plan.pageW} × {plan.pageH} px)
                  </span>
                </dd>
              </>
            )}

            {source && dpi !== null && verdict && (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Your flyer is</dt>
                <dd>
                  <span className="font-medium">about {Math.round(dpi)} dpi</span> at this size.{" "}
                  <span className={verdictClass[verdict.level]}>{verdict.text}</span>
                </dd>
              </>
            )}

            {cropped > 0.02 && (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Shape</dt>
                <dd className="text-amber-700 dark:text-amber-400">
                  About {Math.round(cropped * 100)}% of the picture will be trimmed off the edges to
                  fill the page. Choose &quot;Fit inside&quot; to keep all of it.
                </dd>
              </>
            )}
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={create}
              disabled={!source || working !== null}
              className={`${downloadClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {working ? working : current ? "Create again" : "Create print files"}
            </button>
            {!source && (
              <span className={hintClass}>Choose a flyer first.</span>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </p>
          )}
        </section>

        {result && !current && !working && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            The settings have changed since these files were made. Create them again to download
            files that match.
          </p>
        )}

        {current && (
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Your print files</h2>
            <div className="flex flex-wrap gap-3">
              <a href={current.pdfUrl} download={`${current.baseName}-${suffix}.pdf`} className={downloadClass}>
                Download PDF ({megabytes(current.pdfBytes)})
              </a>
              <a
                href={current.pngUrl}
                download={`${current.baseName}-${suffix}.png`}
                className={`${downloadClass} !bg-transparent !text-foreground border border-zinc-300 dark:border-zinc-700`}
              >
                Download PNG ({megabytes(current.pngBytes)})
              </a>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-800 dark:bg-zinc-900">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview */}
              <img
                src={current.previewUrl}
                alt="Preview of the finished print page, with crop marks if selected"
                className="mx-auto max-h-[36rem] w-auto max-w-full shadow-md"
              />
            </div>

            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                The PDF has the finished size{plan.bleedMm > 0 ? " and the bleed" : ""} built in
                {plan.marks ? ", with sharp vector crop marks" : ""}. The PNG is the same page as
                one picture, tagged {DPI} dpi.
              </li>
              {plan.bleedMm > 0 && (
                <li>
                  Bleed is made from the picture itself, so keep text and logos about 5 mm inside
                  the edge.
                </li>
              )}
              <li>Colours stay as RGB. Your print shop converts them to CMYK.</li>
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
