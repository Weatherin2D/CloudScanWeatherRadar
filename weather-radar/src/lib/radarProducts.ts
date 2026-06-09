import type { ColorStop } from "./palPalette";
import { DEFAULT_PAL_STOPS } from "./palPalette";

export type ProductFamily =
  | "reflectivity"
  | "velocity"
  | "correlation"
  | "zdr"
  | "kdp"
  | "hca"
  | "echotops"
  | "longrange";

export type RadarDataSource = "iem" | "level3" | "opera";

export interface RadarProduct {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  family: ProductFamily;
  /** Where per-station tiles/frames are loaded from. */
  sources: Partial<Record<"us" | "eu", RadarDataSource>>;
  /** Level-III / OPERA product code used when fetching frames. */
  fetchCode?: string;
  defaultStops: ColorStop[];
  legendMin?: string;
  legendMax?: string;
}

/** NWS-style correlation coefficient ramp (0–1). */
export const DEFAULT_CC_STOPS: ColorStop[] = [
  { dbz: 0.2, color: "#1a1a2e", alpha: 0, solid: true },
  { dbz: 0.5, color: "#4a4a6a", alpha: 200, solid: false },
  { dbz: 0.7, color: "#7a7a9a", alpha: 255, solid: false },
  { dbz: 0.85, color: "#00bcd4", alpha: 255, solid: false },
  { dbz: 0.9, color: "#00e676", alpha: 255, solid: false },
  { dbz: 0.95, color: "#ffeb3b", alpha: 255, solid: false },
  { dbz: 0.98, color: "#ff9800", alpha: 255, solid: false },
  { dbz: 1.0, color: "#f44336", alpha: 255, solid: false },
];

const VELOCITY_STOPS: ColorStop[] = [
  { dbz: -30, color: "#0000ff", alpha: 255, solid: false },
  { dbz: -20, color: "#0088ff", alpha: 255, solid: false },
  { dbz: -10, color: "#00ccff", alpha: 255, solid: false },
  { dbz: 0, color: "#ffffff", alpha: 255, solid: false },
  { dbz: 10, color: "#ffff00", alpha: 255, solid: false },
  { dbz: 20, color: "#ff8800", alpha: 255, solid: false },
  { dbz: 30, color: "#ff0000", alpha: 255, solid: false },
];

const ZDR_STOPS: ColorStop[] = [
  { dbz: -2, color: "#333333", alpha: 0, solid: true },
  { dbz: 0, color: "#888888", alpha: 255, solid: false },
  { dbz: 1, color: "#00aaff", alpha: 255, solid: false },
  { dbz: 2, color: "#00ff88", alpha: 255, solid: false },
  { dbz: 3, color: "#ffff00", alpha: 255, solid: false },
  { dbz: 4, color: "#ff8800", alpha: 255, solid: false },
  { dbz: 6, color: "#ff00ff", alpha: 255, solid: false },
];

const KDP_STOPS: ColorStop[] = [
  { dbz: -1, color: "#333333", alpha: 0, solid: true },
  { dbz: 0, color: "#aaaaaa", alpha: 255, solid: false },
  { dbz: 1, color: "#00cccc", alpha: 255, solid: false },
  { dbz: 2, color: "#00ff00", alpha: 255, solid: false },
  { dbz: 4, color: "#ffff00", alpha: 255, solid: false },
  { dbz: 6, color: "#ff8800", alpha: 255, solid: false },
  { dbz: 10, color: "#ff0000", alpha: 255, solid: false },
];

const ECHOTOPS_STOPS: ColorStop[] = [
  { dbz: 0, color: "#000000", alpha: 0, solid: true },
  { dbz: 5, color: "#004488", alpha: 255, solid: false },
  { dbz: 15, color: "#00aa44", alpha: 255, solid: false },
  { dbz: 25, color: "#ffff00", alpha: 255, solid: false },
  { dbz: 35, color: "#ff6600", alpha: 255, solid: false },
  { dbz: 50, color: "#ff00ff", alpha: 255, solid: false },
];

