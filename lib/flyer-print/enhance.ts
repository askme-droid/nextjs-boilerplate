// Browser-only: the optional "Enhance (AI)" step of the flyer tool.
//
// Runs Real-ESRGAN "general x4v3" (a small super-resolution network, BSD-3,
// see public/models/real-esrgan-general-x4v3/LICENSE.txt) on the visitor's own
// computer with onnxruntime-web: on the graphics card (WebGPU) when there is
// one — a few seconds for a flyer — otherwise on the processor, which takes
// minutes. Nothing is uploaded and nothing is paid for per image.
//
// The flyer is cut into overlapping 128 px tiles (the size the exported model
// accepts), each is enlarged 4x, and the results are stitched into one canvas.
// For 2x the model still enlarges 4x and each tile is then halved (as
// Real-ESRGAN's own "outscale" option does): same sharpness, a quarter of the
// pixels, so larger flyers fit in memory.
// Real-ESRGAN brightens flat areas a little and leaves a faint glow around
// dark text on JPEG-compressed art, so every tile is nudged back toward the
// original's broad colours (see `lowFrequencyCorrection`).

import type * as OrtTypes from "onnxruntime-web";

type Ort = typeof OrtTypes;
type Session = OrtTypes.InferenceSession;

// Both are served from /public: the runtime is copied there by
// scripts/copy-ort-runtime.mjs, the model files are committed.
const ORT_BASE = "/ort/";
const MODEL_BASE = "/models/real-esrgan-general-x4v3/";
const MODEL_FILE = "real_esrgan_general_x4v3.onnx";
const WEIGHTS_FILE = "real_esrgan_general_x4v3.data";

const TILE = 128; // model input size
const SCALE = 4; // model output is 4x
const PAD = 8; // overlap thrown away around each tile, in source pixels
const CORE = TILE - 2 * PAD;
const OUT_TILE = TILE * SCALE;

/** The enlarged image is held in memory, so cap its size. */
export const MAX_ENHANCED_PIXELS = 40_000_000;

export type EnhanceBackend = "webgpu" | "wasm";
export type EnhanceProgress = { phase: "loading" | "enhancing"; done: number; total: number };
/** How much wider and taller the enhanced copy is. */
export type EnhanceScale = 2 | 4;
export type EnhanceResult = { canvas: HTMLCanvasElement; backend: EnhanceBackend; ms: number; scale: EnhanceScale };

export const ENHANCE_SCALES: EnhanceScale[] = [2, 4];

export function canEnhance(width: number, height: number, scale: EnhanceScale = 2) {
  return width * height * scale * scale <= MAX_ENHANCED_PIXELS;
}

// The WebGPU build's .wasm is ~26.8 MB, over Cloudflare Workers' 25 MiB
// per-file limit for static assets, so it isn't deployed with the site. It's
// served from R2 instead (upload node_modules/onnxruntime-web/dist/
// ort-wasm-simd-threaded.asyncify.wasm there and set this to its public URL
// at build time). Without it, the fast WebGPU path is skipped and the slower
// CPU (WebAssembly) path is used — same result, just slower.
const ASYNCIFY_WASM_URL = process.env.NEXT_PUBLIC_ORT_ASYNCIFY_WASM_URL;

export async function webGpuAvailable(): Promise<boolean> {
  if (!ASYNCIFY_WASM_URL) return false;
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function loadOrt(backend: EnhanceBackend): Promise<Ort> {
  // Loaded by URL at runtime (not bundled): the runtime is large, and it finds
  // its own .wasm files next to itself.
  const url = ORT_BASE + (backend === "webgpu" ? "ort.webgpu.min.mjs" : "ort.wasm.min.mjs");
  const ort = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)) as Ort;
  ort.env.wasm.wasmPaths =
    backend === "webgpu" && ASYNCIFY_WASM_URL
      ? {
          mjs: new URL(ORT_BASE + "ort-wasm-simd-threaded.asyncify.mjs", window.location.origin).href,
          wasm: ASYNCIFY_WASM_URL,
        }
      : ORT_BASE;
  return ort;
}

