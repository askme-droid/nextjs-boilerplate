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
import {
  ENHANCE_SCALE,
  canEnhance,
  enhanceBitmap,
  webGpuAvailable,
  type EnhanceProgress,
  type EnhanceResult,
} from "@/lib/flyer-print/enhance";
import { renderPrintFiles, type BleedMode, type PrintSource } from "@/lib/flyer-print/render";
import { cropBorder, describeBorder, detectWhiteBorder, hasBorder, type Border } from "@/lib/flyer-print/borders";
import {
  PdfProblem,
  type OpenedPdf,
  isPdfFile,
  openPdf,
  pageSize,
  renderPdfForEnhance,
  renderPdfPreview,
  renderPdfToTrim,
} from "@/lib/flyer-print/pdf";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { EnhanceCompare } from "./enhance-compare";

const fieldClass =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
const labelClass = "flex flex-col gap-1 text-sm font-medium";
const hintClass = "text-xs font-normal text-zinc-500 dark:text-zinc-400";
const downloadClass =
  "inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90";

// Decoding and resizing hold several full-size copies in memory at once.
const MAX_SOURCE_PIXELS = 120_000_000;

type PdfInfo = {
  doc: PDFDocumentProxy;
  page: PDFPageProxy;
  pageNumber: number;
  pageCount: number;
  widthMm: number;
  heightMm: number;
};

// For a PDF, `bitmap` is only a small rendering (to show a thumbnail and read
// the page's shape); the print files are drawn from the PDF page itself.
type Source = { name: string; bitmap: ImageBitmap; previewUrl: string; pdf?: PdfInfo };

type Result = {
  key: string;
  baseName: string;
  pngUrl: string;
  pdfUrl: string;
  previewUrl: string;
  pngBytes: number;
  pdfBytes: number;
  cmykUrl?: string;
  cmykBytes?: number;
  /** The preview as it would look printed in CMYK. */
  proofUrl?: string;
};

// For a PDF, `reference` is the page drawing the AI started from (the
// "before" side of the comparison); for a picture it is the picture itself.
type Enhanced = EnhanceResult & { id: number; reference?: ImageBitmap };

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const verdictClass = {
  great: "text-emerald-700 dark:text-emerald-400",
  good: "text-emerald-700 dark:text-emerald-400",
  soft: "text-amber-700 dark:text-amber-400",
  low: "text-red-600 dark:text-red-400",
} as const;

