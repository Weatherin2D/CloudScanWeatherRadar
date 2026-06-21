import type { ColorStop } from "./palPalette";
import {
  colorAtDbz,
  colorAtReflectivityDbz,
  DEFAULT_REFLECTIVITY_FADE,
  type ReflectivityFadeSettings,
} from "./palPalette";
import type { Level3RadialLayer } from "./level3Parse";
import {
  sampleLevel3RadialInterp,
  sampleOdimRadialInterp,
} from "./polarSample";

export interface PolarRenderResult {
  dataUrl: string;
  bounds: [[number, number], [number, number]];
}

export type GeographicPolarFrame = PolarRenderResult;

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

function odimGateBounds(scan: OdimScanMeta): [[number, number], [number, number]] {
  const { lat, lon, nbins, nrays, rstart, rscale, a1gate, values, nodata, undetect } = scan;
  const azStep = nrays > 0 ? 360 / nrays : 1;
  let minLat = lat;
  let maxLat = lat;
  let minLon = lon;
  let maxLon = lon;

  for (let ray = 0; ray < nrays; ray++) {
    const az = (a1gate + ray * azStep) % 360;
    for (let bin = 0; bin < nbins; bin++) {
      const raw = values[ray * nbins + bin];
      if (raw === nodata || raw === undetect || Number.isNaN(raw)) continue;
      const rangeKm = (rstart + bin * rscale) / 1000;
      const pos = destination(lat, lon, az, rangeKm);
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
      const val = sampleOdimRadialInterp(scan, scan.lat, scan.lon, gateLat, gateLon);
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
