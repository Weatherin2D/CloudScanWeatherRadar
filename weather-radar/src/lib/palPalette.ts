// ─── RadarScope / Gibson Ridge .pal palette format ───────────────────────────
// Product: BR | Units: DBZ
// Color: dBZ R G B          — gradient band to next stop
// SolidColor: dBZ R G B     — flat band to next stop
// Color4 / SolidColor4 add alpha (0–255)

export interface ColorStop {
  dbz: number;
  color: string;
  alpha: number;
  solid: boolean;
}

export interface PalFile {
  product: string;
  units: string;
  step: number;
  stops: ColorStop[];
}

export const PAL_DBZ_MIN = -10;
export const PAL_DBZ_MAX = 80;
export const PAL_DBZ_STEP = 5;

export interface ReflectivityFadeSettings {
  startDbz: number;
  endDbz: number;
}

export const DEFAULT_REFLECTIVITY_FADE: ReflectivityFadeSettings = {
  startDbz: 0,
  endDbz: 10,
};

export function normalizeReflectivityFade(
  startDbz: number,
  endDbz: number,
): ReflectivityFadeSettings {
  const start = startDbz;
  const end = Math.max(endDbz, start + 0.5);
  return { startDbz: start, endDbz: end };
}

/** Linear opacity ramp: 0 at startDbz → 1 at endDbz. */
export function reflectivityLowDbzFade(
  dbz: number,
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): number {
  const { startDbz, endDbz } = fade;
  if (dbz <= startDbz) return 0;
  if (dbz >= endDbz) return 1;
  return (dbz - startDbz) / (endDbz - startDbz);
}

/** Windy-style ramp expressed as RadarScope Color4 gradient stops. */
const WINDY_REFLECTIVITY: [number, [number, number, number, number]][] = [
  [4, [23, 0, 140, 255]],
  [8, [29, 0, 176, 255]],
  [10, [0, 10, 199, 255]],
  [20, [100, 194, 194, 255]],
  [24, [0, 131, 135, 255]],
  [26, [0, 89, 9, 255]],
  [32, [134, 179, 50, 255]],
  [36, [255, 255, 121, 255]],
  [40, [255, 134, 34, 255]],
  [44, [255, 56, 56, 255]],
  [50, [191, 30, 30, 255]],
  [55, [112, 24, 24, 255]],
  [60, [255, 0, 247, 255]],
  [70, [94, 89, 150, 255]],
  [75, [49, 49, 99, 255]],
  [80, [80, 212, 109, 255]],
  [100, [82, 232, 170, 255]],
  [101, [156, 56, 104, 255]],
];

export const DEFAULT_PAL_STOPS: ColorStop[] = WINDY_REFLECTIVITY.map(
  ([dbz, [r, g, b, a]]) => ({
    dbz,
    color: rgbToHex(r, g, b),
    alpha: a,
    solid: false,
  }),
);

// ── Colour helpers ─────────────────────────────────────────────────────────────
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").padEnd(6, "0");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function dbzToBarPercent(
  dbz: number,
  min = PAL_DBZ_MIN,
  max = PAL_DBZ_MAX,
): number {
  return Math.max(0, Math.min(100, ((dbz - min) / (max - min)) * 100));
}

export function barPercentToDbz(
  pct: number,
  min = PAL_DBZ_MIN,
  max = PAL_DBZ_MAX,
): number {
  return min + (pct / 100) * (max - min);
}

// ── RadarScope band lookup ─────────────────────────────────────────────────────

/** Cache sorted copies so hot paths never re-sort the same stops array. */
const sortedStopsCache = new WeakMap<ColorStop[], ColorStop[]>();

export function sortedColorStops(stops: ColorStop[]): ColorStop[] {
  if (!stops.length) return stops;
  let sorted = sortedStopsCache.get(stops);
  if (!sorted) {
    sorted = [...stops].sort((a, b) => a.dbz - b.dbz);
    sortedStopsCache.set(stops, sorted);
  }
  return sorted;
}

