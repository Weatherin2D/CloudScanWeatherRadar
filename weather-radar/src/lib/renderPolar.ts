import type { ColorStop } from "./palPalette";
import {
  colorAtDbz,
  colorAtReflectivityDbz,
  dbzToLutIndex,
  DEFAULT_REFLECTIVITY_FADE,
  stopsToDbzUint32LUT,
  type ReflectivityFadeSettings,
} from "./palPalette";
import type { Level3RadialLayer } from "./level3Parse";
import {
  level3BinCount,
  level3CoverageBounds,
  level3MaxRangeKm,
  level3RangeScaleKm,
  radialAzimuthSpan,
} from "./level3Geometry";
import {
  sampleLevel3RadialInterp,
  sampleOdimRadialInterp,
} from "./polarSample";

export interface PolarRenderResult {
  /** Blob URL or data URL for Leaflet ImageOverlay. */
  dataUrl: string;
  bounds: [[number, number], [number, number]];
  /** True when dataUrl is an object URL that should be revoked on eviction. */
  isObjectUrl?: boolean;
  /** Raster quality tier used for this image. */
  quality?: "preview" | "study";
}

export type GeographicPolarFrame = PolarRenderResult;

/** Fast first-paint geographic polar raster. */
export const POLAR_GATE_PREVIEW_SIZE = 1024;

/**
 * Study-quality geographic raster for ImageOverlay.
 * Pixel-sampled in lat/lon space (no wedge-fill gaps / streak artifacts).
 */
export const POLAR_GATE_STUDY_SIZE = 3072;

/** @deprecated Prefer PREVIEW / STUDY sizes. */
export const POLAR_GATE_MAX_SIZE = POLAR_GATE_STUDY_SIZE;

export interface OdimScanMeta {
  lat: number;
  lon: number;
  elangle: number;
  nbins: number;
  nrays: number;
  rstart: number;
  rscale: number;
  a1gate: number;
  values: Float32Array | Int16Array | Uint8Array | Uint16Array;
  nodata: number;
  undetect: number;
  gain: number;
  offset: number;
}

const DEG = Math.PI / 180;

