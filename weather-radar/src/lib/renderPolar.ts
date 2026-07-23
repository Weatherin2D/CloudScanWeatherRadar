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
  level3BinRangeKm,
  level3CoverageBounds,
  level3MaxRangeKm,
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

/** Fast first-paint polar raster (cold start / animation). */
export const POLAR_GATE_PREVIEW_SIZE = 768;

/**
 * Study-quality polar raster. 2048 balances zoom detail vs encode/load time;
 * Leaflet ImageOverlay scales instantly on pan/zoom (no post-move redraw).
 */
export const POLAR_GATE_STUDY_SIZE = 2048;

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

/** Fill a convex quad into a Uint32 ImageData buffer via scanline edges. */
function fillConvexQuad(
  buf: Uint32Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  color: number,
): void {
  if ((color >>> 24) === 0) return;

  let minY = Math.floor(Math.min(y0, y1, y2, y3));
  let maxY = Math.ceil(Math.max(y0, y1, y2, y3));
  if (maxY < 0 || minY >= height) return;
  minY = Math.max(0, minY);
  maxY = Math.min(height - 1, maxY);

  const edgeX = [x0, x1, x2, x3];
  const edgeY = [y0, y1, y2, y3];

  for (let y = minY; y <= maxY; y++) {
    let n = 0;
    const hits = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const xa = edgeX[i]!;
      const ya = edgeY[i]!;
      const xb = edgeX[(i + 1) % 4]!;
      const yb = edgeY[(i + 1) % 4]!;
      if ((ya <= y && yb > y) || (yb <= y && ya > y)) {
        const t = (y - ya) / (yb - ya);
        hits[n++] = xa + t * (xb - xa);
      }
    }
    if (n < 2) continue;
    for (let i = 1; i < n; i++) {
      const v = hits[i]!;
      let j = i - 1;
      while (j >= 0 && hits[j]! > v) {
        hits[j + 1] = hits[j]!;
        j--;
      }
      hits[j + 1] = v;
    }
    for (let i = 0; i + 1 < n; i += 2) {
      let xStart = Math.ceil(hits[i]!);
      let xEnd = Math.floor(hits[i + 1]!);
      if (xEnd < 0 || xStart >= width) continue;
      xStart = Math.max(0, xStart);
      xEnd = Math.min(width - 1, xEnd);
      const row = y * width;
      for (let x = xStart; x <= xEnd; x++) {
        buf[row + x] = color;
      }
    }
  }
}