async function createSession(backend: EnhanceBackend): Promise<{ ort: Ort; session: Session }> {
  const ort = await loadOrt(backend);
  const [model, weights] = await Promise.all([
    fetch(MODEL_BASE + MODEL_FILE).then((r) => r.arrayBuffer()),
    fetch(MODEL_BASE + WEIGHTS_FILE).then((r) => r.arrayBuffer()),
  ]);
  const session = await ort.InferenceSession.create(new Uint8Array(model), {
    executionProviders: [backend],
    externalData: [{ path: WEIGHTS_FILE, data: new Uint8Array(weights) }],
  });
  return { ort, session };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Separable box blur, three passes (close to a Gaussian). Edges repeat. */
function blur(src: Float32Array, size: number, radius: number) {
  const a = new Float32Array(src);
  const b = new Float32Array(src.length);
  const span = 2 * radius + 1;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < size; y++) {
      let acc = 0;
      for (let x = -radius; x <= radius; x++) acc += a[y * size + clamp(x, 0, size - 1)];
      for (let x = 0; x < size; x++) {
        b[y * size + x] = acc / span;
        acc += a[y * size + Math.min(size - 1, x + radius + 1)] - a[y * size + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += b[clamp(y, 0, size - 1) * size + x];
      for (let y = 0; y < size; y++) {
        a[y * size + x] = acc / span;
        acc += b[Math.min(size - 1, y + radius + 1) * size + x] - b[Math.max(0, y - radius) * size + x];
      }
    }
  }
  return a;
}

/** How far, per source pixel and channel, the model's output has drifted from
 *  the original's broad colours: (original) - (4x4 average of the output),
 *  smoothed. Added back to the output (upsampled), it keeps the model's
 *  sharper edges but restores the original's flat-area brightness and
 *  trims the glow around dark text. Values are 0..1; one array per channel. */
function lowFrequencyCorrection(input: Float32Array, output: Float32Array) {
  const plane = TILE * TILE;
  const outPlane = OUT_TILE * OUT_TILE;
  const maps: Float32Array[] = [];
  for (let ch = 0; ch < 3; ch++) {
    const diff = new Float32Array(plane);
    for (let j = 0; j < TILE; j++) {
      for (let i = 0; i < TILE; i++) {
        let sum = 0;
        for (let dj = 0; dj < SCALE; dj++) {
          const row = ch * outPlane + (j * SCALE + dj) * OUT_TILE + i * SCALE;
          for (let di = 0; di < SCALE; di++) sum += output[row + di];
        }
        diff[j * TILE + i] = input[ch * plane + j * TILE + i] - sum / (SCALE * SCALE);
      }
    }
    maps.push(blur(diff, TILE, 2));
  }
  return maps;
}

/** Bilinear sample of a TILE x TILE map at an output-pixel position. */
function sampleMap(map: Float32Array, ox: number, oy: number) {
  const u = clamp((ox + 0.5) / SCALE - 0.5, 0, TILE - 1);
  const v = clamp((oy + 0.5) / SCALE - 0.5, 0, TILE - 1);
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = Math.min(TILE - 1, x0 + 1);
  const y1 = Math.min(TILE - 1, y0 + 1);
  const fx = u - x0;
  const fy = v - y0;
  return (
    map[y0 * TILE + x0] * (1 - fx) * (1 - fy) +
    map[y0 * TILE + x1] * fx * (1 - fy) +
    map[y1 * TILE + x0] * (1 - fx) * fy +
    map[y1 * TILE + x1] * fx * fy
  );
}

export async function enhanceBitmap(
  source: ImageBitmap | HTMLCanvasElement,
  options: { signal?: AbortSignal; onProgress?: (progress: EnhanceProgress) => void; scale?: EnhanceScale } = {},
): Promise<EnhanceResult> {
  const { signal, onProgress } = options;
  const scale: EnhanceScale = options.scale ?? 4;
  const width = source.width;
  const height = source.height;
  if (!canEnhance(width, height, scale)) {
    throw new Error("This image is too large to enhance — it already has plenty of pixels.");
  }
  const started = performance.now();
  const aborted = () => new DOMException("Enhancement cancelled", "AbortError");

  onProgress?.({ phase: "loading", done: 0, total: 0 });

  // Graphics card first; if it can't start, fall back to the processor.
  let backend: EnhanceBackend = (await webGpuAvailable()) ? "webgpu" : "wasm";
  let loaded: { ort: Ort; session: Session };
  try {
    loaded = await createSession(backend);
  } catch (error) {
    if (backend === "wasm") throw error;
    backend = "wasm";
    loaded = await createSession(backend);
  }
  const { ort, session } = loaded;
  if (signal?.aborted) {
    await session.release();
    throw aborted();
  }

  // Flatten onto white (a transparent PNG would otherwise go black) and read
  // the pixels once.
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("Your browser could not create a drawing surface.");
  sctx.fillStyle = "#ffffff";
  sctx.fillRect(0, 0, width, height);
  sctx.drawImage(source, 0, 0);
  const pixels = sctx.getImageData(0, 0, width, height).data;
  sourceCanvas.width = 0;
  sourceCanvas.height = 0;

  const out = document.createElement("canvas");
  out.width = width * scale;
  out.height = height * scale;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Your browser could not create a drawing surface.");
  octx.imageSmoothingQuality = "high";
  // For 2x, each enlarged tile goes through this canvas to be halved.
  const tileCanvas = scale === SCALE ? null : document.createElement("canvas");

  const columns = Math.ceil(width / CORE);
  const rows = Math.ceil(height / CORE);
  const total = columns * rows;
  const input = new Float32Array(3 * TILE * TILE);
  const plane = TILE * TILE;
  const outPlane = OUT_TILE * OUT_TILE;
  let done = 0;

  try {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        if (signal?.aborted) throw aborted();
        const cx = col * CORE;
        const cy = row * CORE;

        // Cut the tile (with its overlap), repeating the edge pixels past the
        // image border.
        for (let j = 0; j < TILE; j++) {
          const y = clamp(cy - PAD + j, 0, height - 1);
          for (let i = 0; i < TILE; i++) {
            const x = clamp(cx - PAD + i, 0, width - 1);
            const p = (y * width + x) * 4;
            const o = j * TILE + i;
            input[o] = pixels[p] / 255;
            input[plane + o] = pixels[p + 1] / 255;
            input[2 * plane + o] = pixels[p + 2] / 255;
          }
        }

        const result = await session.run({
          [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, TILE, TILE]),
        });
        const output = (await result[session.outputNames[0]].getData()) as Float32Array;
        const correction = lowFrequencyCorrection(input, output);

        // Keep the middle of the enlarged tile, drop the overlap.
        const coreW = Math.min(CORE, width - cx);
        const coreH = Math.min(CORE, height - cy);
        const w = coreW * SCALE;
        const h = coreH * SCALE;
        const image = new ImageData(w, h);
        for (let j = 0; j < h; j++) {
          const oy = PAD * SCALE + j;
          for (let i = 0; i < w; i++) {
            const ox = PAD * SCALE + i;
            const o = oy * OUT_TILE + ox;
            const q = (j * w + i) * 4;
            image.data[q] = clamp((output[o] + sampleMap(correction[0], ox, oy)) * 255, 0, 255);
            image.data[q + 1] = clamp(
              (output[outPlane + o] + sampleMap(correction[1], ox, oy)) * 255,
              0,
              255,
            );
            image.data[q + 2] = clamp(
              (output[2 * outPlane + o] + sampleMap(correction[2], ox, oy)) * 255,
              0,
              255,
            );
            image.data[q + 3] = 255;
          }
        }
        if (tileCanvas) {
          tileCanvas.width = w;
          tileCanvas.height = h;
          tileCanvas.getContext("2d")?.putImageData(image, 0, 0);
          octx.drawImage(tileCanvas, cx * scale, cy * scale, (w * scale) / SCALE, (h * scale) / SCALE);
        } else {
          octx.putImageData(image, cx * SCALE, cy * SCALE);
        }

        done += 1;
        onProgress?.({ phase: "enhancing", done, total });
        // Let the page repaint (progress bar, Cancel button) between tiles.
        if (done % 2 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  } catch (error) {
    out.width = 0;
    out.height = 0;
    throw error;
  } finally {
    if (tileCanvas) tileCanvas.width = 0;
    await session.release();
  }

  return { canvas: out, backend, ms: Math.round(performance.now() - started), scale };
}
