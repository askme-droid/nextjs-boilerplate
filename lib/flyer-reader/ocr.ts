// Browser-only: reads the text on a flyer image with PaddleOCR "PP-OCRv4"
// (Apache-2.0, see public/models/ppocr-v4/LICENSE.txt), running on the
// visitor's own computer through onnxruntime-web. Nothing is uploaded.
//
// Two small neural networks: one finds where the text is, one reads each
// piece. There is no OpenCV here — the "find the text" step is a threshold plus
// connected components, which suits the horizontal lettering of a flyer.

import type * as OrtTypes from "onnxruntime-web";
import type { ReaderLine } from "./text";

type Ort = typeof OrtTypes;

const ORT_BASE = "/ort/";
const MODEL_BASE = "/models/ppocr-v4/";

export type ReadProgress = { phase: "loading" | "reading"; done: number; total: number };

type Loaded = { ort: Ort; det: OrtTypes.InferenceSession; rec: OrtTypes.InferenceSession; keys: string[]; words: string };

let loading: Promise<Loaded> | null = null;

/** Loads the runtime and both models once; later reads reuse them. */
export function loadReader(): Promise<Loaded> {
  loading ??= (async () => {
    const ort = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ ORT_BASE + "ort.wasm.min.mjs")) as Ort;
    ort.env.wasm.wasmPaths = ORT_BASE;
    const bytes = (name: string) => fetch(MODEL_BASE + name).then((r) => r.arrayBuffer());
    const text = (name: string) => fetch(MODEL_BASE + name).then((r) => r.text());
    const [detBytes, recBytes, keysText, words] = await Promise.all([
      bytes("det.onnx"),
      bytes("rec.onnx"),
      text("keys.txt"),
      text("words.txt"),
    ]);
    const options = { executionProviders: ["wasm"] };
    const [det, rec] = await Promise.all([
      ort.InferenceSession.create(new Uint8Array(detBytes), options),
      ort.InferenceSession.create(new Uint8Array(recBytes), options),
    ]);
    const keys = keysText.split("\n");
    if (keys[keys.length - 1] === "") keys.pop();
    return { ort, det, rec, keys, words };
  })();
  // A failed load must not be remembered, or the button would never work again.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

const makeCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Where the text is: boxes in the image's own pixels. */
async function findText(reader: Loaded, image: ImageBitmap): Promise<Box[]> {
  const { ort, det } = reader;
  const W0 = image.width;
  const H0 = image.height;
  const shrink = Math.max(W0, H0) > 960 ? 960 / Math.max(W0, H0) : 1;
  const w = Math.max(32, Math.round((W0 * shrink) / 32) * 32);
  const h = Math.max(32, Math.round((H0 * shrink) / 32) * 32);

  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser could not create a drawing surface.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h).data;
  canvas.width = 0;

  // Blue-green-red order and ImageNet mean/std, as the model was trained.
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const input = new Float32Array(3 * w * h);
  for (let i = 0; i < w * h; i++) {
    input[i] = (pixels[i * 4 + 2] / 255 - mean[0]) / std[0];
    input[w * h + i] = (pixels[i * 4 + 1] / 255 - mean[1]) / std[1];
    input[2 * w * h + i] = (pixels[i * 4] / 255 - mean[2]) / std[2];
  }
  const result = await det.run({ [det.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, h, w]) });
  const prob = result[det.outputNames[0]].data as Float32Array;

  const lit = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) lit[i] = prob[i] > 0.3 ? 1 : 0;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const boxes: Box[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!lit[start] || seen[start]) continue;
    let minX = w, maxX = 0, minY = h, maxY = 0, count = 0, sum = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop() as number;
      const x = p % w;
      const y = (p - x) / w;
      count++;
      sum += prob[p];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && lit[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < w - 1 && lit[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && lit[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
      if (y < h - 1 && lit[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (count < 12 || Math.min(bw, bh) < 3 || sum / count < 0.5) continue;
    // The network marks a shrunken core of each word; grow it back out.
    const grow = (bw * bh * 1.5) / (2 * (bw + bh));
    boxes.push({
      x0: Math.max(0, (minX - grow) / (w / W0)),
      y0: Math.max(0, (minY - grow) / (h / H0)),
      x1: Math.min(W0, (maxX + grow) / (w / W0)),
      y1: Math.min(H0, (maxY + grow) / (h / H0)),
    });
  }
  return boxes;
}

/** Reads one box of text. */
async function readBox(reader: Loaded, image: ImageBitmap, box: Box): Promise<{ text: string; confidence: number }> {
  const { ort, rec, keys } = reader;
  const cw = Math.max(1, Math.round(box.x1 - box.x0));
  const ch = Math.max(1, Math.round(box.y1 - box.y0));
  let source = makeCanvas(cw, ch);
  source.getContext("2d")?.drawImage(image, box.x0, box.y0, cw, ch, 0, 0, cw, ch);
  if (ch / cw >= 1.5) {
    // A tall box is most likely turned text: lay it on its side to read it.
    const turned = makeCanvas(ch, cw);
    const tctx = turned.getContext("2d");
    if (tctx) {
      tctx.translate(0, cw);
      tctx.rotate(-Math.PI / 2);
      tctx.drawImage(source, 0, 0);
      source = turned;
    }
  }
  const width = Math.min(1600, Math.max(16, Math.ceil((48 * source.width) / source.height)));
  const strip = makeCanvas(width, 48);
  const sctx = strip.getContext("2d", { willReadFrequently: true });
  if (!sctx) return { text: "", confidence: 0 };
  sctx.fillStyle = "#ffffff";
  sctx.fillRect(0, 0, width, 48);
  sctx.drawImage(source, 0, 0, width, 48);
  const pixels = sctx.getImageData(0, 0, width, 48).data;
  const plane = 48 * width;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = (pixels[i * 4 + 2] / 255 - 0.5) / 0.5;
    input[plane + i] = (pixels[i * 4 + 1] / 255 - 0.5) / 0.5;
    input[2 * plane + i] = (pixels[i * 4] / 255 - 0.5) / 0.5;
  }
  const result = await rec.run({ [rec.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, 48, width]) });
  const out = result[rec.outputNames[0]];
  const steps = out.dims[1];
  const classes = out.dims[2];
  const data = out.data as Float32Array;

  // CTC: take the likeliest character at each step, drop repeats and blanks.
  let previous = -1;
  let text = "";
  let sum = 0;
  let kept = 0;
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let bestP = -1;
    for (let c = 0; c < classes; c++) {
      const p = data[t * classes + c];
      if (p > bestP) { bestP = p; best = c; }
    }
    if (best !== 0 && best !== previous) {
      text += best - 1 < keys.length ? keys[best - 1] : " ";
      sum += bestP;
      kept++;
    }
    previous = best;
  }
  return { text, confidence: kept ? sum / kept : 0 };
}

