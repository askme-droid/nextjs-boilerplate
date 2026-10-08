// Browser-only: builds the print files with canvas, pica and pdf-lib. Nothing
// is uploaded anywhere — the flyer never leaves the visitor's computer, which
// is also why there are no size limits or per-image costs.

import {
  DPI,
  MARK_GAP_MM,
  MARK_LENGTH_MM,
  mmToPx,
  placement,
  pxToPt,
  type FitMode,
  type PrintPlan,
} from "./geometry";

export type BleedMode = "mirror" | "stretch";

export type RenderOptions = {
  plan: PrintPlan;
  fit: FitMode;
  bleedMode: BleedMode;
  title: string;
};

export type RenderResult = {
  png: Blob;
  pdf: Blob;
  /** Small JPEG of the finished page, for on-screen checking. */
  previewUrl: string;
};

type Stage = (message: string) => void;

const PREVIEW_MAX_PX = 900;
// Crop marks are 0.5pt wide in the PDF and the same width in the PNG.
const MARK_THICKNESS_PT = 0.5;
const JPEG_QUALITY = 0.95;

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not create a drawing surface.");
  return ctx;
}

/** Hands memory back sooner than waiting for garbage collection. */
function release(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

// Lets the page repaint ("Resizing…") between heavy steps.
const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))),
      type,
      quality,
    );
  });
}

/** The flyer on the trim area at exactly 300 dpi: resized with pica (high
 *  quality Lanczos-style resampling), cropped to fill or fitted on white. */
async function buildTrim(bitmap: ImageBitmap, plan: PrintPlan, fit: FitMode, onStage: Stage) {
  const { Pica } = await import("pica");
  const pica = new Pica();

  const trim = createCanvas(plan.trimW, plan.trimH);
  const ctx = context(trim);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, plan.trimW, plan.trimH);

  const { scale, drawW, drawH } = placement(bitmap.width, bitmap.height, plan, fit);
  onStage("Resizing to 300 dpi…");
  await nextFrame();

  let source: ImageBitmap | HTMLCanvasElement = bitmap;
  let cropped: HTMLCanvasElement | null = null;
  let targetW = drawW;
  let targetH = drawH;

  if (fit === "fill") {
    // Cut the part of the flyer that overflows the page out first, 1:1, then
    // resize just that — pica only scales whole images.
    const cropW = Math.min(bitmap.width, Math.round(plan.trimW / scale));
    const cropH = Math.min(bitmap.height, Math.round(plan.trimH / scale));
    const sx = Math.round((bitmap.width - cropW) / 2);
    const sy = Math.round((bitmap.height - cropH) / 2);
    cropped = createCanvas(cropW, cropH);
    context(cropped).drawImage(bitmap, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
    source = cropped;
    targetW = plan.trimW;
    targetH = plan.trimH;
  }

  const resized = createCanvas(targetW, targetH);
  await pica.resize(source, resized);
  if (cropped) release(cropped);

  ctx.drawImage(
    resized,
    Math.round((plan.trimW - targetW) / 2),
    Math.round((plan.trimH - targetH) / 2),
  );
  release(resized);
  return trim;
}

/** The trim area plus bleed on every side, made by extending the edges. */
function buildBleed(trim: HTMLCanvasElement, plan: PrintPlan, mode: BleedMode) {
  const { trimW: w, trimH: h, bleed: b } = plan;
  if (b === 0) return trim;

  const out = createCanvas(w + 2 * b, h + 2 * b);
  const ctx = context(out);
  ctx.imageSmoothingEnabled = false;

  // Nine tiles: the trim itself in the middle, four edge strips and four
  // corners around it. -1 = before the trim, 0 = along it, 1 = after it.
  for (const dy of [-1, 0, 1]) {
    for (const dx of [-1, 0, 1]) {
      const destW = dx === 0 ? w : b;
      const destH = dy === 0 ? h : b;
      const destX = dx < 0 ? 0 : dx === 0 ? b : b + w;
      const destY = dy < 0 ? 0 : dy === 0 ? b : b + h;

      if (dx === 0 && dy === 0) {
        ctx.drawImage(trim, destX, destY);
        continue;
      }

      // The strip of the flyer next to this edge (or corner).
      const srcW = mode === "stretch" ? (dx === 0 ? w : 1) : destW;
      const srcH = mode === "stretch" ? (dy === 0 ? h : 1) : destH;
      const srcX = dx < 0 ? 0 : dx === 0 ? 0 : w - srcW;
      const srcY = dy < 0 ? 0 : dy === 0 ? 0 : h - srcH;

      // "Mirror" flips the strip so it reflects the picture across the edge;
      // "stretch" smears the edge pixels outward (best on flat colours).
      const flipX = mode === "mirror" && dx !== 0;
      const flipY = mode === "mirror" && dy !== 0;

      ctx.save();
      ctx.translate(destX + (flipX ? destW : 0), destY + (flipY ? destH : 0));
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.drawImage(trim, srcX, srcY, srcW, srcH, 0, 0, destW, destH);
      ctx.restore();
    }
  }
  return out;
}

/** Positions of the eight crop-mark segments, in page pixels (y down). Each
 *  is {x, y, w, h} of a thin filled rectangle. */
