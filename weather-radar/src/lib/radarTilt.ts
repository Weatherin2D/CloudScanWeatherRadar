import {
  getRadarProduct,
  productSourceForCountry,
  type RadarDataSource,
  type RadarProduct,
} from "./radarProducts";
import { isIemProductSupported } from "./iemRadar";

export interface RadarTilt {
  index: number;
  label: string;
  description: string;
}

/** Approximate NEXRAD Level-III tilt angles (varies slightly by VCP). */
export const NEXRAD_TILTS: RadarTilt[] = [
  { index: 0, label: "0.5°", description: "Lowest tilt" },
  { index: 1, label: "1.5°", description: "Second tilt" },
  { index: 2, label: "2.4°", description: "Third tilt" },
  { index: 3, label: "3.4°", description: "Fourth tilt" },
];

/** Common OPERA ODIM elevation angles (degrees). */
export const OPERA_TILTS: RadarTilt[] = [
  { index: 0, label: "0.5°", description: "Lowest tilt" },
  { index: 1, label: "1.0°", description: "Second tilt" },
  { index: 2, label: "1.5°", description: "Third tilt" },
  { index: 3, label: "2.5°", description: "Fourth tilt" },
];

const LEVEL3_BASE_CODES: Record<string, string> = {
  N0Q: "N0B",
  N0U: "N0G",
  N0C: "N0C",
  N0X: "N0X",
  N0K: "N0K",
  N0H: "N0H",
};

const OPERA_TILT_ELEVATIONS_DEG = [0.5, 1.0, 1.5, 2.5];

export function tiltsForCountry(country: "us" | "eu" | "uk" | "au"): RadarTilt[] {
  if (country === "us") return NEXRAD_TILTS;
  if (country === "eu") return OPERA_TILTS;
  return [];
}

export function productSupportsTilt(product: RadarProduct): boolean {
  return !["longrange", "echotops"].includes(product.family);
}

export function level3FetchCode(productId: string, tiltIndex: number): string {
  const id = productId.toUpperCase();
  const base = LEVEL3_BASE_CODES[id] ?? id;
  if (base.length !== 3 || base[0] !== "N") return base;
  const tilt = Math.min(3, Math.max(0, tiltIndex));
  return `N${tilt}${base[2]}`;
}

export function operaElevationForTilt(tiltIndex: number): number {
  const idx = Math.min(Math.max(0, tiltIndex), OPERA_TILT_ELEVATIONS_DEG.length - 1);
  return OPERA_TILT_ELEVATIONS_DEG[idx];
}

/** Pick the data pipeline for a station product at a given tilt. */
export function resolveStationDataSource(
  productId: string,
  country: "us" | "eu" | "uk" | "au",
  tiltIndex: number,
): RadarDataSource | null {
  const product = getRadarProduct(productId);
  if (!product) return null;

  const baseSource = productSourceForCountry(productId, country);
  if (!baseSource) return null;

  if (country === "eu") return "opera";
  if (country !== "us") return null;

  if (!productSupportsTilt(product)) return baseSource;

  // Use IEM tiles for lowest tilt (instant loading, georeferenced)
  // Use Level 3 for higher tilts (allows tilt selection)
  if (tiltIndex === 0 && baseSource === "iem" && isIemProductSupported(productId)) {
    return "iem";
  }

  if (baseSource === "level3" || tiltIndex > 0) return "level3";

  return baseSource;
}

export function shouldUseLevel3Frames(
  country: string | undefined,
  productId: string,
  tiltIndex: number,
): boolean {
  if (!country || country !== "us") return false;
  return resolveStationDataSource(productId, "us", tiltIndex) === "level3";
}

export function shouldUseIemFrames(
  country: string | undefined,
  productId: string,
  tiltIndex: number,
): boolean {
  if (!country || country !== "us") return false;
  return resolveStationDataSource(productId, "us", tiltIndex) === "iem";
}

/** Cross-section always needs multi-tilt volume data, not single-tilt tiles. */
export function resolveCrossSectionDataSource(
  productId: string,
  country: "us" | "eu" | "uk" | "au",
): RadarDataSource | null {
  const product = getRadarProduct(productId);
  if (!product) return null;

  if (country === "eu") return "opera";
  if (country !== "us") return null;

  const baseSource = productSourceForCountry(productId, country);
  if (!baseSource) return null;
  if (!productSupportsTilt(product)) return baseSource === "level3" ? "level3" : null;

  return "level3";
}