async function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<{
  dataUrl: string;
  isObjectUrl: boolean;
}> {
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

function projectToCanvas(
  gateLat: number,
  gateLon: number,
  north: number,
  west: number,
  latSpan: number,
  lonSpan: number,
  width: number,
  height: number,
): [number, number] {
  const px = ((gateLon - west) / lonSpan) * (width - 1);
  const py = ((north - gateLat) / latSpan) * (height - 1);
  return [px, py];
}

export async function renderLevel3PolarGates(
  layer: Level3RadialLayer,
  _lat: number,
  _lon: number,
  stops: ColorStop[],
  maxSize = POLAR_GATE_STUDY_SIZE,
  reflectivity = false,
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): Promise<PolarRenderResult> {
  const lut = stopsToDbzUint32LUT(stops, reflectivity, fade);
  const bounds = level3CoverageBounds(layer, _lat, _lon);
  const maxRangeKm = level3MaxRangeKm(layer);
  if (maxRangeKm <= 0) return { dataUrl: "", bounds };

  const size = Math.max(256, Math.min(maxSize, POLAR_GATE_STUDY_SIZE));
  const quality: "preview" | "study" =
    size >= POLAR_GATE_STUDY_SIZE * 0.75 ? "study" : "preview";
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl: "", bounds };

  const imageData = ctx.createImageData(size, size);
  const buf = new Uint32Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    size * size,
  );

  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const pxPerKm = (size / 2 - 2) / maxRangeKm;
  const binLimit = level3BinCount(layer);

  const polarXY = (azDeg: number, rangeKm: number): [number, number] => {
    const rad = azDeg * DEG;
    const d = rangeKm * pxPerKm;
    return [cx + Math.sin(rad) * d, cy - Math.cos(rad) * d];
  };

  for (let ri = 0; ri < layer.radials.length; ri++) {
    if (quality === "study" && ri > 0 && ri % 24 === 0) {
      await Promise.resolve();
    }
    const radial = layer.radials[ri]!;
    const [az0, az1] = radialAzimuthSpan(radial, ri, layer);
    const binsInRadial = Math.min(radial.bins.length, binLimit);

    for (let b = binsInRadial - 1; b >= 0; b--) {
      const val = radial.bins[b];
      if (val == null) continue;

      const color = lut[dbzToLutIndex(val)]!;
      if ((color >>> 24) === 0) continue;

      const [r0, r1] = level3BinRangeKm(layer, b);
      if (r1 <= 0 || r0 >= maxRangeKm) continue;
      const outer = Math.min(r1, maxRangeKm);
      if (outer <= r0) continue;

      const [x1, y1] = polarXY(az0, r0);
      const [x2, y2] = polarXY(az1, r0);
      const [x3, y3] = polarXY(az1, outer);
      const [x4, y4] = polarXY(az0, outer);

      fillConvexQuad(buf, size, size, x1, y1, x2, y2, x3, y3, x4, y4, color);
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

/** Render ODIM SCAN as native polar range gates. */
export async function renderOdimPolarGates(
  scan: OdimScanMeta,
  stops: ColorStop[],
  maxSize = POLAR_GATE_STUDY_SIZE,
  reflectivity = true,
  fade: ReflectivityFadeSettings = DEFAULT_REFLECTIVITY_FADE,
): Promise<PolarRenderResult> {
  const lut = stopsToDbzUint32LUT(stops, reflectivity, fade);
  const bounds = odimCoverageBounds(scan);
  const { nbins, nrays, rstart, rscale, a1gate, values, nodata, undetect, gain, offset } =
    scan;
  const maxRangeKm = Math.max(1, (rstart + nbins * rscale) / 1000);

  const size = Math.max(256, Math.min(maxSize, POLAR_GATE_STUDY_SIZE));
  const quality: "preview" | "study" =
    size >= POLAR_GATE_STUDY_SIZE * 0.75 ? "study" : "preview";
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { dataUrl: "", bounds };

  const imageData = ctx.createImageData(size, size);
  const buf = new Uint32Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    size * size,
  );

  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const pxPerKm = (size / 2 - 2) / maxRangeKm;
  const azStep = nrays > 0 ? 360 / nrays : 1;

  const polarXY = (azDeg: number, rangeKm: number): [number, number] => {
    const rad = azDeg * DEG;
    const d = rangeKm * pxPerKm;
    return [cx + Math.sin(rad) * d, cy - Math.cos(rad) * d];
  };

  for (let ray = 0; ray < nrays; ray++) {
    if (quality === "study" && ray > 0 && ray % 24 === 0) {
      await Promise.resolve();
    }
    const az = (a1gate + ray * azStep) % 360;
    const az0 = az - azStep / 2;
    const az1 = az + azStep / 2;

    for (let bin = nbins - 1; bin >= 0; bin--) {
      const raw = values[ray * nbins + bin];
      if (raw === nodata || raw === undetect || Number.isNaN(raw)) continue;
      const val = raw * gain + offset;

      const color = lut[dbzToLutIndex(val)]!;
      if ((color >>> 24) === 0) continue;

      const r0 = (rstart + bin * rscale) / 1000;
      const r1 = (rstart + (bin + 1) * rscale) / 1000;
      if (r1 <= 0 || r0 >= maxRangeKm) continue;
      const outer = Math.min(r1, maxRangeKm);
      if (outer <= r0) continue;

      const [x1, y1] = polarXY(az0, r0);
      const [x2, y2] = polarXY(az1, r0);
      const [x3, y3] = polarXY(az1, outer);
      const [x4, y4] = polarXY(az0, outer);

      fillConvexQuad(buf, size, size, x1, y1, x2, y2, x3, y3, x4, y4, color);
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
