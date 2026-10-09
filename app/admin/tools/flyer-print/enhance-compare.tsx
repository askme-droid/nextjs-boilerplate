"use client";

import { useEffect, useRef, useState } from "react";
import { ENHANCE_SCALE } from "@/lib/flyer-print/enhance";

// The window is a patch of the page at real print resolution, so what you see
// is what the printer gets (shown larger than life so edges are easy to judge).
const VIEW_W = 360;
const VIEW_H = 240;

// Where on the flyer to look: a 3 x 3 grid of spots, centre by default.
const AREAS = [
  { name: "Top left", x: 0.15, y: 0.15 },
  { name: "Top", x: 0.5, y: 0.15 },
  { name: "Top right", x: 0.85, y: 0.15 },
  { name: "Left", x: 0.15, y: 0.5 },
  { name: "Centre", x: 0.5, y: 0.5 },
  { name: "Right", x: 0.85, y: 0.5 },
  { name: "Bottom left", x: 0.15, y: 0.85 },
  { name: "Bottom", x: 0.5, y: 0.85 },
  { name: "Bottom right", x: 0.85, y: 0.85 },
] as const;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** The spot on the flyer with the most going on (edges, text), so the
 *  comparison opens where the difference is easiest to judge. */
function busiestArea(image: ImageBitmap): number {
  const width = 96;
  const height = Math.max(1, Math.round((width * image.height) / image.width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 4;
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const luma = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  let best = 4;
  let bestEnergy = -1;
  AREAS.forEach((spot, index) => {
    const cx = Math.round(spot.x * (width - 1));
    const cy = Math.round(spot.y * (height - 1));
    const half = 14;
    let energy = 0;
    for (let y = Math.max(0, cy - half); y < Math.min(height - 1, cy + half); y++) {
      for (let x = Math.max(0, cx - half); x < Math.min(width - 1, cx + half); x++) {
        energy += Math.abs(luma(x + 1, y) - luma(x, y)) + Math.abs(luma(x, y + 1) - luma(x, y));
      }
    }
    if (energy > bestEnergy) {
      bestEnergy = energy;
      best = index;
    }
  });
  return best;
}

/**
 * Original on the left, AI-enhanced on the right, with a slider to move the
 * dividing line. `printScale` is how much the original is enlarged on the
 * printed page (print pixels per source pixel).
 */
export function EnhanceCompare({
  original,
  enhanced,
  printScale,
}: {
  original: ImageBitmap;
  enhanced: HTMLCanvasElement;
  printScale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [area, setArea] = useState(() => busiestArea(original));
  const [split, setSplit] = useState(50);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // The patch of the original that fills the window at print resolution.
    const srcW = Math.min(original.width, VIEW_W / printScale);
    const srcH = Math.min(original.height, VIEW_H / printScale);
    const viewW = Math.max(1, Math.round(srcW * printScale));
    const viewH = Math.max(1, Math.round(srcH * printScale));
    const spot = AREAS[area];
    const sx = clamp(spot.x * original.width - srcW / 2, 0, original.width - srcW);
    const sy = clamp(spot.y * original.height - srcH / 2, 0, original.height - srcH);

    canvas.width = viewW;
    canvas.height = viewH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.drawImage(original, sx, sy, srcW, srcH, 0, 0, viewW, viewH);

    const divider = Math.round((viewW * split) / 100);
    ctx.save();
    ctx.beginPath();
    ctx.rect(divider, 0, viewW - divider, viewH);
    ctx.clip();
    ctx.drawImage(
      enhanced,
      sx * ENHANCE_SCALE,
      sy * ENHANCE_SCALE,
      srcW * ENHANCE_SCALE,
      srcH * ENHANCE_SCALE,
      0,
      0,
      viewW,
      viewH,
    );
    ctx.restore();

    ctx.fillStyle = "#0eb2bf";
    ctx.fillRect(divider - 1, 0, 2, viewH);
  }, [original, enhanced, printScale, area, split]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800">
        <canvas ref={canvasRef} className="block h-auto w-full" />
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/65 px-2 py-0.5 text-xs font-medium text-white">
          Original
        </span>
        <span className="pointer-events-none absolute right-2 top-2 rounded bg-black/65 px-2 py-0.5 text-xs font-medium text-white">
          AI enhanced
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
        aria-label="Move the divider to compare the original with the AI-enhanced version"
        className="w-full accent-[#0eb2bf]"
      />

      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Look at</span>
        <div role="group" aria-label="Area of the flyer to compare" className="grid grid-cols-3 gap-1">
          {AREAS.map((spot, index) => (
            <button
              key={spot.name}
              type="button"
              onClick={() => setArea(index)}
              aria-label={spot.name}
              aria-pressed={area === index}
              title={spot.name}
              className={`size-6 rounded border transition-colors ${
                area === index
                  ? "border-brand-teal bg-brand-teal"
                  : "border-zinc-300 hover:border-brand-teal dark:border-zinc-700"
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{AREAS[area].name}</span>
      </div>
    </div>
  );
}
