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
export function colorAtDbz(dbz: number, stops: ColorStop[]): [number, number, number, number] {
  if (!stops.length) return [0, 0, 0, 0];
  const sorted = [...stops].sort((a, b) => a.dbz - b.dbz);

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

/** Reflectivity lookup with configurable low-dBZ opacity ramp. */
export function colorAtReflectivityDbz(
  dbz: number,
  stops: ColorStop[],
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): [number, number, number, number] {
  if (dbz < fade.startDbz) return [0, 0, 0, 0];

  const sorted = [...stops].sort((a, b) => a.dbz - b.dbz);
  const lookupDbz =
    sorted.length > 0 && dbz < sorted[0].dbz ? sorted[0].dbz : dbz;
  const [r, g, b, a] = colorAtDbz(lookupDbz, stops);
  const fadeMul = reflectivityLowDbzFade(dbz, fade);
  return [r, g, b, Math.round(a * fadeMul)];
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