/** Lookup assuming `stops` are already sorted ascending by dBZ. */
export function colorAtDbzSorted(
  dbz: number,
  sorted: ColorStop[],
): [number, number, number, number] {
  if (!sorted.length) return [0, 0, 0, 0];

  if (dbz < sorted[0].dbz) return [0, 0, 0, 0];

  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (dbz >= lo.dbz && dbz < hi.dbz) {
      if (lo.solid) {
        const [r, g, b] = hexToRgb(lo.color);
        return [r, g, b, lo.alpha];
      }
      const span = hi.dbz - lo.dbz;
      const t = span === 0 ? 1 : (dbz - lo.dbz) / span;
      const [loR, loG, loB] = hexToRgb(lo.color);
      const [hiR, hiG, hiB] = hexToRgb(hi.color);
      return [
        Math.round(loR + t * (hiR - loR)),
        Math.round(loG + t * (hiG - loG)),
        Math.round(loB + t * (hiB - loB)),
        Math.round(lo.alpha + t * (hi.alpha - lo.alpha)),
      ];
    }
  }

  const last = sorted[sorted.length - 1];
  const [r, g, b] = hexToRgb(last.color);
  return [r, g, b, last.alpha];
}

export function colorAtDbz(dbz: number, stops: ColorStop[]): [number, number, number, number] {
  return colorAtDbzSorted(dbz, sortedColorStops(stops));
}

/** Reflectivity lookup with configurable low-dBZ opacity ramp. */
export function colorAtReflectivityDbzSorted(
  dbz: number,
  sorted: ColorStop[],
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): [number, number, number, number] {
  if (dbz < fade.startDbz) return [0, 0, 0, 0];

  const lookupDbz =
    sorted.length > 0 && dbz < sorted[0].dbz ? sorted[0].dbz : dbz;
  const [r, g, b, a] = colorAtDbzSorted(lookupDbz, sorted);
  const fadeMul = reflectivityLowDbzFade(dbz, fade);
  return [r, g, b, Math.round(a * fadeMul)];
}

export function colorAtReflectivityDbz(
  dbz: number,
  stops: ColorStop[],
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): [number, number, number, number] {
  return colorAtReflectivityDbzSorted(dbz, sortedColorStops(stops), fade);
}

/** Quantized dBZ → packed RGBA (little-endian ABGR as Uint32 for ImageData). */
export const DBZ_LUT_MIN = -32;
export const DBZ_LUT_MAX = 95;
export const DBZ_LUT_STEP = 0.5;
export const DBZ_LUT_SIZE =
  Math.round((DBZ_LUT_MAX - DBZ_LUT_MIN) / DBZ_LUT_STEP) + 1;

export function rgbaToUint32(r: number, g: number, b: number, a: number): number {
  return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
}

export function dbzToLutIndex(dbz: number): number {
  const idx = Math.round((dbz - DBZ_LUT_MIN) / DBZ_LUT_STEP);
  return Math.max(0, Math.min(DBZ_LUT_SIZE - 1, idx));
}

/** Precompute dBZ→Uint32 colors for polar gate rasterization. */
export function stopsToDbzUint32LUT(
  stops: ColorStop[],
  reflectivity = false,
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): Uint32Array {
  const sorted = sortedColorStops(stops);
  const lut = new Uint32Array(DBZ_LUT_SIZE);
  for (let i = 0; i < DBZ_LUT_SIZE; i++) {
    const dbz = DBZ_LUT_MIN + i * DBZ_LUT_STEP;
    const [r, g, b, a] = reflectivity
      ? colorAtReflectivityDbzSorted(dbz, sorted, fade)
      : colorAtDbzSorted(dbz, sorted);
    lut[i] = rgbaToUint32(r, g, b, a);
  }
  return lut;
}

/** Stable signature for palette + fade (frame cache keys). */
export function paletteCacheKey(
  stops: ColorStop[],
  reflectivity: boolean,
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): string {
  const sorted = sortedColorStops(stops);
  const stopPart = sorted
    .map((s) => `${s.dbz}:${s.color}:${s.alpha}:${s.solid ? 1 : 0}`)
    .join("|");
  return `${reflectivity ? 1 : 0}:${fade.startDbz}:${fade.endDbz}:${stopPart}`;
}

/** RainViewer scheme-0: dBZ encoded in red channel. */
export function rainViewerByteToDbz(rv: number): number {
  return (rv & 127) - 32;
}

export function stopsToRainViewerLUT(
  stops: ColorStop[],
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let rv = 0; rv < 256; rv++) {
    const dbz = rainViewerByteToDbz(rv);
    const [r, g, b, a] = colorAtReflectivityDbz(dbz, stops, fade);
    lut[rv * 4] = r;
    lut[rv * 4 + 1] = g;
    lut[rv * 4 + 2] = b;
    lut[rv * 4 + 3] = a;
  }
  return lut;
}

