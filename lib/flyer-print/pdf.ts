// Browser-only: reading a flyer that arrives as a PDF.
//
// Uses Mozilla's pdf.js (Apache-2.0), loaded on demand from /pdfjs/ — the files
// are copied there from node_modules by scripts/copy-ort-runtime.mjs, so the
// site serves them itself.
//
// The important choice: a PDF page is never turned into a picture and then
// resized. It is drawn straight onto the print-sized canvas at exactly the
// final resolution, so vector artwork and live text stay perfectly sharp at
// any paper size. Photos inside the PDF are, of course, only as sharp as they
// were when the PDF was made.

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { ENHANCE_SCALE, MAX_ENHANCED_PIXELS } from "./enhance";
import { placement, type FitMode, type PrintPlan } from "./geometry";

type PdfJs = typeof import("pdfjs-dist");

const PDFJS_BASE = "/pdfjs/";

let library: Promise<PdfJs> | null = null;

// pdf.js (v5.4+) calls Map/WeakMap.getOrInsertComputed, a 2025 JavaScript
// addition that browsers a year or two old don't have — there it fails with
// "getOrInsertComputed is not a function" and the PDF won't open. Same for
// Math.sumPrecise (used for some fonts). Add them when missing, on this page
// and inside pdf.js's worker.
const MAP_POLYFILL = `for (const C of [Map, WeakMap]) {
  if (!C.prototype.getOrInsertComputed) C.prototype.getOrInsertComputed = function (k, f) { if (this.has(k)) return this.get(k); const v = f(k); this.set(k, v); return v; };
  if (!C.prototype.getOrInsert) C.prototype.getOrInsert = function (k, v) { if (this.has(k)) return this.get(k); this.set(k, v); return v; };
}
if (!Math.sumPrecise) Math.sumPrecise = function (values) { let s = 0; for (const v of values) s += v; return s; };`;

function needsMapPolyfill() {
  return (
    !("getOrInsertComputed" in Map.prototype) ||
    !("getOrInsertComputed" in WeakMap.prototype) ||
    !("sumPrecise" in Math)
  );
}

function loadPdfJs(): Promise<PdfJs> {
  library ??= (async () => {
    const polyfill = needsMapPolyfill();
    if (polyfill) new Function(MAP_POLYFILL)();
    // By URL at runtime (not bundled): it is large and only needed for PDFs.
    const lib = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ PDFJS_BASE + "pdf.min.mjs"
    )) as PdfJs;
    const workerUrl = new URL(PDFJS_BASE + "pdf.worker.min.mjs", window.location.origin).href;
    if (polyfill) {
      // A small module worker that adds the methods, then loads the real one.
      const shim = new Blob([`${MAP_POLYFILL}\nawait import(${JSON.stringify(workerUrl)});`], {
        type: "text/javascript",
      });
      lib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(shim), { type: "module" });
    } else {
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
    }
    return lib;
  })();
  // If loading failed, let the next try start over instead of caching the error.
  library.catch(() => {
    library = null;
  });
  return library;
}

export class PdfProblem extends Error {}

export const isPdfFile = (file: File) =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name);

/** An open PDF and the way to release it (pdf.js keeps a worker alive). */
export type OpenedPdf = { doc: PDFDocumentProxy; close: () => Promise<void> };

export async function openPdf(file: File): Promise<OpenedPdf> {
  const pdfjs = await loadPdfJs();
  try {
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      // Fonts and colour data a PDF may rely on instead of embedding them
      // (including the Chinese character maps).
      cMapUrl: PDFJS_BASE + "cmaps/",
      cMapPacked: true,
      standardFontDataUrl: PDFJS_BASE + "standard_fonts/",
      wasmUrl: PDFJS_BASE + "wasm/",
      iccUrl: PDFJS_BASE + "iccs/",
    });
    const doc = await task.promise;
    return { doc, close: () => task.destroy() };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") {
      throw new PdfProblem("That PDF is password-protected. Remove the password and try again.");
    }
    if (name === "InvalidPDFException" || name === "FormatError") {
      throw new PdfProblem("That file doesn't look like a valid PDF.");
    }
    throw new PdfProblem("That PDF could not be opened.");
  }
}

/** A page's size in PDF points (1/72 inch), with its own rotation applied. */
export function pageSize(page: PDFPageProxy) {
  const { width, height } = page.getViewport({ scale: 1 });
  return { width, height, widthMm: (width / 72) * 25.4, heightMm: (height / 72) * 25.4 };
}

function canvasFor(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** A small rendering of the page: for the thumbnail and to read its shape. */
export async function renderPdfPreview(page: PDFPageProxy, longSide = 1200): Promise<ImageBitmap> {
  const { width, height } = pageSize(page);
  const scale = longSide / Math.max(width, height);
  const canvas = canvasFor(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  await page.render({ canvas, viewport: page.getViewport({ scale }), background: "#ffffff" }).promise;
  const bitmap = await createImageBitmap(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return bitmap;
}

/** The page drawn at the size the AI step starts from: large enough to hold
 *  the detail of a picture inside the PDF (about 135 dpi on A4), small enough
 *  that its 4x enlargement stays within what the browser can hold. */
export async function renderPdfForEnhance(page: PDFPageProxy, longSide = 1600): Promise<ImageBitmap> {
  const { width, height } = pageSize(page);
  let scale = longSide / Math.max(width, height);
  const maxInputPixels = (MAX_ENHANCED_PIXELS / (ENHANCE_SCALE * ENHANCE_SCALE)) * 0.9;
  if (width * height * scale * scale > maxInputPixels) {
    scale = Math.sqrt(maxInputPixels / (width * height));
  }
  const canvas = canvasFor(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  await page.render({ canvas, viewport: page.getViewport({ scale }), background: "#ffffff" }).promise;
  const bitmap = await createImageBitmap(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return bitmap;
}

/** The page on the print's trim area at exactly 300 dpi: cropped to fill, or
 *  fitted on white, the same two choices as for a picture — but drawn at that
 *  size directly, never resampled. */
export async function renderPdfToTrim(
  page: PDFPageProxy,
  plan: PrintPlan,
  fit: FitMode,
): Promise<HTMLCanvasElement> {
  const { width, height } = pageSize(page);
  const { scale, drawW, drawH } = placement(width, height, plan, fit);

  const canvas = canvasFor(plan.trimW, plan.trimH);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PdfProblem("Your browser could not create a drawing surface.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, plan.trimW, plan.trimH);

  // Centre the page; when it overflows (fill), the offsets go negative and
  // the overflow is simply never drawn.
  const viewport = page.getViewport({
    scale,
    offsetX: (plan.trimW - drawW) / 2,
    offsetY: (plan.trimH - drawH) / 2,
  });
  await page.render({ canvas, viewport, background: "#ffffff" }).promise;
  return canvas;
}