function destination(lat: number, lon: number, bearingDeg: number, distKm: number) {
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

function level3GateBounds(
  layer: Level3RadialLayer,
  lat: number,
  lon: number,
): [[number, number], [number, number]] {
  let minLat = lat;
  let maxLat = lat;
  let minLon = lon;
  let maxLon = lon;

  for (const radial of layer.radials) {
    for (let b = 0; b < radial.bins.length; b++) {
      if (radial.bins[b] == null) continue;
      const rangeKm = (layer.firstBin + b) * layer.rangeScale;
      const pos = destination(lat, lon, radial.startAngle, rangeKm);
      minLat = Math.min(minLat, pos.lat);
      maxLat = Math.max(maxLat, pos.lat);
      minLon = Math.min(minLon, pos.lon);
      maxLon = Math.max(maxLon, pos.lon);
    }
  }

  const pad = 0.08;
  return [
    [minLat - pad, minLon - pad],
    [maxLat + pad, maxLon + pad],
  ];
}

/** Full-sweep coverage box (not data extent) — stable overlay bounds. */
function odimCoverageBounds(scan: OdimScanMeta): [[number, number], [number, number]] {
  const { lat, lon, nbins, rstart, rscale } = scan;
  const maxRangeKm = Math.max(1, (rstart + nbins * rscale) / 1000);
  let minLat = lat;
  let maxLat = lat;
  let minLon = lon;
  let maxLon = lon;

  for (let az = 0; az < 360; az += 3) {
    const p = destination(lat, lon, az, maxRangeKm);
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

/** Legacy data-extent bounds (geographic renderers). */
function odimGateBounds(scan: OdimScanMeta): [[number, number], [number, number]] {
  return odimCoverageBounds(scan);
}

async function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<{
  dataUrl: string;
  isObjectUrl: boolean;
}> {
  // Lossless PNG — WebP lossy introduced streak artifacts on sparse radar alpha.
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png");
  });
  if (!blob) {
    return { dataUrl: canvas.toDataURL("image/png"), isObjectUrl: false };
  }
  return { dataUrl: URL.createObjectURL(blob), isObjectUrl: true };
}

export function revokePolarUrl(result: PolarRenderResult | null | undefined): void {
  if (result?.isObjectUrl && result.dataUrl.startsWith("blob:")) {
    URL.revokeObjectURL(result.dataUrl);
  }
}

function geographicCanvasSize(
  lat: number,
  latSpan: number,
  lonSpan: number,
  maxSize: number,
): { width: number; height: number } {
  const cosLat = Math.max(0.2, Math.cos(lat * DEG));
  const width = maxSize;
  const height = Math.max(256, Math.round((width * latSpan) / (lonSpan * cosLat)));
  return { width, height };
}

/** 0.05° azimuth buckets → radial/ray index. Gap-free coverage by construction. */
const AZ_LUT_RES = 0.05;
const AZ_LUT_LEN = Math.round(360 / AZ_LUT_RES);

function fillAzimuthLutSpan(lut: Int32Array, az0: number, az1: number, index: number): void {
  let a0 = ((az0 % 360) + 360) % 360;
  let a1 = ((az1 % 360) + 360) % 360;
  let span = a1 - a0;
  if (span <= 0) span += 360;
  if (span > 20) span = 20; // guard corrupt deltas
  const steps = Math.max(1, Math.ceil(span / AZ_LUT_RES) + 1);
  for (let s = 0; s <= steps; s++) {
    const az = (a0 + (span * s) / steps) % 360;
    const bucket = Math.min(AZ_LUT_LEN - 1, Math.floor(az / AZ_LUT_RES));
    lut[bucket] = index;
  }
}

function buildLevel3AzimuthLut(layer: Level3RadialLayer): Int32Array {
  const lut = new Int32Array(AZ_LUT_LEN).fill(-1);
  for (let ri = 0; ri < layer.radials.length; ri++) {
    const radial = layer.radials[ri]!;
    const [az0, az1] = radialAzimuthSpan(radial, ri, layer);
    fillAzimuthLutSpan(lut, az0, az1, ri);
  }
  // Fill any leftover buckets from nearest written neighbor (wrap-aware).
  let last = -1;
  for (let i = 0; i < AZ_LUT_LEN * 2; i++) {
    const idx = i % AZ_LUT_LEN;
    if (lut[idx]! >= 0) last = lut[idx]!;
    else if (last >= 0) lut[idx] = last;
  }
  return lut;
}

/**
 * Paint Level-III by sampling every geographic pixel → polar gate.
 * Avoids Canvas2D wedge-fill hairlines that become long streaks when zoomed.
 */
export async function renderLevel3PolarGates(
  layer: Level3RadialLayer,
  lat: number,
  lon: number,
  stops: ColorStop[],
  maxSize = POLAR_GATE_STUDY_SIZE,
  reflectivity = false,
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): Promise<PolarRenderResult> {
  const colorLut = stopsToDbzUint32LUT(stops, reflectivity, fade);
  const bounds = level3CoverageBounds(layer, lat, lon);
  const maxRangeKm = level3MaxRangeKm(layer);
  if (maxRangeKm <= 0) return { dataUrl: "", bounds };

  const south = bounds[0][0];
  const west = bounds[0][1];
  const north = bounds[1][0];
  const east = bounds[1][1];
  const latSpan = Math.max(0.01, north - south);
  const lonSpan = Math.max(0.01, east - west);
  const { width, height } = geographicCanvasSize(lat, latSpan, lonSpan, maxSize);
  const quality: "preview" | "study" =
    Math.max(width, height) >= POLAR_GATE_STUDY_SIZE * 0.75 ? "study" : "preview";

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl: "", bounds };

  const imageData = ctx.createImageData(width, height);
  const buf = new Uint32Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    width * height,
  );

  const azLut = buildLevel3AzimuthLut(layer);
  const scale = level3RangeScaleKm(layer);
  const binLimit = level3BinCount(layer);
  const firstBin = layer.firstBin ?? 0;
  const invLat = 1 / Math.max(1, height - 1);
  const invLon = 1 / Math.max(1, width - 1);
  // Equirectangular km offsets matching ImageOverlay's linear lat/lon stretch.
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.max(0.2, Math.cos(lat * DEG));
  const yieldEvery = quality === "study" ? 48 : 96;

  for (let py = 0; py < height; py++) {
    if (py > 0 && py % yieldEvery === 0) await Promise.resolve();
    const gateLat = north - py * invLat * latSpan;
    const dLatKm = (gateLat - lat) * kmPerDegLat;
    const row = py * width;

    for (let px = 0; px < width; px++) {
      const gateLon = west + px * invLon * lonSpan;
      const dLonKm = (gateLon - lon) * kmPerDegLon;
      const rangeKm = Math.hypot(dLatKm, dLonKm);
      if (rangeKm > maxRangeKm || rangeKm < 0.01) continue;

      // Meteorological azimuth: 0 = north, clockwise
      const az = ((Math.atan2(dLonKm, dLatKm) * 180) / Math.PI + 360) % 360;
      const ri = azLut[Math.min(AZ_LUT_LEN - 1, (az / AZ_LUT_RES) | 0)]!;
      if (ri < 0) continue;

      const radial = layer.radials[ri];
      if (!radial) continue;

      // Gate intervals are [b, b+1); floor avoids outer-ring holes from round().
      const bin = Math.floor(rangeKm / scale - firstBin);
      if (bin < 0 || bin >= binLimit) continue;
      const val = radial.bins[bin];
      if (val == null) continue;

      const color = colorLut[dbzToLutIndex(val)]!;
      if ((color >>> 24) === 0) continue;
      buf[row + px] = color;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const encoded = await canvasToObjectUrl(canvas);
  return {
    dataUrl: encoded.dataUrl,
    bounds,
    isObjectUrl: encoded.isObjectUrl,
    quality,
  };
}

/** Render ODIM SCAN via geographic pixel→polar sampling (gap-free). */
export async function renderOdimPolarGates(
  scan: OdimScanMeta,
  stops: ColorStop[],
  maxSize = POLAR_GATE_STUDY_SIZE,
  reflectivity = true,
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): Promise<PolarRenderResult> {
  const colorLut = stopsToDbzUint32LUT(stops, reflectivity, fade);
  const bounds = odimCoverageBounds(scan);
  const { lat, lon, nbins, nrays, rstart, rscale, a1gate, values, nodata, undetect, gain, offset } =
    scan;
  const maxRangeKm = Math.max(1, (rstart + nbins * rscale) / 1000);
  if (nrays <= 0 || nbins <= 0) return { dataUrl: "", bounds };

  const south = bounds[0][0];
  const west = bounds[0][1];
  const north = bounds[1][0];
  const east = bounds[1][1];
  const latSpan = Math.max(0.01, north - south);
  const lonSpan = Math.max(0.01, east - west);
  const { width, height } = geographicCanvasSize(lat, latSpan, lonSpan, maxSize);
  const quality: "preview" | "study" =
    Math.max(width, height) >= POLAR_GATE_STUDY_SIZE * 0.75 ? "study" : "preview";

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl: "", bounds };

  const imageData = ctx.createImageData(width, height);
  const buf = new Uint32Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    width * height,
  );

  const azStep = 360 / nrays;
  const invAzStep = 1 / azStep;
  const invLat = 1 / Math.max(1, height - 1);
  const invLon = 1 / Math.max(1, width - 1);
  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.max(0.2, Math.cos(lat * DEG));
  const rstartKm = rstart / 1000;
  const rscaleKm = rscale / 1000;
  const yieldEvery = quality === "study" ? 48 : 96;

  for (let py = 0; py < height; py++) {
    if (py > 0 && py % yieldEvery === 0) await Promise.resolve();
    const gateLat = north - py * invLat * latSpan;
    const dLatKm = (gateLat - lat) * kmPerDegLat;
    const row = py * width;

    for (let px = 0; px < width; px++) {
      const gateLon = west + px * invLon * lonSpan;
      const dLonKm = (gateLon - lon) * kmPerDegLon;
      const rangeKm = Math.hypot(dLatKm, dLonKm);
      if (rangeKm > maxRangeKm || rangeKm < 0.01) continue;

      const az = ((Math.atan2(dLonKm, dLatKm) * 180) / Math.PI + 360) % 360;
      const ray =
        Math.floor((((az - a1gate + 360) % 360) * invAzStep)) % nrays;
      const bin = Math.floor((rangeKm - rstartKm) / rscaleKm);
      if (bin < 0 || bin >= nbins) continue;

      const raw = values[ray * nbins + bin];
      if (raw === nodata || raw === undetect || Number.isNaN(raw)) continue;
      const val = raw * gain + offset;
      const color = colorLut[dbzToLutIndex(val)]!;
      if ((color >>> 24) === 0) continue;
      buf[row + px] = color;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const encoded = await canvasToObjectUrl(canvas);
  return {
    dataUrl: encoded.dataUrl,
    bounds,
    isObjectUrl: encoded.isObjectUrl,
    quality,
  };
}

/** Render Level-III to a lat/lon-aligned PNG suitable for Leaflet image overlays. */
export function renderLevel3Geographic(
  layer: Level3RadialLayer,
  lat: number,
  lon: number,
  stops: ColorStop[],
  maxSize = 1024,
  reflectivity = false,
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): PolarRenderResult {
  const sampleColor = reflectivity
    ? (value: number, s: ColorStop[]) => colorAtReflectivityDbz(value, s, fade)
    : colorAtDbz;

  const bounds = level3GateBounds(layer, lat, lon);
  const [[south, west], [north, east]] = bounds;
  const latSpan = Math.max(0.01, north - south);
  const lonSpan = Math.max(0.01, east - west);
  const cosLat = Math.max(0.2, Math.cos(lat * DEG));
  const width = maxSize;
  const height = Math.max(256, Math.round((width * latSpan) / (lonSpan * cosLat)));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl: "", bounds };

  const imageData = ctx.createImageData(width, height);
  const d = imageData.data;

  for (let py = 0; py < height; py++) {
    const gateLat = north - (py / Math.max(1, height - 1)) * latSpan;
    for (let px = 0; px < width; px++) {
      const gateLon = west + (px / Math.max(1, width - 1)) * lonSpan;
      const val = sampleLevel3RadialInterp(layer, lat, lon, gateLat, gateLon);
      const i = (py * width + px) * 4;
      if (val == null) {
        d[i + 3] = 0;
        continue;
      }
      const [r, g, b, a] = sampleColor(val, stops);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = a;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  // Use JPEG with 0.92 quality for smaller data URLs (30-40% size reduction)
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), bounds };
}

