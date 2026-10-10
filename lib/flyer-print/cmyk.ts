// Browser-only: converts the finished artwork from sRGB to CMYK for printing,
// with a real ICC profile (FOGRA39 "ISO Coated v2", the usual European offset
// condition for coated paper) and Little CMS — not the crude "1 - RGB" formula,
// which gives dull, wrong colours. Nothing is uploaded; the profile is fetched
// from this site (staff only, see app/admin/tools/flyer-print/fogra39/route.ts).

const LCMS_BASE = "/lcms/";
const PROFILE_URL = "/admin/tools/flyer-print/fogra39";

/** What the output intent in the PDF says the CMYK numbers mean. */
export const CMYK_CONDITION = {
  identifier: "FOGRA39",
  name: "ISO Coated v2 (ECI)",
  description: "Offset printing on gloss and matt coated paper (FOGRA39L, ISO 12647-2:2004)",
};

// The slice of lcms-wasm's API this file uses.
type Lcms = {
  cmsOpenProfileFromMem(bytes: Uint8Array, length: number): number;
  cmsCreate_sRGBProfile(): number;
  cmsCreateTransform(input: number, inputFormat: number, output: number, outputFormat: number, intent: number, flags: number): number;
  cmsDoTransform(transform: number, input: Uint8Array, pixels: number): Uint8Array;
  cmsGetColorSpaceASCII(profile: number): string | null;
};
type LcmsModule = {
  instantiate(options: { locateFile: (name: string) => string }): Promise<Lcms>;
  TYPE_RGB_8: number;
  TYPE_CMYK_8: number;
  INTENT_RELATIVE_COLORIMETRIC: number;
  cmsFLAGS_BLACKPOINTCOMPENSATION: number;
};

export type CmykEngine = {
  /** The profile file itself, to embed in the PDF as its output intent. */
  profile: Uint8Array;
  /** `rgb` holds 3 bytes per pixel; the result 4 bytes per pixel (C, M, Y, K). */
  convert(rgb: Uint8Array, pixels: number): Uint8Array;
};

let loading: Promise<CmykEngine> | null = null;

/** Loads the colour engine and profile once; later conversions reuse them. */
export function loadCmykEngine(): Promise<CmykEngine> {
  loading ??= (async () => {
    const [mod, profileResponse] = await Promise.all([
      import(/* webpackIgnore: true */ /* turbopackIgnore: true */ LCMS_BASE + "lcms.min.js") as Promise<LcmsModule>,
      fetch(PROFILE_URL),
    ]);
    const profile = new Uint8Array(await profileResponse.arrayBuffer());
    // "acsp" at byte 36 is every ICC profile's signature; anything else is a
    // sign-in page or error message that came back instead.
    const signature = String.fromCharCode(...profile.subarray(36, 40));
    if (!profileResponse.ok || signature !== "acsp") {
      throw new Error("The CMYK colour profile could not be loaded. Sign in again and retry.");
    }

    const lcms = await mod.instantiate({ locateFile: (name) => LCMS_BASE + name });
    const cmyk = lcms.cmsOpenProfileFromMem(profile, profile.length);
    const srgb = lcms.cmsCreate_sRGBProfile();
    if (!cmyk || lcms.cmsGetColorSpaceASCII(cmyk) !== "CMYK") {
      throw new Error("The CMYK colour profile could not be read.");
    }
    // Relative colorimetric with black point compensation: paper white stays
    // "no ink", and the darkest screen black maps to the darkest printable
    // black — what print software does by default.
    const transform = lcms.cmsCreateTransform(
      srgb,
      mod.TYPE_RGB_8,
      cmyk,
      mod.TYPE_CMYK_8,
      mod.INTENT_RELATIVE_COLORIMETRIC,
      mod.cmsFLAGS_BLACKPOINTCOMPENSATION,
    );
    if (!transform) throw new Error("The CMYK conversion could not be set up.");

    return {
      profile,
      convert: (rgb, pixels) => lcms.cmsDoTransform(transform, rgb, pixels),
    };
  })();
  // A failed load must not be remembered, or the option would never work again.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/**
 * Converts a whole canvas to CMYK, a band of rows at a time so the page stays
 * responsive. Returns 4 bytes per pixel, rows from the top (0 = no ink).
 * Anything see-through is laid over white paper first.
 */
export async function canvasToCmyk(
  engine: CmykEngine,
  canvas: HTMLCanvasElement,
  onProgress?: (doneRows: number, totalRows: number) => void,
): Promise<Uint8Array> {
  const { width, height } = canvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser could not create a drawing surface.");

  const out = new Uint8Array(width * height * 4);
  const rowsPerBand = Math.max(1, Math.floor(600_000 / width));
  const rgb = new Uint8Array(rowsPerBand * width * 3);

  for (let y = 0; y < height; y += rowsPerBand) {
    const rows = Math.min(rowsPerBand, height - y);
    const pixels = rows * width;
    const rgba = ctx.getImageData(0, y, width, rows).data;
    for (let i = 0; i < pixels; i++) {
      const alpha = rgba[i * 4 + 3];
      if (alpha === 255) {
        rgb[i * 3] = rgba[i * 4];
        rgb[i * 3 + 1] = rgba[i * 4 + 1];
        rgb[i * 3 + 2] = rgba[i * 4 + 2];
      } else {
        const paper = 255 * (255 - alpha);
        rgb[i * 3] = Math.round((rgba[i * 4] * alpha + paper) / 255);
        rgb[i * 3 + 1] = Math.round((rgba[i * 4 + 1] * alpha + paper) / 255);
        rgb[i * 3 + 2] = Math.round((rgba[i * 4 + 2] * alpha + paper) / 255);
      }
    }
    out.set(engine.convert(rgb.subarray(0, pixels * 3), pixels), y * width * 4);
    onProgress?.(y + rows, height);
    // Let the page repaint between bands.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return out;
}