/** Reads a flyer image: lines of text with where they sit and how sure the reader is. */
export async function readFlyer(
  file: Blob,
  onProgress?: (progress: ReadProgress) => void,
): Promise<{ lines: ReaderLine[]; words: string }> {
  onProgress?.({ phase: "loading", done: 0, total: 0 });
  const reader = await loadReader();
  const image = await createImageBitmap(file);
  try {
    const boxes = await findText(reader, image);
    const pieces: (Box & { text: string; confidence: number })[] = [];
    for (const [index, box] of boxes.entries()) {
      onProgress?.({ phase: "reading", done: index, total: boxes.length });
      const read = await readBox(reader, image, box);
      if (read.text.trim()) pieces.push({ ...box, ...read });
      // Let the page repaint (progress, Cancel) between boxes.
      if (index % 3 === 2) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    // Boxes that sit on the same row make one line, read left to right.
    pieces.sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
    const rows: { parts: typeof pieces; y0: number; y1: number }[] = [];
    for (const piece of pieces) {
      const middle = (piece.y0 + piece.y1) / 2;
      const height = piece.y1 - piece.y0;
      const row = rows.find((r) => Math.abs((r.y0 + r.y1) / 2 - middle) < Math.min(r.y1 - r.y0, height) * 0.45);
      if (row) {
        row.parts.push(piece);
        row.y0 = Math.min(row.y0, piece.y0);
        row.y1 = Math.max(row.y1, piece.y1);
      } else rows.push({ parts: [piece], y0: piece.y0, y1: piece.y1 });
    }
    const lines = rows
      .map((row) => {
        row.parts.sort((a, b) => a.x0 - b.x0);
        return {
          text: row.parts.map((p) => p.text).join(" "),
          confidence: (row.parts.reduce((s, p) => s + p.confidence, 0) / row.parts.length) * 100,
          bbox: {
            x0: Math.min(...row.parts.map((p) => p.x0)),
            y0: row.y0,
            x1: Math.max(...row.parts.map((p) => p.x1)),
            y1: row.y1,
          },
        };
      })
      .sort((a, b) => a.bbox.y0 - b.bbox.y0);
    return { lines, words: reader.words };
  } finally {
    image.close();
  }
}