export const RADAR_PRODUCTS: RadarProduct[] = [
  {
    id: "N0Q",
    label: "Reflectivity",
    shortLabel: "REFL",
    description: "Base reflectivity (dBZ)",
    color: "#60a5fa",
    family: "reflectivity",
    sources: { us: "iem", eu: "opera" },
    fetchCode: "DBZH",
    defaultStops: DEFAULT_PAL_STOPS,
    legendMin: "Light",
    legendMax: "Heavy",
  },
  {
    id: "N0U",
    label: "Velocity",
    shortLabel: "VEL",
    description: "Radial velocity (knots)",
    color: "#a78bfa",
    family: "velocity",
    sources: { us: "iem", eu: "opera" },
    fetchCode: "VRADH",
    defaultStops: VELOCITY_STOPS,
    legendMin: "Toward",
    legendMax: "Away",
  },
  {
    id: "N0C",
    label: "Corr. Coeff.",
    shortLabel: "CC",
    description: "Correlation coefficient (0–1)",
    color: "#34d399",
    family: "correlation",
    sources: { us: "level3" },
    fetchCode: "N0C",
    defaultStops: DEFAULT_CC_STOPS,
    legendMin: "0.2",
    legendMax: "1.0",
  },
  {
    id: "N0X",
    label: "Diff. Reflec.",
    shortLabel: "ZDR",
    description: "Differential reflectivity (dB)",
    color: "#fb923c",
    family: "zdr",
    sources: { us: "level3" },
    fetchCode: "N0X",
    defaultStops: ZDR_STOPS,
    legendMin: "−2",
    legendMax: "6",
  },
  {
    id: "N0K",
    label: "Spec. Diff. Phase",
    shortLabel: "KDP",
    description: "Specific differential phase (°/km)",
    color: "#fbbf24",
    family: "kdp",
    sources: { us: "level3" },
    fetchCode: "N0K",
    defaultStops: KDP_STOPS,
    legendMin: "0",
    legendMax: "10",
  },
  {
    id: "N0H",
    label: "Hydrometeor",
    shortLabel: "HCA",
    description: "Hydrometeor classification",
    color: "#f87171",
    family: "hca",
    sources: { us: "level3" },
    fetchCode: "N0H",
    defaultStops: DEFAULT_PAL_STOPS,
  },
  {
    id: "N0Z",
    label: "Long Range",
    shortLabel: "LR",
    description: "248 nm base reflectivity",
    color: "#38bdf8",
    family: "longrange",
    sources: { us: "iem" },
    defaultStops: DEFAULT_PAL_STOPS,
    legendMin: "Light",
    legendMax: "Heavy",
  },
  {
    id: "NET",
    label: "Echo Tops",
    shortLabel: "ET",
    description: "Echo tops (kft)",
    color: "#c084fc",
    family: "echotops",
    sources: { us: "iem" },
    defaultStops: ECHOTOPS_STOPS,
    legendMin: "Low",
    legendMax: "High",
  },
];

/** Products shown in per-station UI (US + EU). */
export const STATION_RADAR_PRODUCTS = RADAR_PRODUCTS.filter((p) =>
  ["N0Q", "N0U", "N0C", "N0X", "N0K", "N0H", "N0Z", "NET"].includes(p.id),
);

/** EU OPERA products available via MeteoGate. */
export const EU_STATION_PRODUCTS = STATION_RADAR_PRODUCTS.filter(
  (p) => p.sources.eu === "opera",
);

export function getRadarProduct(id: string): RadarProduct | undefined {
  if (!id) return undefined;
  return RADAR_PRODUCTS.find((p) => p.id === id.toUpperCase() || p.id === id);
}

export function productSourceForCountry(
  productId: string,
  country: "us" | "eu" | "uk" | "au",
): RadarDataSource | null {
  const product = getRadarProduct(productId);
  if (!product) return null;
  if (country === "us") return product.sources.us ?? null;
  if (country === "eu") return product.sources.eu ?? null;
  return null;
}

export function isReflectivityFamily(family: ProductFamily): boolean {
  return family === "reflectivity" || family === "longrange";
}

export function usesCustomReflectivityPalette(product: RadarProduct): boolean {
  return isReflectivityFamily(product.family);
}