/** Render ODIM SCAN to a lat/lon-aligned PNG suitable for Leaflet image overlays. */
export function renderOdimGeographic(
  scan: OdimScanMeta,
  stops: ColorStop[],
  maxSize = 1024,
  reflectivity = true,
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): PolarRenderResult {
  const sampleColor = reflectivity
    ? (value: number, s: ColorStop[]) => colorAtReflectivityDbz(value, s, fade)
    : colorAtDbz;

  const bounds = odimGateBounds(scan);
  const [[south, west], [north, east]] = bounds;
  const latSpan = Math.max(0.01, north - south);
  const lonSpan = Math.max(0.01, east - west);
  const cosLat = Math.max(0.2, Math.cos(scan.lat * DEG));
  const width = maxSize;
  const height = Math.max(256, Math.round((width * latSpan) / (lonSpan * cosLat)));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl: "", bounds };

  const imageData = ctx.createImageData(width, height);
  const d = imageData.data;

  for (let py = 0; py < height; py++) {
    const gateLat = north - (py / Math.max(1, height - 1)) * latSpan;
    for (let px = 0; px < width; px++) {
      const gateLon = west + (px / Math.max(1, width - 1)) * lonSpan;
      const val = sampleOdimRadialInterp(scan, gateLat, gateLon);
      const i = (py * width + px) * 4;
      if (val == null) {
        d[i + 3] = 0;
        continue;
      }
      const [r, g, b, a] = sampleColor(val, stops);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = a;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  // Use JPEG with 0.92 quality for smaller data URLs
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), bounds };
}