export function FlyerPrintTool() {
  const [source, setSource] = useState<Source | null>(null);
  const [paper, setPaper] = useState<PaperKey | "custom">("A4");
  const [customWidth, setCustomWidth] = useState("200");
  const [customHeight, setCustomHeight] = useState("300");
  const [orientationChoice, setOrientationChoice] = useState<"auto" | Orientation>("auto");
  const [fit, setFit] = useState<FitMode>("fill");
  const [addBleed, setAddBleed] = useState(true);
  const [bleedInput, setBleedInput] = useState(String(DEFAULT_BLEED_MM));
  const [bleedMode, setBleedMode] = useState<BleedMode>("mirror");
  const [marks, setMarks] = useState(true);
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
  const [enhanced, setEnhanced] = useState<Enhanced | null>(null);
  const [useEnhanced, setUseEnhanced] = useState(true);
  const [enhancing, setEnhancing] = useState<EnhanceProgress | null>(null);
  const [gpu, setGpu] = useState<boolean | null>(null);
  // A plain white margin found around an image flyer, and whether to cut it
  // off before printing (lib/flyer-print/borders.ts).
  const [border, setBorder] = useState<{ bitmap: ImageBitmap; border: Border } | null>(null);
  const [removeBorder, setRemoveBorder] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const enhancedRef = useRef<Enhanced | null>(null);
  const enhanceCount = useRef(0);
  const pdfRef = useRef<OpenedPdf | null>(null);

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

  useEffect(() => {
    return () => {
      void pdfRef.current?.close();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void webGpuAvailable().then((available) => {
      if (alive) setGpu(available);
    });
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, []);

  // Look for a white margin whenever a new image flyer is chosen. (A PDF page
  // is drawn as vector artwork, so it's left as it is.)
  useEffect(() => {
    if (!source || source.pdf) return;
    const bitmap = source.bitmap;
    const id = requestAnimationFrame(() => {
      try {
        setBorder({ bitmap, border: detectWhiteBorder(bitmap) });
      } catch {
        setBorder(null);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [source]);
  const foundBorder = source && !source.pdf && border?.bitmap === source.bitmap && hasBorder(border.border) ? border.border : null;
  const trimBorder = !!foundBorder && removeBorder;
  // Size of the flyer once its margin is cut off, for the dpi and crop notes.
  const srcW = source ? source.bitmap.width - (trimBorder ? foundBorder.left + foundBorder.right : 0) : 0;
  const srcH = source ? source.bitmap.height - (trimBorder ? foundBorder.top + foundBorder.bottom : 0) : 0;

  const orientationFromChoice: Orientation =
    orientationChoice === "auto"
      ? source
        ? autoOrientation(source.bitmap.width, source.bitmap.height)
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
  const sizeProblem =
    custom?.problem ??
    (plan.pageW * plan.pageH > MAX_PAGE_PIXELS
      ? "That page is too large for the browser to build (about A2 with bleed is the limit). Try a smaller size or less bleed."
      : null);
  const paperLabel = paper === "custom" ? "Custom" : PAPER_SIZES[paper].label;
  const paperFileLabel = paper === "custom" ? `custom-${plan.trimWmm}x${plan.trimHmm}mm` : paper;

  // The AI-enhanced copy (4x the pixels) stands in for the original when chosen.
  const enhancedInUse = !!enhanced && useEnhanced;
  const activeSource: PrintSource | null = source ? (enhancedInUse ? enhanced.canvas : source.bitmap) : null;

  const dpi = source && !source.pdf ? effectiveDpi(srcW, srcH, plan, fit) : null;
  const verdict = dpi === null ? null : judgeDpi(dpi);
  const reference = enhanced?.reference ?? source?.bitmap ?? null;
  const printScale = reference ? placement(reference.width, reference.height, plan, fit).scale : 1;
  const cropped = source && fit === "fill" ? croppedShare(srcW || source.bitmap.width, srcH || source.bitmap.height, plan) : 0;

  // The downloads belong to the settings they were made with.
  const settingsKey = JSON.stringify([
    source?.name,
    source?.bitmap.width,
    source?.bitmap.height,
    source?.pdf?.pageNumber,
    paper,
    plan.trimWmm,
    plan.trimHmm,
    orientation,
    fit,
    bleedMm,
    bleedMode,
    marks,
    cmyk,
    enhancedInUse ? enhanced.id : 0,
    trimBorder,
  ]);
  const current = result && result.key === settingsKey ? result : null;

  function dropEnhanced() {
    const held = enhancedRef.current;
    if (held) {
      held.canvas.width = 0;
      held.canvas.height = 0;
      held.reference?.close();
    }
    enhancedRef.current = null;
    setEnhanced(null);
    setEnhancing(null);
  }

  async function enhance() {
    if (!source) return;
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setEnhancing({ phase: "loading", done: 0, total: 0 });
    let drawing: ImageBitmap | null = null;
    try {
      // A picture is enhanced as it is. A PDF page is first drawn at a
      // moderate size (so a picture inside it is not blown up before the AI
      // sees it), and that drawing is what the AI works from.
      if (source.pdf) drawing = await renderPdfForEnhance(source.pdf.page);
      const made = await enhanceBitmap(drawing ?? source.bitmap, {
        signal: controller.signal,
        onProgress: setEnhancing,
      });
      const previous = enhancedRef.current;
      if (previous) {
        previous.canvas.width = 0;
        previous.canvas.height = 0;
        previous.reference?.close();
      }
      enhanceCount.current += 1;
      const next: Enhanced = { ...made, id: enhanceCount.current, reference: drawing ?? undefined };
      drawing = null; // now owned by `next`
      enhancedRef.current = next;
      setEnhanced(next);
      setUseEnhanced(true);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(
          e instanceof Error
            ? e.message
            : "The AI enhancement could not run in this browser. You can still create the print files without it.",
        );
      }
    } finally {
      drawing?.close();
      setEnhancing(null);
      abortRef.current = null;
    }
  }

  /** Opens a page of a PDF: a small rendering for the thumbnail and shape. */
  async function preparePdfSource(doc: PDFDocumentProxy, pageNumber: number, name: string): Promise<Source> {
    const page = await doc.getPage(pageNumber);
    const size = pageSize(page);
    const bitmap = await renderPdfPreview(page);
    const thumb = document.createElement("canvas");
    thumb.width = bitmap.width;
    thumb.height = bitmap.height;
    thumb.getContext("2d")?.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => thumb.toBlob(resolve, "image/jpeg", 0.8));
    thumb.width = 0;
    return {
      name,
      bitmap,
      previewUrl: blob ? track(URL.createObjectURL(blob)) : "",
      pdf: {
        doc,
        page,
        pageNumber,
        pageCount: doc.numPages,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
      },
    };
  }

  async function loadPdf(file: File) {
    setWorking("Opening the PDF…");
    try {
      const opened = await openPdf(file);
      let next: Source;
      try {
        next = await preparePdfSource(opened.doc, 1, file.name);
      } catch (e) {
        void opened.close();
        throw e;
      }
      abortRef.current?.abort();
      dropEnhanced();
      source?.bitmap.close();
      void pdfRef.current?.close();
      pdfRef.current = opened;
      setSource(next);
    } catch (e) {
      setError(e instanceof PdfProblem ? e.message : "That PDF could not be opened.");
    } finally {
      setWorking(null);
    }
  }

  async function changePdfPage(pageNumber: number) {
    if (!source?.pdf) return;
    setError(null);
    setWorking("Loading the page…");
    try {
      const next = await preparePdfSource(source.pdf.doc, pageNumber, source.name);
      abortRef.current?.abort();
      dropEnhanced();
      source.bitmap.close();
      setSource(next);
    } catch {
      setError("That page could not be drawn.");
    } finally {
      setWorking(null);
    }
  }

  async function loadFile(file: File) {
    setError(null);
    if (isPdfFile(file)) {
      await loadPdf(file);
      return;
    }
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setError("Choose a PNG, JPEG, WebP or PDF file.");
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
    abortRef.current?.abort();
    dropEnhanced();
    source?.bitmap.close();
    void pdfRef.current?.close();
    pdfRef.current = null;
    setSource({ name: file.name, bitmap, previewUrl: track(URL.createObjectURL(file)) });
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  }

  async function create() {
    if (!source || !activeSource) return;
    setError(null);
    setWorking("Starting…");
    const baseName =
      (source.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-") || "flyer") +
      (source.pdf && source.pdf.pageCount > 1 ? `-page${source.pdf.pageNumber}` : "");
    const title = `${baseName} — ${paper === "custom" ? `${plan.trimWmm} × ${plan.trimHmm} mm` : paper} print file`;
    try {
      // A PDF page is drawn straight onto the print-sized canvas, so vector
      // artwork and text stay sharp; only an AI-enhanced copy goes the
      // picture route.
      let trim: HTMLCanvasElement | undefined;
      if (source.pdf && !enhancedInUse) {
        setWorking("Drawing the PDF page…");
        trim = await renderPdfToTrim(source.pdf.page, plan, fit);
      }
      // Cut off a white margin first, so the artwork (not the margin) reaches
      // the trim line and the bleed. The enhanced copy is 4x the original.
      let printSource: PrintSource = activeSource;
      let croppedCopy: HTMLCanvasElement | null = null;
      if (!trim && trimBorder && foundBorder) {
        setWorking("Removing the white border…");
        croppedCopy = cropBorder(activeSource, foundBorder, activeSource.width / source.bitmap.width);
        printSource = croppedCopy;
      }
      const made = await renderPrintFiles(printSource, { plan, fit, bleedMode, title, trim, cmyk }, setWorking);
      if (croppedCopy) {
        croppedCopy.width = 0;
        croppedCopy.height = 0;
      }
      setResult({
        key: settingsKey,
        baseName,
        pngUrl: track(URL.createObjectURL(made.png)),
        pdfUrl: track(URL.createObjectURL(made.pdf)),
        previewUrl: track(made.previewUrl),
        pngBytes: made.png.size,
        pdfBytes: made.pdf.size,
        cmykUrl: made.cmykPdf ? track(URL.createObjectURL(made.cmykPdf)) : undefined,
        cmykBytes: made.cmykPdf?.size,
        proofUrl: made.proofUrl ? track(made.proofUrl) : undefined,
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

  const suffix = `${paperFileLabel}-300dpi${enhancedInUse ? "-ai" : ""}${plan.bleedMm > 0 ? `-bleed${plan.bleedMm}mm` : ""}${plan.marks ? "-marks" : ""}`;

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
            <span className="font-medium">Click to choose, or drop an image or PDF here</span>
            <span className={hintClass}>PNG, JPEG, WebP or PDF. It stays on this computer — nothing is uploaded.</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
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
                  {source.pdf
                    ? `PDF · ${Math.round(source.pdf.widthMm)} × ${Math.round(source.pdf.heightMm)} mm`
                    : `${source.bitmap.width} × ${source.bitmap.height} px`}
                </p>
              </div>
            </div>
          )}

          {source?.pdf && source.pdf.pageCount > 1 && (
            <label className={labelClass}>
              Page
              <select
                value={source.pdf.pageNumber}
                onChange={(e) => void changePdfPage(Number(e.target.value))}
                disabled={working !== null}
                className={fieldClass}
              >
                {Array.from({ length: source.pdf.pageCount }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Page {i + 1} of {source.pdf?.pageCount}
                  </option>
                ))}
              </select>
              <span className={hintClass}>
                One page is printed at a time. Make a second set of files for the other side.
              </span>
            </label>
          )}

          {source?.pdf && (
            <p className={`${hintClass} rounded-lg border border-zinc-200 p-3 dark:border-zinc-800`}>
              PDFs are drawn directly at the print size, so text and shapes stay sharp on any paper.
              Photos inside a PDF are only as sharp as they were when it was saved.
            </p>
          )}

          {source && (
            <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-semibold">Low resolution? Enhance with AI</h3>
                <p className={hintClass}>
                  Rebuilds sharper edges and text, with about {ENHANCE_SCALE}× more pixels. It runs on
                  this computer, so the flyer is never uploaded.
                </p>
                {source.pdf && (
                  <p className={hintClass}>
                    For a PDF, use this when it holds a low-resolution picture. Skip it for PDFs made
                    from text and shapes, which are already sharp.
                  </p>
                )}
              </div>

              {!canEnhance(source.bitmap.width, source.bitmap.height) ? (
                <p className={hintClass}>
                  This image already has plenty of pixels, so there is nothing to gain here.
                </p>
              ) : enhancing ? (
                <div className="flex flex-col gap-2">
                  <div
                    role="progressbar"
                    aria-label="AI enhancement progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={enhancing.total ? Math.round((enhancing.done / enhancing.total) * 100) : 0}
                    className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                  >
                    <div
                      className="h-full bg-brand-teal transition-[width]"
                      style={{
                        width: enhancing.total ? `${(enhancing.done / enhancing.total) * 100}%` : "8%",
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span aria-live="polite">
                      {enhancing.phase === "loading"
                        ? "Loading the AI model…"
                        : `Enhancing… ${enhancing.done} of ${enhancing.total}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => abortRef.current?.abort()}
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
                      onClick={enhance}
                      disabled={working !== null}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      {enhanced ? "Enhance again" : "Enhance with AI"}
                    </button>
                    {gpu !== null && !enhanced && (
                      <span className={hintClass}>
                        {gpu
                          ? "Uses your graphics card — usually a few seconds."
                          : "No graphics card access here, so it runs on the processor — it can take a minute or two."}
                      </span>
                    )}
                  </div>
                  {!enhanced && (
                    <p className={hintClass}>
                      The first time, it downloads about 30 MB, which your browser then keeps.
                    </p>
                  )}
                </div>
              )}

              {enhanced && !enhancing && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    Enhanced in {(enhanced.ms / 1000).toFixed(1)} s on the{" "}
                    {enhanced.backend === "webgpu" ? "graphics card" : "processor"}.
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={useEnhanced}
                      onChange={(e) => setUseEnhanced(e.target.checked)}
                    />
                    <span className="font-medium">Use the enhanced version</span>
                  </label>
                  <EnhanceCompare
                    original={enhanced.reference ?? source.bitmap}
                    enhanced={enhanced.canvas}
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

          {foundBorder && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              <input
                type="checkbox"
                checked={removeBorder}
                onChange={(e) => setRemoveBorder(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Remove the white border around the flyer</span>
                <span className={`${hintClass} block`}>
                  This flyer has a plain white margin ({describeBorder(foundBorder)}). Left in, it prints as a
                  white band where the artwork should reach the edge — and mirrored bleed copies it too. Untick
                  only if the white is part of the design.
                </span>
              </span>
            </label>
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
            <dt className="text-zinc-500 dark:text-zinc-400">Finished size</dt>
            <dd>
              {paperLabel} {orientation} — {plan.trimWmm} × {plan.trimHmm} mm
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

            {source?.pdf && (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Your flyer is</dt>
                <dd>
                  A PDF page, {Math.round(source.pdf.widthMm)} × {Math.round(source.pdf.heightMm)} mm.{" "}
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {enhancedInUse
                      ? "The AI-enhanced version is in use."
                      : "It is drawn at the print size, so text and shapes will be sharp."}
                  </span>
                </dd>
              </>
            )}

            {source && dpi !== null && verdict && (
              <>
                <dt className="text-zinc-500 dark:text-zinc-400">Your flyer is</dt>
                <dd>
                  <span className="font-medium">about {Math.round(dpi)} dpi</span> at this size.{" "}
                  {enhancedInUse ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      The AI-enhanced version is in use.
                    </span>
                  ) : (
                    <span className={verdictClass[verdict.level]}>{verdict.text}</span>
                  )}
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
              disabled={!source || working !== null || sizeProblem !== null}
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
              {current.cmykUrl && current.cmykBytes !== undefined && (
                <a href={current.cmykUrl} download={`${current.baseName}-${suffix}-CMYK.pdf`} className={downloadClass}>
                  Download CMYK PDF ({megabytes(current.cmykBytes)})
                </a>
              )}
              <a
                href={current.pngUrl}
                download={`${current.baseName}-${suffix}.png`}
                className={`${downloadClass} !bg-transparent !text-foreground border border-zinc-300 dark:border-zinc-700`}
              >
                Download PNG ({megabytes(current.pngBytes)})
              </a>
            </div>

            {current.proofUrl && (
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

            {(plan.bleed > 0 || plan.marks) && (
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
                const src = showProof && current.proofUrl ? current.proofUrl : current.previewUrl;
                const alt =
                  showProof && current.proofUrl
                    ? "Preview of the finished print page as it would look printed in CMYK"
                    : "Preview of the finished print page, with crop marks if selected";
                const offX = (plan.pageW - plan.trimW) / 2;
                const offY = (plan.pageH - plan.trimH) / 2;
                if (!showFullPage && (offX > 0 || offY > 0)) {
                  // The trim area only: the page image, enlarged and shifted
                  // so the cut lines meet the frame's edges.
                  return (
                    <div
                      className="relative mx-auto max-w-full overflow-hidden shadow-md"
                      // Width-led so the frame keeps the trim's shape at any screen
                      // width, never taller than 36rem.
                      style={{
                        aspectRatio: `${plan.trimW} / ${plan.trimH}`,
                        width: `min(100%, ${(36 * plan.trimW) / plan.trimH}rem)`,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview */}
                      <img
                        src={src}
                        alt={alt}
                        className="absolute max-w-none"
                        style={{
                          width: `${(plan.pageW / plan.trimW) * 100}%`,
                          height: `${(plan.pageH / plan.trimH) * 100}%`,
                          left: `${(-offX / plan.trimW) * 100}%`,
                          top: `${(-offY / plan.trimH) * 100}%`,
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
                          left: `${(offX / plan.pageW) * 100}%`,
                          right: `${(offX / plan.pageW) * 100}%`,
                          top: `${(offY / plan.pageH) * 100}%`,
                          bottom: `${(offY / plan.pageH) * 100}%`,
                        }}
                      />
                    )}
                  </div>
                );
              })()}
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
