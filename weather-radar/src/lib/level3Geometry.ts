import type { Level3RadialLayer } from "./level3Parse";

const DEG = Math.PI / 180;

/** Hard ceiling for any Level-III product (km). */
export const MAX_NEXRAD_RANGE_KM = 500;

/**
 * ICD / MetPy-style gate resolution (km) by Level-III product code.
 * Packet rangeScale is a multiplier on this value (typically ~1000 → /1000 ≈ 1).
 */
const PRODUCT_GATE_RESOLUTION_KM: Record<number, number> = {
  // Super-res / digital base reflectivity & velocity
  94: 1.0, // N0Q legacy 1 km
  99: 0.25, // N0U
  134: 1.0, // digital VIL etc.
  135: 1.0,
  153: 0.25, // N0B super-res reflectivity
  154: 0.25, // N0G super-res velocity
  155: 0.25,
  159: 0.25, // N0X ZDR
  161: 0.25, // N0C CC
  163: 0.25, // N0K KDP
  165: 0.25, // N0H HCA
  166: 0.25,
  172: 0.25,
  173: 0.25,
  174: 0.25,
  175: 0.25,
};

/** Product-aware max display range (km). */
const PRODUCT_MAX_RANGE_KM: Record<number, number> = {
  94: 460,
  99: 300,
  153: 460,
  154: 300,
  155: 300,
  159: 300,
  161: 300,
  163: 300,
  165: 300,
};

export function productGateResolutionKm(productCode: number | undefined): number {
  if (productCode == null) return 0.25;
  return PRODUCT_GATE_RESOLUTION_KM[productCode] ?? 0.25;
}

export function productMaxRangeKm(productCode: number | undefined): number {
  if (productCode == null) return MAX_NEXRAD_RANGE_KM;
  return PRODUCT_MAX_RANGE_KM[productCode] ?? MAX_NEXRAD_RANGE_KM;
}

/**
 * Convert packet rangeScale (already /1000 by nexrad-browser) into km/gate
 * using the product's ICD gate resolution.
 */
export function applyProductRangeScale(
  layer: Level3RadialLayer,
  productCode: number | undefined,
): void {
  const packet = layer.rangeScale;
  if (!Number.isFinite(packet) || packet <= 0) {
    layer.rangeScale = productGateResolutionKm(productCode);
    return;
  }
  // Raw meters slipped through (e.g. 250 or 1000)
  const normalized = packet > 1 ? packet / 1000 : packet;
  layer.rangeScale = normalized * productGateResolutionKm(productCode);
}

/** Range gate spacing in km (after applyProductRangeScale, typically 0.25 or 1.0). */
export function level3RangeScaleKm(layer: Level3RadialLayer): number {
  const scale = layer.rangeScale;
  if (!Number.isFinite(scale) || scale <= 0) return 0.25;
  // Guard uncorrected raw meters
  if (scale > 1) return scale / 1000;
  return scale;
}

/** Authoritative bin count from the product header (ignore RLE overflow). */
export function level3BinCount(layer: Level3RadialLayer): number {
  if (layer.numberBins > 0) return layer.numberBins;
  let max = 0;
  for (const radial of layer.radials) {
    max = Math.max(max, radial.bins.length);
  }
  return max;
}

export function level3MaxRangeKm(layer: Level3RadialLayer): number {
  const bins = level3BinCount(layer);
  const scale = level3RangeScaleKm(layer);
  const fromBins = (layer.firstBin + bins) * scale;
  const productCap = productMaxRangeKm(layer.productCode);
  return Math.min(MAX_NEXRAD_RANGE_KM, productCap, fromBins);
}

/** Inner/outer slant range (km) for a range bin index. */
export function level3BinRangeKm(
  layer: Level3RadialLayer,
  binIndex: number,
): [number, number] {
  const scale = level3RangeScaleKm(layer);
  const b = Math.max(0, Math.min(binIndex, level3BinCount(layer) - 1));
  const r0 = (layer.firstBin + b) * scale;
  const r1 = (layer.firstBin + b + 1) * scale;
  return [r0, r1];
}

export function destination(
  lat: number,
  lon: number,
  bearingDeg: number,
  distKm: number,
): { lat: number; lon: number } {
  const br = bearingDeg * DEG;
  const lat1 = lat * DEG;
  const lon1 = lon * DEG;
  const d = distKm / 6371;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: lat2 / DEG, lon: lon2 / DEG };
}

/** Geographic bounding box for the full radar sweep (not just data extent). */
export function level3CoverageBounds(
  layer: Level3RadialLayer,
  siteLat: number,
  siteLon: number,
): [[number, number], [number, number]] {
  const maxRange = level3MaxRangeKm(layer);
  let minLat = siteLat;
  let maxLat = siteLat;
  let minLon = siteLon;
  let maxLon = siteLon;

  for (let az = 0; az < 360; az += 3) {
    const p = destination(siteLat, siteLon, az, maxRange);
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }

  const pad = 0.02;
  return [
    [minLat - pad, minLon - pad],
    [maxLat + pad, maxLon + pad],
  ];
}

export function radialAzimuthSpan(
  radial: Level3RadialLayer["radials"][0],
  radialIndex: number,
  layer: Level3RadialLayer,
): [number, number] {
  const next = layer.radials[(radialIndex + 1) % layer.radials.length];
  const fallback = layer.radials.length > 0 ? 360 / layer.radials.length : 1;
  let delta = radial.angleDelta > 0
    ? radial.angleDelta
    : next
      ? ((next.startAngle - radial.startAngle + 360) % 360) || fallback
      : fallback;
  if (delta <= 0 || delta > 10) delta = fallback;
  const half = delta / 2;
  return [radial.startAngle - half, radial.startAngle + half];
}