/** @deprecated Use stopsToIemIndexLUT for IEM ridge tiles. Luminance mapping is inaccurate. */
export function stopsToLuminanceLUT(
  stops: ColorStop[],
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  const lo = -32;
  const hi = 80;
  for (let lum = 0; lum < 256; lum++) {
    const dbz = lo + (lum / 255) * (hi - lo);
    const [r, g, b, a] = colorAtReflectivityDbz(dbz, stops, fade);
    lut[lum * 4] = r;
    lut[lum * 4 + 1] = g;
    lut[lum * 4 + 2] = b;
    lut[lum * 4 + 3] = a;
  }
  return lut;
}

export function stopsValueSpan(stops: ColorStop[]): { min: number; max: number } {
  if (!stops.length) return { min: PAL_DBZ_MIN, max: PAL_DBZ_MAX };
  const sorted = [...stops].sort((a, b) => a.dbz - b.dbz);
  return { min: sorted[0].dbz, max: sorted[sorted.length - 1].dbz };
}

export function stopsToCss(
  stops: ColorStop[],
  min = PAL_DBZ_MIN,
  max = PAL_DBZ_MAX,
): string {
  if (!stops.length) return "linear-gradient(to right,#001133,#0088ff,#ffff00,#ff0000)";
  const sorted = [...stops].sort((a, b) => a.dbz - b.dbz);
  const span = max - min;
  const parts = sorted.map((s) => {
    const [r, g, b] = hexToRgb(s.color);
    const pct = ((s.dbz - min) / span) * 100;
    return `rgba(${r},${g},${b},${(s.alpha / 255).toFixed(2)}) ${pct}%`;
  });
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

// ── .pal parse / serialize ─────────────────────────────────────────────────────
const COLOR_LINE =
  /^(SolidColor4|Color4|SolidColor|Color)\s*:\s*(-?\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?/i;

export function parsePal(text: string): PalFile {
  let product = "BR";
  let units = "DBZ";
  let step = PAL_DBZ_STEP;
  const stops: ColorStop[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/;.*$/, "").trim();
    if (!line) continue;

    const prod = line.match(/^Product\s*:\s*(\S+)/i);
    if (prod) {
      product = prod[1].toUpperCase();
      continue;
    }
    const unit = line.match(/^Units\s*:\s*(\S+)/i);
    if (unit) {
      units = unit[1].toUpperCase();
      continue;
    }
    const stepM = line.match(/^Step\s*:\s*(\d+(?:\.\d+)?)/i);
    if (stepM) {
      step = Number(stepM[1]);
      continue;
    }

    const m = line.match(COLOR_LINE);
    if (m) {
      const kind = m[1].toLowerCase();
      stops.push({
        dbz: Number(m[2]),
        color: rgbToHex(Number(m[3]), Number(m[4]), Number(m[5])),
        alpha: m[6] !== undefined ? Number(m[6]) : 255,
        solid: kind.startsWith("solidcolor"),
      });
    }
  }

  if (!stops.length) throw new Error("No Color/SolidColor entries found in .pal file");

  stops.sort((a, b) => a.dbz - b.dbz);
  return { product, units, step, stops };
}

export function serializePal(
  stops: ColorStop[],
  opts: { product?: string; units?: string; step?: number } = {},
): string {
  const product = opts.product ?? "BR";
  const units = opts.units ?? "DBZ";
  const step = opts.step ?? PAL_DBZ_STEP;
  const sorted = [...stops].sort((a, b) => a.dbz - b.dbz);

  const lines = [
    `Product: ${product}`,
    `Units: ${units}`,
    `Step: ${step}`,
    "",
    ...sorted.map((s) => {
      const [r, g, b] = hexToRgb(s.color);
      const kind = s.solid ? "SolidColor4" : "Color4";
      return `${kind}: ${Math.round(s.dbz)} ${r} ${g} ${b} ${Math.round(s.alpha)}`;
    }),
  ];
  return lines.join("\n");
}

/** Import legacy Windy JSON `[[dBZ,[R,G,B,A]],...]`. */
export function fromWindyJson(json: string): ColorStop[] {
  const parsed: [number, [number, number, number, number]][] = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("Expected JSON array");
  return parsed
    .filter(([dbz]) => dbz < 200)
    .map(([dbz, [r, g, b, a]]) => ({
      dbz,
      color: rgbToHex(r, g, b),
      alpha: a ?? 255,
      solid: false,
    }))
    .sort((a, b) => a.dbz - b.dbz);
}
