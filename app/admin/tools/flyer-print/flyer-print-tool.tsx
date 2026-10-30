"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  DEFAULT_BLEED_MM,
  DPI,
  MAX_BLEED_MM,
  checkCustomPaper,
  MAX_CUSTOM_MM,
  MAX_PAGE_PIXELS,
  MIN_CUSTOM_MM,
  PAPER_SIZES,
  autoOrientation,
  croppedShare,
  effectiveDpi,
  judgeDpi,
  placement,
  planPrint,
  type FitMode,
  type Orientation,
  type PaperKey,
} from "@/lib/flyer-print/geometry";
import { ENHANCE_SCALE, canEnhance, webGpuAvailable } from "@/lib/flyer-print/enhance";
import {
  combinePdfs,
  normalizeHexColor,
  renderPrintFiles,
  type BleedMode,
  type PrintSource,
} from "@/lib/flyer-print/render";
import { cropBorder, describeBorder } from "@/lib/flyer-print/borders";
import { renderPdfToTrim } from "@/lib/flyer-print/pdf";
import { EnhanceCompare } from "./enhance-compare";
import { useFlyerSide, type FlyerSide } from "./use-flyer-side";

const fieldClass =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
const labelClass = "flex flex-col gap-1 text-sm font-medium";
const hintClass = "text-xs font-normal text-zinc-500 dark:text-zinc-400";
const downloadClass =
  "inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90";

type SideName = "front" | "back";

type SideResult = {
  side: SideName;
  pngUrl: string;
  pngBytes: number;
  previewUrl: string;
  /** The preview as it would look printed in CMYK. */
  proofUrl?: string;
};

type Result = {
  key: string;
  baseName: string;
  /** One page, or two (front then back) when a back was chosen. */
  pdfUrl: string;
  pdfBytes: number;
  cmykUrl?: string;
  cmykBytes?: number;
  sides: SideResult[];
};

const sideLabel = { front: "Front", back: "Back" } as const;

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const verdictClass = {
  great: "text-emerald-700 dark:text-emerald-400",
  good: "text-emerald-700 dark:text-emerald-400",
  soft: "text-amber-700 dark:text-amber-400",
  low: "text-red-600 dark:text-red-400",
} as const;

/** The print settings one side is made with. */
type Settings = {
  paper: PaperKey | "custom";
  customWidth: string;
  customHeight: string;
  orientationChoice: "auto" | Orientation;
  fit: FitMode;
  addBleed: boolean;
  bleedInput: string;
  bleedMode: BleedMode;
  bleedColorInput: string;
  marks: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  paper: "A4",
  customWidth: "200",
  customHeight: "300",
  orientationChoice: "auto",
  fit: "fill",
  addBleed: true,
  bleedInput: String(DEFAULT_BLEED_MM),
  bleedMode: "mirror",
  bleedColorInput: "#ffffff",
  marks: true,
};

/** Turns one side's settings (and its picture, for automatic orientation)
 *  into the page plan, plus anything that stops the files being made. */
function derive(settings: Settings, picture: ImageBitmap | null | undefined) {
  const { paper, customWidth, customHeight, orientationChoice, addBleed, bleedInput, bleedMode, bleedColorInput, marks } =
    settings;
  const orientationFromChoice: Orientation =
    orientationChoice === "auto"
      ? picture
        ? autoOrientation(picture.width, picture.height)
        : "portrait"
      : orientationChoice;
  const bleedMm = addBleed ? Math.min(MAX_BLEED_MM, Math.max(0, Number.parseFloat(bleedInput) || 0)) : 0;
  // A custom size is the finished width and height as typed, so it also sets
  // the orientation. Until the boxes hold usable numbers the page is planned
  // as A4 and creating is switched off.
  const custom = paper === "custom" ? checkCustomPaper(customWidth, customHeight) : null;
  const customPaper = custom?.paper ?? null;
  const orientation: Orientation = customPaper
    ? customPaper.widthMm > customPaper.heightMm
      ? "landscape"
      : "portrait"
    : orientationFromChoice;
  const plan = planPrint({ paper: paper === "custom" ? (customPaper ?? "A4") : paper, orientation, bleedMm, marks });
  // A solid-colour bleed needs a valid HEX code before anything is created.
  const bleedColor = normalizeHexColor(bleedColorInput);
  const colorProblem =
    bleedMm > 0 && bleedMode === "color" && !bleedColor ? "Enter the bleed colour as a HEX code, e.g. #1A9FB0." : null;
  const sizeProblem =
    custom?.problem ??
    (plan.pageW * plan.pageH > MAX_PAGE_PIXELS
      ? "That page is too large for the browser to build (about A2 with bleed is the limit). Try a smaller size or less bleed."
      : null);
  const paperLabel = paper === "custom" ? "Custom" : PAPER_SIZES[paper].label;
  const paperFileLabel = paper === "custom" ? `custom-${plan.trimWmm}x${plan.trimHmm}mm` : paper;
  return { ...settings, plan, orientation, bleedMm, bleedColor, colorProblem, sizeProblem, paperLabel, paperFileLabel };
}

