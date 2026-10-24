// Browser-only: finds and removes a plain white margin around a flyer image.
//
// Flyers exported from Canva/Photoshop often carry a white strip along one or
// more edges (an artboard bigger than the artwork). Left in, it ends up inside
// the trim — and "Mirror the edges" then mirrors that white into the bleed —
// so the print shows the photo stopping short of the edge with a white band
// beside it. Trimming the margin first lets the artwork reach the cut line.

import type { PrintSource } from "./render";

export type Border = { left: number; top: number; right: number; bottom: number };

const ANALYSE_MAX_PX = 1000; // analysed on a small copy; plenty for a margin
const LIGHT = 236; // every channel at least this = "white" (allows JPEG noise)
const SHARE = 0.985; // share of a row/column that must be white to count as margin
const MAX_SHARE_PER_SIDE = 0.2; // never trim more than this of the width/height
const MIN_PX = 2; // ignore hairline differences

/** The white margin on each side, in the source's own pixels (0 = none). */
export function detectWhiteBorder(source: PrintSource): Border {
  const scale = Math.min(1, ANALYSE_MAX_PX / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { left: 0, top: 0, right: 0, bottom: 0 };
  // Transparent = white, like the rest of the tool.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  canvas.width = 0;
  canvas.height = 0;

  const white = (x: number, y: number) => {
    const p = (y * w + x) * 4;
    return data[p] >= LIGHT && data[p + 1] >= LIGHT && data[p + 2] >= LIGHT;
  };
  const columnWhite = (x: number) => {
    let n = 0;
    for (let y = 0; y < h; y++) if (white(x, y)) n++;
    return n / h >= SHARE;
  };
  const rowWhite = (y: number) => {
    let n = 0;
    for (let x = 0; x < w; x++) if (white(x, y)) n++;
    return n / w >= SHARE;
  };

  const maxX = Math.floor(w * MAX_SHARE_PER_SIDE);
  const maxY = Math.floor(h * MAX_SHARE_PER_SIDE);
  let left = 0;
  while (left < maxX && columnWhite(left)) left++;
  let right = 0;
  while (right < maxX && columnWhite(w - 1 - right)) right++;
  let top = 0;
  while (top < maxY && rowWhite(top)) top++;
  let bottom = 0;
  while (bottom < maxY && rowWhite(h - 1 - bottom)) bottom++;

  // A margin that runs right up to the cap is probably white artwork (a white
  // background flyer), not a margin — leave that side alone.
  const side = (n: number, max: number, full: number) =>
    n >= max || n / scale < MIN_PX ? 0 : Math.min(full, Math.ceil(n / scale) + 1);
  return {
    left: side(left, maxX, source.width),
    right: side(right, maxX, source.width),
    top: side(top, maxY, source.height),
    bottom: side(bottom, maxY, source.height),
  };
}

export function hasBorder(b: Border | null | undefined): b is Border {
  return !!b && b.left + b.right + b.top + b.bottom > 0;
}

/** A copy of `source` without the margin. `border` is in the pixels of an
 *  image `factor` times smaller (e.g. the original, for a 4x enhanced copy). */
export function cropBorder(source: PrintSource, border: Border, factor = 1): HTMLCanvasElement {
  const l = Math.round(border.left * factor);
  const t = Math.round(border.top * factor);
  const w = Math.max(1, source.width - l - Math.round(border.right * factor));
  const h = Math.max(1, source.height - t - Math.round(border.bottom * factor));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not create a drawing surface.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, l, t, w, h, 0, 0, w, h);
  return canvas;
}

/** "right 34 px, bottom 12 px" for the notice in the tool. */
export function describeBorder(b: Border): string {
  return (["top", "right", "bottom", "left"] as const)
    .filter((k) => b[k] > 0)
    .map((k) => `${k} ${b[k]} px`)
    .join(", ");
}
