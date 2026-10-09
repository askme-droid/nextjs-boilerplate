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
import { placement, type FitMode, type PrintPlan } from "./geometry";

type PdfJs = typeof import("pdfjs-dist");

const PDFJS_BASE = "/pdfjs/";

let library: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  library ??= (async () => {
    // By URL at runtime (not bundled): it is large and only needed for PDFs.
    const lib = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ PDFJS_BASE + "pdf.min.mjs"
    )) as PdfJs;
    lib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + "pdf.worker.min.mjs";
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
