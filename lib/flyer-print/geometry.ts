/** Print resolution every output is built at. */
export const DPI = 300;

export const PAPER_SIZES = {
  A4: { label: "A4", w: 210, h: 297 },
  A5: { label: "A5", w: 148, h: 210 },
  A6: { label: "A6", w: 105, h: 148 },
  DL: { label: "DL", w: 99, h: 210 },
} as const;

export type PaperKey = keyof typeof PAPER_SIZES;
export type Orientation = "portrait" | "landscape";

/** Any other finished size, in millimetres, exactly as it will be cut. */
export type CustomPaper = { widthMm: number; heightMm: number };

export const MIN_CUSTOM_MM = 20;
export const MAX_CUSTOM_MM = 1000;
/** The whole page, bleed and marks included. Bigger than about A2 asks the
 *  browser for more memory than it reliably has. */
export const MAX_PAGE_PIXELS = 40_000_000;

export const DEFAULT_BLEED_MM = 3;
export const MAX_BLEED_MM = 10;

// Crop marks sit outside the bleed: a small gap (so they never print into the
// bleed), then the mark itself, then a margin before the page edge.
export const MARK_GAP_MM = 1;
export const MARK_LENGTH_MM = 4;
export const MARK_MARGIN_MM = 1;
/** Extra paper needed beyond the bleed to hold the marks. */
export const MARK_SLUG_MM = MARK_GAP_MM + MARK_LENGTH_MM + MARK_MARGIN_MM;

export const mmToPx = (mm: number) => Math.round((mm / 25.4) * DPI);
/** PDF user units (points) for a number of 300 dpi pixels. */
export const pxToPt = (px: number) => (px * 72) / DPI;

export type PrintPlan = {
  orientation: Orientation;
  trimWmm: number;
  trimHmm: number;
  bleedMm: number;
  marks: boolean;
  /** Everything in pixels at 300 dpi. */
  trimW: number;
  trimH: number;
  bleed: number;
  /** Paper beyond the bleed, holding the crop marks (0 without marks). */
  slug: number;
  /** The whole page: trim + bleed + slug on every side. */
  pageW: number;
  pageH: number;
  pageWmm: number;
  pageHmm: number;
};

export function planPrint(options: {
  paper: PaperKey | CustomPaper;
  orientation: Orientation;
  bleedMm: number;
  marks: boolean;
}): PrintPlan {
  // A standard size is stored upright and turned by the orientation; a custom
  // size is already the finished width and height, so it is used as given.
  let trimWmm: number;
  let trimHmm: number;
  if (typeof options.paper === "string") {
    const { w, h } = PAPER_SIZES[options.paper];
    const landscape = options.orientation === "landscape";
    trimWmm = landscape ? h : w;
    trimHmm = landscape ? w : h;
  } else {
    trimWmm = options.paper.widthMm;
    trimHmm = options.paper.heightMm;
  }
  const bleedMm = Math.min(MAX_BLEED_MM, Math.max(0, options.bleedMm));
  const slugMm = options.marks ? MARK_SLUG_MM : 0;

  const trimW = mmToPx(trimWmm);
  const trimH = mmToPx(trimHmm);
  const bleed = mmToPx(bleedMm);
  const slug = mmToPx(slugMm);

  return {
    orientation: options.orientation,
    trimWmm,
    trimHmm,
    bleedMm,
    marks: options.marks,
    trimW,
    trimH,
    bleed,
    slug,
    pageW: trimW + 2 * (bleed + slug),
    pageH: trimH + 2 * (bleed + slug),
    pageWmm: trimWmm + 2 * (bleedMm + slugMm),
    pageHmm: trimHmm + 2 * (bleedMm + slugMm),
  };
}

/** Reads the two custom-size boxes: the size, or why it cannot be used. */
export function checkCustomPaper(
  widthText: string,
  heightText: string,
): { paper: CustomPaper | null; problem: string | null } {
  const widthMm = Number.parseFloat(widthText);
  const heightMm = Number.parseFloat(heightText);
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm)) {
    return { paper: null, problem: "Enter both a width and a height in millimetres." };
  }
  if (widthMm < MIN_CUSTOM_MM || heightMm < MIN_CUSTOM_MM || widthMm > MAX_CUSTOM_MM || heightMm > MAX_CUSTOM_MM) {
    return { paper: null, problem: `Each side must be between ${MIN_CUSTOM_MM} and ${MAX_CUSTOM_MM} mm.` };
  }
  return { paper: { widthMm, heightMm }, problem: null };
}

/** Landscape images get a landscape page unless the visitor says otherwise. */
export function autoOrientation(width: number, height: number): Orientation {
  return width > height ? "landscape" : "portrait";
}

export type FitMode = "fill" | "fit";

/** The scale from source pixels to trim pixels for a fit mode. */
function scaleFor(srcW: number, srcH: number, plan: PrintPlan, fit: FitMode) {
  const sx = plan.trimW / srcW;
  const sy = plan.trimH / srcH;
  return fit === "fill" ? Math.max(sx, sy) : Math.min(sx, sy);
}

/** How sharp the flyer will print: the source's real resolution at the
 *  paper size. Below ~150 an upscale will look soft. */
export function effectiveDpi(srcW: number, srcH: number, plan: PrintPlan, fit: FitMode) {
  return DPI / scaleFor(srcW, srcH, plan, fit);
}

export type DpiVerdict = { level: "great" | "good" | "soft" | "low"; text: string };

export function judgeDpi(dpi: number): DpiVerdict {
  if (dpi >= 300) return { level: "great", text: "Plenty of detail for print." };
  if (dpi >= 200)
    return { level: "good", text: "Good — it will be enlarged slightly and still print well." };
  if (dpi >= 150)
    return { level: "soft", text: "A bit soft — enlarged noticeably, so fine text may look slightly fuzzy." };
  return {
    level: "low",
    text: "Low resolution — enlarging this much will look soft. Use a larger original if you can.",
  };
}

/** Share (0–1) of the picture lost off the edges when filling the page. */
export function croppedShare(srcW: number, srcH: number, plan: PrintPlan): number {
  const srcAspect = srcW / srcH;
  const pageAspect = plan.trimW / plan.trimH;
  return 1 - Math.min(srcAspect / pageAspect, pageAspect / srcAspect);
}

/** Placement of the source on the trim area. */
export function placement(srcW: number, srcH: number, plan: PrintPlan, fit: FitMode) {
  const scale = scaleFor(srcW, srcH, plan, fit);
  return { scale, drawW: Math.round(srcW * scale), drawH: Math.round(srcH * scale) };
}