function markRects(plan: PrintPlan) {
  const t = Math.max(1, Math.round((MARK_THICKNESS_PT / 72) * DPI));
  const offset = plan.bleed + mmToPx(MARK_GAP_MM);
  const length = mmToPx(MARK_LENGTH_MM);
  const left = plan.slug + plan.bleed;
  const top = left;
  const right = left + plan.trimW;
  const bottom = top + plan.trimH;

  const rects: { x: number; y: number; w: number; h: number }[] = [];
  for (const [cx, sx] of [
    [left, -1],
    [right, 1],
  ] as const) {
    for (const [cy, sy] of [
      [top, -1],
      [bottom, 1],
    ] as const) {
      // Horizontal mark, level with the trim edge, pointing away from the page.
      const hx = sx < 0 ? cx - offset - length : cx + offset;
      rects.push({ x: hx, y: cy - Math.floor(t / 2), w: length, h: t });
      // Vertical mark.
      const vy = sy < 0 ? cy - offset - length : cy + offset;
      rects.push({ x: cx - Math.floor(t / 2), y: vy, w: t, h: length });
    }
  }
  return rects;
}

/** The whole page — bleed artwork on white paper with crop marks around it. */
function buildPage(art: HTMLCanvasElement, plan: PrintPlan) {
  if (plan.slug === 0) return art;
  const page = createCanvas(plan.pageW, plan.pageH);
  const ctx = context(page);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, plan.pageW, plan.pageH);
  ctx.drawImage(art, plan.slug, plan.slug);
  ctx.fillStyle = "#000000";
  for (const r of markRects(plan)) ctx.fillRect(r.x, r.y, r.w, r.h);
  return page;
}

// --- PNG with a 300 dpi tag ------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Canvas PNGs carry no resolution, so programs open them at 72 dpi. Writing
 *  a pHYs chunk (pixels per metre) makes them open as 300 dpi. */
function tagAs300Dpi(png: Uint8Array): Uint8Array {
  const pixelsPerMetre = Math.round(DPI / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, pixelsPerMetre);
  view.setUint32(12, pixelsPerMetre);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));

  // Straight after IHDR: 8-byte signature + 25-byte IHDR chunk.
  const at = 33;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
}

// --- PDF -------------------------------------------------------------------

async function buildPdf(art: HTMLCanvasElement, plan: PrintPlan, title: string) {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const jpeg = new Uint8Array(await (await toBlob(art, "image/jpeg", JPEG_QUALITY)).arrayBuffer());

  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const page = pdf.addPage([pxToPt(plan.pageW), pxToPt(plan.pageH)]);
  const image = await pdf.embedJpg(jpeg);

  const artX = pxToPt(plan.slug);
  const artW = pxToPt(art.width);
  const artH = pxToPt(art.height);
  // PDF's y axis points up; everything here is symmetric, so one offset does.
  page.drawImage(image, { x: artX, y: artX, width: artW, height: artH });

  if (plan.marks) {
    const black = rgb(0, 0, 0);
    for (const r of markRects(plan)) {
      page.drawRectangle({
        x: pxToPt(r.x),
        y: pxToPt(plan.pageH - r.y - r.h),
        width: pxToPt(r.w),
        height: pxToPt(r.h),
        color: black,
      });
    }
  }

  // What a printer's software reads to find the finished size and the bleed.
  const trimOffset = pxToPt(plan.slug + plan.bleed);
  page.setTrimBox(trimOffset, trimOffset, pxToPt(plan.trimW), pxToPt(plan.trimH));
  page.setBleedBox(artX, artX, artW, artH);

  const bytes = await pdf.save();
  // Copy into a fresh ArrayBuffer-backed array so Blob accepts it everywhere.
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

// --- Entry point -----------------------------------------------------------

export async function renderPrintFiles(
  bitmap: ImageBitmap,
  options: RenderOptions,
  onStage: Stage,
): Promise<RenderResult> {
  const { plan, fit, bleedMode, title } = options;

  const trim = await buildTrim(bitmap, plan, fit, onStage);

  onStage(plan.bleed > 0 ? "Adding bleed…" : "Preparing the page…");
  await nextFrame();
  const art = buildBleed(trim, plan, bleedMode);
  if (art !== trim) release(trim);

  const page = buildPage(art, plan);

  onStage("Creating the PNG…");
  await nextFrame();
  const rawPng = new Uint8Array(await (await toBlob(page, "image/png")).arrayBuffer());
  const png = new Blob([new Uint8Array(tagAs300Dpi(rawPng))], { type: "image/png" });

  onStage("Creating the PDF…");
  await nextFrame();
  const pdf = await buildPdf(art, plan, title);

  // A small copy of the finished page to look at before downloading.
  const scale = Math.min(1, PREVIEW_MAX_PX / Math.max(page.width, page.height));
  const preview = createCanvas(Math.round(page.width * scale), Math.round(page.height * scale));
  const pctx = context(preview);
  pctx.imageSmoothingQuality = "high";
  pctx.drawImage(page, 0, 0, preview.width, preview.height);
  const previewUrl = URL.createObjectURL(await toBlob(preview, "image/jpeg", 0.85));

  release(preview);
  if (page !== art) release(page);
  release(art);

  return { png, pdf, previewUrl };
}