/** Render a Level-III radial layer to a transparent PNG data URL. */
export function renderLevel3Radial(
  layer: Level3RadialLayer,
  lat: number,
  lon: number,
  stops: ColorStop[],
  size = 1024,
  reflectivity = false,
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): PolarRenderResult {
  const sampleColor = reflectivity
    ? (dbz: number, s: ColorStop[]) => colorAtReflectivityDbz(dbz, s, fade)
    : colorAtDbz;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl: "", bounds: [[0, 0], [0, 0]] };

  const cx = size / 2;
  const cy = size / 2;
  const maxKm = layer.numberBins * layer.rangeScale;
  const pxPerKm = (size / 2 - 4) / maxKm;

  let minLat = lat;
  let maxLat = lat;
  let minLon = lon;
  let maxLon = lon;

  for (const radial of layer.radials) {
    const angle = radial.startAngle;
    for (let b = 0; b < radial.bins.length; b++) {
      const val = radial.bins[b];
      if (val == null) continue;
      const rangeKm = (layer.firstBin + b) * layer.rangeScale;
      const gateLat = destination(lat, lon, angle, rangeKm).lat;
      const gateLon = destination(lat, lon, angle, rangeKm).lon;
      minLat = Math.min(minLat, gateLat);
      maxLat = Math.max(maxLat, gateLat);
      minLon = Math.min(minLon, gateLon);
      maxLon = Math.max(maxLon, gateLon);

      const [r, g, bl, a] = sampleColor(val, stops);
      if (a === 0) continue;

      const distPx = rangeKm * pxPerKm;
      const rad = angle * DEG;
      const x = cx + Math.sin(rad) * distPx;
      const y = cy - Math.cos(rad) * distPx;
      const w = Math.max(2, layer.rangeScale * pxPerKm * 1.5);

      ctx.fillStyle = `rgba(${r},${g},${bl},${(a / 255).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, w, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const pad = 0.3;
  const bounds: [[number, number], [number, number]] = [
    [minLat - pad, minLon - pad],
    [maxLat + pad, maxLon + pad],
  ];

  return { dataUrl: canvas.toDataURL("image/png"), bounds };
}

/** Render lowest-tilt ODIM SCAN to PNG. */
export function renderOdimScan(
  scan: OdimScanMeta,
  stops: ColorStop[],
  size = 1024,
  reflectivity = true,
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): PolarRenderResult {
  const sampleColor = reflectivity
    ? (dbz: number, stops: ColorStop[]) => colorAtReflectivityDbz(dbz, stops, fade)
    : colorAtDbz;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl: "", bounds: [[0, 0], [0, 0]] };

  const { lat, lon, nbins, nrays, rstart, rscale, a1gate, values, nodata, undetect, gain, offset } =
    scan;
  const azStep = nrays > 0 ? 360 / nrays : 1;
  const cx = size / 2;
  const cy = size / 2;
  const maxKm = (rstart + nbins * rscale) / 1000;
  const pxPerKm = (size / 2 - 4) / maxKm;

  let minLat = lat;
  let maxLat = lat;
  let minLon = lon;
  let maxLon = lon;

  for (let ray = 0; ray < nrays; ray++) {
    const az = (a1gate + ray * azStep) % 360;
    for (let bin = 0; bin < nbins; bin++) {
      const raw = values[ray * nbins + bin];
      if (raw === nodata || raw === undetect || Number.isNaN(raw)) continue;
      const val = raw * gain + offset;
      const rangeKm = (rstart + bin * rscale) / 1000;
      const pos = destination(lat, lon, az, rangeKm);
      minLat = Math.min(minLat, pos.lat);
      maxLat = Math.max(maxLat, pos.lat);
      minLon = Math.min(minLon, pos.lon);
      maxLon = Math.max(maxLon, pos.lon);

      const [r, g, b, a] = sampleColor(val, stops);
      if (a === 0) continue;
      const distPx = rangeKm * pxPerKm;
      const rad = az * DEG;
      const x = cx + Math.sin(rad) * distPx;
      const y = cy - Math.cos(rad) * distPx;
      ctx.fillStyle = `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, rscale / 1000 * pxPerKm * 1.2), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const pad = 0.25;
  return {
    dataUrl: canvas.toDataURL("image/png"),
    bounds: [
      [minLat - pad, minLon - pad],
      [maxLat + pad, maxLon + pad],
    ],
  };
}
