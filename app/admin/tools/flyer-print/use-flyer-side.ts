"use client";

import { useEffect, useRef, useState } from "react";
import { enhanceBitmap, type EnhanceProgress, type EnhanceResult } from "@/lib/flyer-print/enhance";
import type { PrintSource } from "@/lib/flyer-print/render";
import { detectWhiteBorder, hasBorder, type Border } from "@/lib/flyer-print/borders";
import {
  PdfProblem,
  type OpenedPdf,
  isPdfFile,
  openPdf,
  pageSize,
  renderPdfForEnhance,
  renderPdfPreview,
} from "@/lib/flyer-print/pdf";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

// Decoding and resizing hold several full-size copies in memory at once.
const MAX_SOURCE_PIXELS = 120_000_000;

export type PdfInfo = {
  doc: PDFDocumentProxy;
  page: PDFPageProxy;
  pageNumber: number;
  pageCount: number;
  widthMm: number;
  heightMm: number;
};

// For a PDF, `bitmap` is only a small rendering (to show a thumbnail and read
// the page's shape); the print files are drawn from the PDF page itself.
export type Source = { name: string; file: File; bitmap: ImageBitmap; previewUrl: string; pdf?: PdfInfo };

// For a PDF, `reference` is the page drawing the AI started from (the
// "before" side of the comparison); for a picture it is the picture itself.
export type Enhanced = EnhanceResult & { id: number; reference?: ImageBitmap };

let enhanceCount = 0;

/**
 * One side of the flyer (front or back): the chosen file, its PDF page, a
 * white margin found around it, and its AI-enhanced copy. The print settings
 * are shared by both sides and live in the tool itself.
 */
export function useFlyerSide({
  setError,
  setWorking,
  track,
}: {
  setError: (message: string | null) => void;
  setWorking: (message: string | null) => void;
  track: (url: string) => string;
}) {
  const [source, setSource] = useState<Source | null>(null);
  const [enhanced, setEnhanced] = useState<Enhanced | null>(null);
  const [useEnhanced, setUseEnhanced] = useState(true);
  const [enhancing, setEnhancing] = useState<EnhanceProgress | null>(null);
  // A plain white margin found around an image flyer, and whether to cut it
  // off before printing (lib/flyer-print/borders.ts).
  const [border, setBorder] = useState<{ bitmap: ImageBitmap; border: Border } | null>(null);
  const [removeBorder, setRemoveBorder] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const enhancedRef = useRef<Enhanced | null>(null);
  const pdfRef = useRef<OpenedPdf | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      void pdfRef.current?.close();
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

  const foundBorder =
    source && !source.pdf && border?.bitmap === source.bitmap && hasBorder(border.border) ? border.border : null;
  const trimBorder = !!foundBorder && removeBorder;
  // Size of the flyer once its margin is cut off, for the dpi and crop notes.
  const srcW = source ? source.bitmap.width - (trimBorder ? foundBorder.left + foundBorder.right : 0) : 0;
  const srcH = source ? source.bitmap.height - (trimBorder ? foundBorder.top + foundBorder.bottom : 0) : 0;
  // The AI-enhanced copy (4x the pixels) stands in for the original when chosen.
  const enhancedInUse = !!enhanced && useEnhanced;
  const activeSource: PrintSource | null = source ? (enhancedInUse ? enhanced.canvas : source.bitmap) : null;

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
      enhanceCount += 1;
      const next: Enhanced = { ...made, id: enhanceCount, reference: drawing ?? undefined };
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

  function cancelEnhance() {
    abortRef.current?.abort();
  }

  /** Opens a page of a PDF: a small rendering for the thumbnail and shape. */
  async function preparePdfSource(doc: PDFDocumentProxy, pageNumber: number, file: File): Promise<Source> {
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
      name: file.name,
      file,
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

  async function loadPdf(file: File, pageNumber: number) {
    setWorking("Opening the PDF…");
    try {
      const opened = await openPdf(file);
      let next: Source;
      try {
        next = await preparePdfSource(opened.doc, Math.min(pageNumber, opened.doc.numPages), file);
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
      const next = await preparePdfSource(source.pdf.doc, pageNumber, source.file);
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

  /** Opens an image or PDF. For a PDF, `pageNumber` picks the page (e.g. 2
   *  when the back is the second page of the same PDF). */
  async function loadFile(file: File, pageNumber = 1) {
    setError(null);
    if (isPdfFile(file)) {
      await loadPdf(file, pageNumber);
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
    setSource({ name: file.name, file, bitmap, previewUrl: track(URL.createObjectURL(file)) });
  }

  function clear() {
    abortRef.current?.abort();
    dropEnhanced();
    source?.bitmap.close();
    void pdfRef.current?.close();
    pdfRef.current = null;
    setSource(null);
  }

  return {
    source,
    enhanced,
    useEnhanced,
    setUseEnhanced,
    enhancing,
    removeBorder,
    setRemoveBorder,
    foundBorder,
    trimBorder,
    srcW,
    srcH,
    enhancedInUse,
    activeSource,
    enhance,
    cancelEnhance,
    changePdfPage,
    loadFile,
    clear,
  };
}

export type FlyerSide = ReturnType<typeof useFlyerSide>;