type Derived = ReturnType<typeof derive>;

export function FlyerPrintTool() {
  // Print settings: the front's, and the back's when it has its own.
  const [frontSettings, setFrontSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [backSettings, setBackSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [sameSettings, setSameSettings] = useState(true);
  // One CMYK choice for both: the CMYK PDF holds both pages.
  const [cmyk, setCmyk] = useState(true);
  const [showProof, setShowProof] = useState(false);
  // Preview "as cut" (the finished piece) by default: the full page also shows
  // the bleed and the white crop-mark border, which looks like a fault at the
  // edges even though the printer cuts it all away.
  const [showFullPage, setShowFullPage] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [gpu, setGpu] = useState<boolean | null>(null);
  // Which side step 1 is showing, and which side the preview shows.
  const [tab, setTab] = useState<SideName>("front");
  const [previewSide, setPreviewSide] = useState<SideName>("front");

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

  // The front, and an optional back printed as page 2 of the same PDF.
  const front = useFlyerSide({ setError, setWorking, track });
  const back = useFlyerSide({ setError, setWorking, track });
  const side = tab === "back" ? back : front;
  const source = front.source;
  const loadedSides = ([["front", front], ["back", back]] as const).filter(([, s]) => s.source);

  useEffect(() => {
    let alive = true;
    void webGpuAvailable().then((available) => {
      if (alive) setGpu(available);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Step 2 edits the back's own settings only while the Back tab is open and
  // "same settings" is off; otherwise it edits the front's (used by both).
  const separate = !sameSettings && !!back.source;
  const editingBack = separate && tab === "back";
  const settingsFor = (name: SideName): Derived =>
    name === "back" && separate
      ? derive(backSettings, back.source?.bitmap)
      : // With shared settings the back follows the front's orientation too,
        // so both pages come out the same way round.
        derive(frontSettings, front.source?.bitmap);
  const editing = settingsFor(editingBack ? "back" : "front");
  const update = (patch: Partial<Settings>) =>
    (editingBack ? setBackSettings : setFrontSettings)((s) => ({ ...s, ...patch }));
  const { paper, customWidth, customHeight, orientationChoice, fit, addBleed, bleedInput, bleedMode, bleedColorInput, marks } =
    editing;
  const { bleedColor, colorProblem, sizeProblem } = editing;
  const setPaper = (v: PaperKey | "custom") => update({ paper: v });
  const setCustomWidth = (v: string) => update({ customWidth: v });
  const setCustomHeight = (v: string) => update({ customHeight: v });
  const setOrientationChoice = (v: "auto" | Orientation) => update({ orientationChoice: v });
  const setFit = (v: FitMode) => update({ fit: v });
  const setAddBleed = (v: boolean) => update({ addBleed: v });
  const setBleedInput = (v: string) => update({ bleedInput: v });
  const setBleedMode = (v: BleedMode) => update({ bleedMode: v });
  const setBleedColorInput = (v: string) => update({ bleedColorInput: v });
  const setMarks = (v: boolean) => update({ marks: v });
  const frontPlan = settingsFor("front");
  const backPlan = settingsFor("back");
  const blocking = loadedSides.some(([name]) => {
    const d = settingsFor(name);
    return d.sizeProblem !== null || d.colorProblem !== null;
  });
  const sizesDiffer =
    separate && (frontPlan.plan.trimWmm !== backPlan.plan.trimWmm || frontPlan.plan.trimHmm !== backPlan.plan.trimHmm);

  // Resolution and cropping notes for one side.
  const sideNotes = (s: FlyerSide, d: Derived) => {
    const { plan, fit } = d;
    const dpi = s.source && !s.source.pdf ? effectiveDpi(s.srcW, s.srcH, plan, fit) : null;
    return {
      dpi,
      verdict: dpi === null ? null : judgeDpi(dpi),
      cropped:
        s.source && fit === "fill"
          ? croppedShare(s.srcW || s.source.bitmap.width, s.srcH || s.source.bitmap.height, plan)
          : 0,
    };
  };
  const reference = side.enhanced?.reference ?? side.source?.bitmap ?? null;
  const tabPlan = settingsFor(tab);
  const printScale = reference ? placement(reference.width, reference.height, tabPlan.plan, tabPlan.fit).scale : 1;

  // The downloads belong to the settings they were made with.
  const sideKey = (s: FlyerSide) => [
    s.source?.name,
    s.source?.bitmap.width,
    s.source?.bitmap.height,
    s.source?.pdf?.pageNumber,
    s.enhancedInUse ? s.enhanced?.id : 0,
    s.trimBorder,
  ];
  const settingsKey = JSON.stringify([
    sideKey(front),
    sideKey(back),
    ...(["front", "back"] as const).map((name) => {
      const d = settingsFor(name);
      return [d.paper, d.plan.trimWmm, d.plan.trimHmm, d.orientation, d.fit, d.bleedMm, d.bleedMode, d.bleedMode === "color" ? d.bleedColor : "", d.marks];
    }),
    cmyk,
  ]);
  const current = result && result.key === settingsKey ? result : null;
  // The side shown in the preview (the front when there's no back).
  const shown = current ? (current.sides.find((r) => r.side === previewSide) ?? current.sides[0]) : null;
  const sp = shown ? settingsFor(shown.side).plan : null;

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void side.loadFile(file);
  }

  /** The print files for one side, made with the shared settings. */
  async function makeSide(s: FlyerSide, name: SideName, title: string, both: boolean) {
    const src = s.source;
    const active = s.activeSource;
    if (!src || !active) throw new Error("Choose the flyer first.");
    const d = settingsFor(name);
    const stage = (message: string | null) =>
      setWorking(message && both ? `${sideLabel[name]}: ${message}` : message);
    // A PDF page is drawn straight onto the print-sized canvas, so vector
    // artwork and text stay sharp; only an AI-enhanced copy goes the
    // picture route.
    let trim: HTMLCanvasElement | undefined;
    if (src.pdf && !s.enhancedInUse) {
      stage("Drawing the PDF page…");
      trim = await renderPdfToTrim(src.pdf.page, d.plan, d.fit);
    }
    // Cut off a white margin first, so the artwork (not the margin) reaches
    // the trim line and the bleed. The enhanced copy is 4x the original.
    let printSource: PrintSource = active;
    let croppedCopy: HTMLCanvasElement | null = null;
    if (!trim && s.trimBorder && s.foundBorder) {
      stage("Removing the white border…");
      croppedCopy = cropBorder(active, s.foundBorder, active.width / src.bitmap.width);
      printSource = croppedCopy;
    }
    try {
      return await renderPrintFiles(
        printSource,
        { plan: d.plan, fit: d.fit, bleedMode: d.bleedMode, bleedColor: d.bleedColor ?? undefined, title, trim, cmyk },
        stage,
      );
    } finally {
      if (croppedCopy) {
        croppedCopy.width = 0;
        croppedCopy.height = 0;
      }
    }
  }

  async function create() {
    if (!source) return;
    setError(null);
    setWorking("Starting…");
    const both = !!back.source;
    const baseName =
      (source.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-") || "flyer") +
      (both ? "-front-back" : source.pdf && source.pdf.pageCount > 1 ? `-page${source.pdf.pageNumber}` : "");
    const fp = frontPlan;
    const title = `${baseName} — ${fp.paper === "custom" ? `${fp.plan.trimWmm} × ${fp.plan.trimHmm} mm` : fp.paper} print file`;
    try {
      const made = [];
      for (const [name, s] of loadedSides) {
        made.push({ name, files: await makeSide(s, name, title, both) });
      }
      let pdf = made[0].files.pdf;
      let cmykPdf = made[0].files.cmykPdf;
      if (made.length > 1) {
        setWorking("Putting the front and back into one PDF…");
        pdf = await combinePdfs(made.map((m) => m.files.pdf), title);
        if (cmykPdf) {
          cmykPdf = await combinePdfs(
            made.map((m) => m.files.cmykPdf).filter((b): b is Blob => !!b),
            title,
          );
        }
      }
      setResult({
        key: settingsKey,
        baseName,
        pdfUrl: track(URL.createObjectURL(pdf)),
        pdfBytes: pdf.size,
        cmykUrl: cmykPdf ? track(URL.createObjectURL(cmykPdf)) : undefined,
        cmykBytes: cmykPdf?.size,
        sides: made.map(({ name, files }) => ({
          side: name,
          pngUrl: track(URL.createObjectURL(files.png)),
          pngBytes: files.png.size,
          previewUrl: track(files.previewUrl),
          proofUrl: files.proofUrl ? track(files.proofUrl) : undefined,
        })),
      });
      setPreviewSide("front");
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

  const anyEnhanced = front.enhancedInUse || back.enhancedInUse;
  const fpp = frontPlan.plan;
  const suffix = `${frontPlan.paperFileLabel}${sizesDiffer ? `-back-${backPlan.paperFileLabel}` : ""}-300dpi${anyEnhanced ? "-ai" : ""}${fpp.bleedMm > 0 ? `-bleed${fpp.bleedMm}mm` : ""}${fpp.marks ? "-marks" : ""}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">1. Choose the flyer</h2>

          <div role="tablist" aria-label="Flyer side" className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 text-sm dark:bg-zinc-900">
            {(["front", "back"] as const).map((name) => {
              const loaded = !!(name === "front" ? front : back).source;
              const selected = tab === name;
              return (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(name)}
                  className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                    selected ? "bg-white shadow-sm dark:bg-zinc-800" : "text-zinc-600 hover:text-foreground dark:text-zinc-400"
                  }`}
                >
                  {name === "front" ? "Front" : "Back (optional)"}
                  {loaded && <span className="ml-1 text-emerald-600 dark:text-emerald-400">✓</span>}
                </button>
              );
            })}
          </div>
          <p className={hintClass}>
            {tab === "front"
              ? "Add a back as well to get one PDF with the front on page 1 and the back on page 2."
              : "The back is printed with the same paper size and settings as the front, as page 2 of the same PDF."}
          </p>

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
            <span className="font-medium">
              Click to choose the {tab === "front" ? "front" : "back"}, or drop an image or PDF here
            </span>
            <span className={hintClass}>PNG, JPEG, WebP or PDF. It stays on this computer — nothing is uploaded.</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void side.loadFile(file);
                e.target.value = "";
              }}
            />
          </label>

          {side.source && (
            <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, not a site image */}
              <img src={side.source.previewUrl} alt="" className="h-16 w-16 rounded object-cover" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">{side.source.name}</p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  {side.source.pdf
                    ? `PDF · ${Math.round(side.source.pdf.widthMm)} × ${Math.round(side.source.pdf.heightMm)} mm`
                    : `${side.source.bitmap.width} × ${side.source.bitmap.height} px`}
                </p>
              </div>
              {tab === "back" && (
                <button
                  type="button"
                  onClick={() => back.clear()}
                  disabled={working !== null}
                  className="shrink-0 text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                >
                  Remove
                </button>
              )}
            </div>
          )}

          {side.source?.pdf && side.source.pdf.pageCount > 1 && (
            <label className={labelClass}>
              Page
              <select
                value={side.source.pdf.pageNumber}
                onChange={(e) => void side.changePdfPage(Number(e.target.value))}
                disabled={working !== null}
                className={fieldClass}
              >
                {Array.from({ length: side.source.pdf.pageCount }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Page {i + 1} of {side.source?.pdf?.pageCount}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* A two-page PDF often already holds the back on page 2. */}
          {front.source?.pdf && front.source.pdf.pageCount > 1 && !back.source && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <span>This PDF has {front.source.pdf.pageCount} pages.</span>
              <button
                type="button"
                disabled={working !== null}
                onClick={() => {
                  const pdf = front.source?.pdf;
                  const file = front.source?.file;
                  if (!pdf || !file) return;
                  void back.loadFile(file, pdf.pageNumber === 1 ? 2 : 1).then(() => setTab("back"));
                }}
                className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Use page {front.source.pdf.pageNumber === 1 ? 2 : 1} as the back
              </button>
            </div>
          )}

          {side.source?.pdf && (
            <p className={`${hintClass} rounded-lg border border-zinc-200 p-3 dark:border-zinc-800`}>
              PDFs are drawn directly at the print size, so text and shapes stay sharp on any paper.
              Photos inside a PDF are only as sharp as they were when it was saved.
            </p>
          )}

          {side.source && (
            <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-semibold">Low resolution? Enhance with AI</h3>
                <p className={hintClass}>
                  Rebuilds sharper edges and text, with about {ENHANCE_SCALE}× more pixels. It runs on
                  this computer, so the flyer is never uploaded.
                </p>
                {side.source.pdf && (
                  <p className={hintClass}>
                    For a PDF, use this when it holds a low-resolution picture. Skip it for PDFs made
                    from text and shapes, which are already sharp.
                  </p>
                )}
              </div>

              {!canEnhance(side.source.bitmap.width, side.source.bitmap.height) ? (
                <p className={hintClass}>
                  This image already has plenty of pixels, so there is nothing to gain here.
                </p>
              ) : side.enhancing ? (
                <div className="flex flex-col gap-2">
                  <div
                    role="progressbar"
                    aria-label="AI enhancement progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={side.enhancing.total ? Math.round((side.enhancing.done / side.enhancing.total) * 100) : 0}
                    className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                  >
                    <div
                      className="h-full bg-brand-teal transition-[width]"
                      style={{
                        width: side.enhancing.total ? `${(side.enhancing.done / side.enhancing.total) * 100}%` : "8%",
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span aria-live="polite">
                      {side.enhancing.phase === "loading"
                        ? "Loading the AI model…"
                        : `Enhancing… ${side.enhancing.done} of ${side.enhancing.total}`}
                    </span>
                    <button
                      type="button"
                      onClick={side.cancelEnhance}
                      className="text-sm text-zinc-600 underline underline-offset-4 hover:text-foreground dark:text-zinc-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={side.enhance}
                      disabled={working !== null}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      {side.enhanced ? "Enhance again" : "Enhance with AI"}
                    </button>
                    {gpu !== null && !side.enhanced && (
                      <span className={hintClass}>
                        {gpu
                          ? "Uses your graphics card — usually a few seconds."
                          : "No graphics card access here, so it runs on the processor — it can take a minute or two."}
                      </span>
                    )}
                  </div>
                  {!side.enhanced && (
                    <p className={hintClass}>
                      The first time, it downloads about 30 MB, which your browser then keeps.
                    </p>
                  )}
                </div>
              )}

              {side.enhanced && !side.enhancing && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    Enhanced in {(side.enhanced.ms / 1000).toFixed(1)} s on the{" "}
                    {side.enhanced.backend === "webgpu" ? "graphics card" : "processor"}.
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={side.useEnhanced}
                      onChange={(e) => side.setUseEnhanced(e.target.checked)}
                    />
                    <span className="font-medium">Use the enhanced version</span>
                  </label>
                  <EnhanceCompare
                    original={side.enhanced.reference ?? side.source.bitmap}
                    enhanced={side.enhanced.canvas}
                    printScale={printScale}
                  />
                  <p className={hintClass}>
                    AI can smooth very fine detail and add a faint glow around dark text. Check small
                    print in the comparison before using it.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">2. Print settings</h2>

          {back.source && (
            <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sameSettings}
                  onChange={(e) => {
                    // The back starts from the front's settings when split.
                    if (!e.target.checked) setBackSettings(frontSettings);
                    setSameSettings(e.target.checked);
                  }}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Same settings for the back</span>
                  <span className={`${hintClass} block`}>
                    Untick to give the back its own paper size, orientation, fit, bleed and crop marks.
                  </span>
                </span>
              </label>
              {separate && (
                <div role="tablist" aria-label="Settings for" className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 text-sm dark:bg-zinc-900">
                  {(["front", "back"] as const).map((name) => (
                    <button
                      key={name}
                      type="button"
                      role="tab"
                      aria-selected={tab === name}
                      onClick={() => setTab(name)}
                      className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                        tab === name ? "bg-white shadow-sm dark:bg-zinc-800" : "text-zinc-600 hover:text-foreground dark:text-zinc-400"
                      }`}
                    >
                      {sideLabel[name]} settings
                    </button>
                  ))}
                </div>
              )}
              {sizesDiffer && (
                <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
                  The front ({frontPlan.plan.trimWmm} × {frontPlan.plan.trimHmm} mm) and back ({backPlan.plan.trimWmm} ×{" "}
                  {backPlan.plan.trimHmm} mm) are different sizes. That&apos;s fine for separate pieces, but double-sided
                  printing needs both sides the same size.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Paper size
              <select
                value={paper}
                onChange={(e) => setPaper(e.target.value as PaperKey | "custom")}
                className={fieldClass}
              >
                {Object.entries(PAPER_SIZES).map(([key, size]) => (
                  <option key={key} value={key}>
                    {size.label} · {size.w} × {size.h} mm
                  </option>
                ))}
                <option value="custom">Custom size…</option>
              </select>
            </label>
            <label className={labelClass}>
              Orientation
              <select
                disabled={paper === "custom"}
                value={paper === "custom" ? "auto" : orientationChoice}
                onChange={(e) => setOrientationChoice(e.target.value as "auto" | Orientation)}
                className={fieldClass}
              >
                <option value="auto">{paper === "custom" ? "From the size" : "Automatic"}</option>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
          </div>

          {paper === "custom" && (
            <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  Width (mm)
                  <input
                    type="number"
                    min={MIN_CUSTOM_MM}
                    max={MAX_CUSTOM_MM}
                    step={0.5}
                    inputMode="decimal"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  Height (mm)
                  <input
                    type="number"
                    min={MIN_CUSTOM_MM}
                    max={MAX_CUSTOM_MM}
                    step={0.5}
                    inputMode="decimal"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(e.target.value)}
                    className={fieldClass}
                  />
                </label>
              </div>
              <p className={hintClass}>
                The finished size after cutting, before bleed. A size that is wider than it is tall
                prints landscape.
              </p>
            </div>
          )}
          {sizeProblem && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {sizeProblem}
            </p>
          )}

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

          {loadedSides.map(([name, s]) =>
            s.foundBorder ? (
              <label
                key={name}
                className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40"
              >
                <input
                  type="checkbox"
                  checked={s.removeBorder}
                  onChange={(e) => s.setRemoveBorder(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">
                    Remove the white border around the {back.source ? `${name} of the ` : ""}flyer
                  </span>
                  <span className={`${hintClass} block`}>
                    This {back.source ? name : "flyer"} has a plain white margin ({describeBorder(s.foundBorder)}). Left
                    in, it prints as a white band where the artwork should reach the edge — and mirrored bleed copies it
                    too. Untick only if the white is part of the design.
                  </span>
                </span>
              </label>
            ) : null,
          )}

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
                    <option value="color">Solid colour</option>
                  </select>
                </label>
              </div>
            )}

            {addBleed && bleedMode === "color" && (
              <div className={labelClass}>
                <label htmlFor="bleed-color">Bleed colour</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Pick the bleed colour"
                    value={bleedColor ?? "#ffffff"}
                    onChange={(e) => setBleedColorInput(e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-md border border-zinc-300 bg-transparent p-1 dark:border-zinc-700"
                  />
                  <input
                    id="bleed-color"
                    type="text"
                    value={bleedColorInput}
                    onChange={(e) => setBleedColorInput(e.target.value)}
                    placeholder="#1A9FB0"
                    maxLength={7}
                    spellCheck={false}
                    className={`${fieldClass} mt-0 w-32 font-mono uppercase`}
                  />
                </div>
                <p className={hintClass}>
                  Fills the bleed with one solid colour — use the colour along the flyer&apos;s edge (from the
                  designer, or a colour picker). Type a HEX code or pick it.
                </p>
                {colorProblem && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {colorProblem}
                  </p>
                )}
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

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={cmyk}
                onChange={(e) => setCmyk(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Also make a CMYK PDF</span>
                <span className={`${hintClass} block`}>
                  Colours converted to CMYK with the FOGRA39 profile (coated paper, offset). Slower,
                  and the file is bigger.
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
            {(separate ? (["front", "back"] as const) : (["front"] as const)).map((name) => {
              const d = settingsFor(name);
              const label = separate ? `${sideLabel[name]} size` : "Finished size";
              return (
                <div key={name} className="contents">
                  <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
                  <dd>
                    {d.paperLabel} {d.orientation} — {d.plan.trimWmm} × {d.plan.trimHmm} mm
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {" "}
                      ({d.plan.trimW} × {d.plan.trimH} px at {DPI} dpi)
                    </span>
                  </dd>
                  {(d.plan.bleedMm > 0 || d.plan.marks) && (
                    <>
                      <dt className="text-zinc-500 dark:text-zinc-400">
                        {separate ? `${sideLabel[name]} page` : `Page with bleed${d.plan.marks ? " and marks" : ""}`}
                      </dt>
                      <dd>
                        {Number(d.plan.pageWmm.toFixed(1))} × {Number(d.plan.pageHmm.toFixed(1))} mm
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {" "}
                          ({d.plan.pageW} × {d.plan.pageH} px)
                        </span>
                        {separate && (
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {" "}
                            · {d.plan.bleedMm > 0 ? `${d.plan.bleedMm} mm bleed` : "no bleed"}
                            {d.plan.marks ? ", crop marks" : ""}
                          </span>
                        )}
                      </dd>
                    </>
                  )}
                </div>
              );
            })}

            {loadedSides.map(([name, s]) => {
              const notes = sideNotes(s, settingsFor(name));
              const label = back.source ? sideLabel[name] : "Your flyer is";
              return (
                <div key={name} className="contents">
                  {s.source?.pdf && (
                    <>
                      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
                      <dd>
                        A PDF page, {Math.round(s.source.pdf.widthMm)} × {Math.round(s.source.pdf.heightMm)} mm.{" "}
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {s.enhancedInUse
                            ? "The AI-enhanced version is in use."
                            : "It is drawn at the print size, so text and shapes will be sharp."}
                        </span>
                      </dd>
                    </>
                  )}
                  {notes.dpi !== null && notes.verdict && (
                    <>
                      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
                      <dd>
                        <span className="font-medium">about {Math.round(notes.dpi)} dpi</span> at this size.{" "}
                        {s.enhancedInUse ? (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            The AI-enhanced version is in use.
                          </span>
                        ) : (
                          <span className={verdictClass[notes.verdict.level]}>{notes.verdict.text}</span>
                        )}
                      </dd>
                    </>
                  )}
                  {notes.cropped > 0.02 && (
                    <>
                      <dt className="text-zinc-500 dark:text-zinc-400">{back.source ? `${sideLabel[name]} shape` : "Shape"}</dt>
                      <dd className="text-amber-700 dark:text-amber-400">
                        About {Math.round(notes.cropped * 100)}% of the picture will be trimmed off the edges to
                        fill the page. Choose &quot;Fit inside&quot; to keep all of it.
                      </dd>
                    </>
                  )}
                </div>
              );
            })}
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={create}
              disabled={!source || working !== null || blocking}
              className={`${downloadClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {working
                ? working
                : current
                  ? "Create again"
                  : back.source
                    ? "Create print files (front & back)"
                    : "Create print files"}
            </button>
            {!source && (
              <span className={hintClass}>{back.source ? "Choose the front as well." : "Choose a flyer first."}</span>
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

        {current && shown && sp && (
          <section className="flex flex-col gap-4">
            {/* Bleed, marks and page size of the side being previewed. */}
            <h2 className="text-lg font-semibold">Your print files</h2>
            <div className="flex flex-wrap gap-3">
              <a href={current.pdfUrl} download={`${current.baseName}-${suffix}.pdf`} className={downloadClass}>
                Download PDF{current.sides.length > 1 ? " — front & back, 2 pages" : ""} ({megabytes(current.pdfBytes)})
              </a>
              {current.cmykUrl && current.cmykBytes !== undefined && (
                <a href={current.cmykUrl} download={`${current.baseName}-${suffix}-CMYK.pdf`} className={downloadClass}>
                  Download CMYK PDF{current.sides.length > 1 ? " — 2 pages" : ""} ({megabytes(current.cmykBytes)})
                </a>
              )}
              {current.sides.map((r) => (
                <a
                  key={r.side}
                  href={r.pngUrl}
                  download={`${current.baseName}${current.sides.length > 1 ? `-${r.side}` : ""}-${suffix}.png`}
                  className={`${downloadClass} !bg-transparent !text-foreground border border-zinc-300 dark:border-zinc-700`}
                >
                  Download {current.sides.length > 1 ? `${r.side} ` : ""}PNG ({megabytes(r.pngBytes)})
                </a>
              ))}
            </div>

            {current.sides.length > 1 && (
              <div role="group" aria-label="Preview side" className="flex flex-wrap items-center gap-2 text-sm">
                {current.sides.map((r) => (
                  <button
                    key={r.side}
                    type="button"
                    onClick={() => setPreviewSide(r.side)}
                    aria-pressed={shown.side === r.side}
                    className={`rounded-full border px-3 py-1 ${shown.side === r.side ? "border-foreground bg-foreground text-background" : "border-zinc-300 dark:border-zinc-700"}`}
                  >
                    {sideLabel[r.side]} (page {r.side === "front" ? 1 : 2})
                  </button>
                ))}
              </div>
            )}

            {shown.proofUrl && (
              <div role="group" aria-label="Preview colours" className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setShowProof(false)}
                  aria-pressed={!showProof}
                  className={`rounded-full border px-3 py-1 ${!showProof ? "border-foreground bg-foreground text-background" : "border-zinc-300 dark:border-zinc-700"}`}
                >
                  Screen colours
                </button>
                <button
                  type="button"
                  onClick={() => setShowProof(true)}
                  aria-pressed={showProof}
                  className={`rounded-full border px-3 py-1 ${showProof ? "border-foreground bg-foreground text-background" : "border-zinc-300 dark:border-zinc-700"}`}
                >
                  Printed in CMYK
                </button>
                <span className={hintClass}>
                  {showProof
                    ? "A simulation of the CMYK PDF on coated paper. Your screen is only a close guide."
                    : "The original RGB colours, as on your screen."}
                </span>
              </div>
            )}

            {(sp.bleed > 0 || sp.marks) && (
              <div role="group" aria-label="Preview area" className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => setShowFullPage(false)}
                  aria-pressed={!showFullPage}
                  className={`rounded-full border px-3 py-1 ${!showFullPage ? "border-foreground bg-foreground text-background" : "border-zinc-300 dark:border-zinc-700"}`}
                >
                  After cutting
                </button>
                <button
                  type="button"
                  onClick={() => setShowFullPage(true)}
                  aria-pressed={showFullPage}
                  className={`rounded-full border px-3 py-1 ${showFullPage ? "border-foreground bg-foreground text-background" : "border-zinc-300 dark:border-zinc-700"}`}
                >
                  Whole page (bleed &amp; marks)
                </button>
                <span className={hintClass}>
                  {showFullPage
                    ? "Everything outside the dashed line is cut off by the printer."
                    : "The finished flyer at its trimmed size."}
                </span>
              </div>
            )}

            <div className="rounded-lg border border-zinc-200 bg-zinc-100 p-3 dark:border-zinc-800 dark:bg-zinc-900">
              {(() => {
                const src = showProof && shown.proofUrl ? shown.proofUrl : shown.previewUrl;
                const alt =
                  showProof && shown.proofUrl
                    ? "Preview of the finished print page as it would look printed in CMYK"
                    : "Preview of the finished print page, with crop marks if selected";
                const offX = (sp.pageW - sp.trimW) / 2;
                const offY = (sp.pageH - sp.trimH) / 2;
                if (!showFullPage && (offX > 0 || offY > 0)) {
                  // The trim area only: the page image, enlarged and shifted
                  // so the cut lines meet the frame's edges.
                  return (
                    <div
                      className="relative mx-auto max-w-full overflow-hidden shadow-md"
                      // Width-led so the frame keeps the trim's shape at any screen
                      // width, never taller than 36rem.
                      style={{
                        aspectRatio: `${sp.trimW} / ${sp.trimH}`,
                        width: `min(100%, ${(36 * sp.trimW) / sp.trimH}rem)`,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview */}
                      <img
                        src={src}
                        alt={alt}
                        className="absolute max-w-none"
                        style={{
                          width: `${(sp.pageW / sp.trimW) * 100}%`,
                          height: `${(sp.pageH / sp.trimH) * 100}%`,
                          left: `${(-offX / sp.trimW) * 100}%`,
                          top: `${(-offY / sp.trimH) * 100}%`,
                        }}
                      />
                    </div>
                  );
                }
                return (
                  <div className="relative mx-auto w-fit max-w-full shadow-md">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview */}
                    <img src={src} alt={alt} className="block max-h-[36rem] w-auto max-w-full" />
                    {(offX > 0 || offY > 0) && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute border border-dashed border-red-500"
                        style={{
                          left: `${(offX / sp.pageW) * 100}%`,
                          right: `${(offX / sp.pageW) * 100}%`,
                          top: `${(offY / sp.pageH) * 100}%`,
                          bottom: `${(offY / sp.pageH) * 100}%`,
                        }}
                      />
                    )}
                  </div>
                );
              })()}
            </div>

            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                The PDF has the finished size{sp.bleedMm > 0 ? " and the bleed" : ""} built in
                {sp.marks ? ", with sharp vector crop marks" : ""}. The PNG is the same page as
                one picture, tagged {DPI} dpi.
              </li>
              {sp.bleedMm > 0 && (
                <li>
                  Bleed is made from the picture itself, so keep text and logos about 5 mm inside
                  the edge.
                </li>
              )}
              {current.cmykUrl ? (
                <li>
                  The CMYK PDF is converted with the FOGRA39 profile (ISO Coated v2), which is
                  embedded in the file, and its crop marks use black ink only. Bright screen colours
                  such as vivid orange or teal print duller in CMYK — switch the preview above to “Printed
                  in CMYK” to see by how much. The PDF and PNG stay RGB.
                </li>
              ) : (
                <li>Colours stay as RGB. Tick “Also make a CMYK PDF” for a print-shop-ready CMYK file.</li>
              )}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
