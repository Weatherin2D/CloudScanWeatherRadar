import type { Map as LeafletMap } from "leaflet";
import type { Level3RadialLayer } from "./level3Parse";
import {
  destination,
  level3BinCount,
  level3BinRangeKm,
  level3MaxRangeKm,
  radialAzimuthSpan,
} from "./level3Geometry";
import { dbzToLutIndex } from "./palPalette";
import type { OdimScanMeta } from "./renderPolar";

export interface PolarDrawViewport {
  width: number;
  height: number;
  /** Map container → canvas pixel scale (devicePixelRatio). */
  dpr: number;
}

/** Adaptive thinning so low zoom stays interactive; high zoom draws every gate. */
export function polarDrawSteps(zoom: number): { radialStep: number; binStep: number } {
  if (zoom >= 10) return { radialStep: 1, binStep: 1 };
  if (zoom >= 8) return { radialStep: 1, binStep: 1 };
  if (zoom >= 7) return { radialStep: 1, binStep: 2 };
  if (zoom >= 5) return { radialStep: 2, binStep: 3 };
  return { radialStep: 3, binStep: 4 };
}

function unpackColor(
  packed: number,
  opacity: number,
): { r: number; g: number; b: number; a: number } {
  const r = packed & 255;
  const g = (packed >>> 8) & 255;
  const b = (packed >>> 16) & 255;
  const a = Math.round(((packed >>> 24) & 255) * opacity);
  return { r, g, b, a };
}

function project(
  map: LeafletMap,
  lat: number,
  lon: number,
  dpr: number,
): { x: number; y: number } {
  const p = map.latLngToContainerPoint([lat, lon]);
  return { x: p.x * dpr, y: p.y * dpr };
}

function fillGate(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  if (a < 1) return;
  // Skip degenerate / sub-pixel gates (still draw if any edge is visible)
  const minX = Math.min(x1, x2, x3, x4);
  const maxX = Math.max(x1, x2, x3, x4);
  const minY = Math.min(y1, y2, y3, y4);
  const maxY = Math.max(y1, y2, y3, y4);
  if (maxX - minX < 0.35 && maxY - minY < 0.35) {
    ctx.fillStyle = `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
    ctx.fillRect(Math.round(minX), Math.round(minY), 1, 1);
    return;
  }

  ctx.fillStyle = `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

function gateInView(
  width: number,
  height: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
  pad: number,
): boolean {
  const minX = Math.min(x1, x2, x3, x4);
  const maxX = Math.max(x1, x2, x3, x4);
  const minY = Math.min(y1, y2, y3, y4);
  const maxY = Math.max(y1, y2, y3, y4);
  return maxX >= -pad && minX <= width + pad && maxY >= -pad && minY <= height + pad;
}

/** Draw Level-III polar gates in map container pixel space (sharp at any zoom). */
export function drawLevel3GatesOnMap(
  ctx: CanvasRenderingContext2D,
  map: LeafletMap,
  layer: Level3RadialLayer,
  siteLat: number,
  siteLon: number,
  lut: Uint32Array,
  opacity: number,
  viewport: PolarDrawViewport,
): void {
  const { width, height, dpr } = viewport;
  const { radialStep, binStep } = polarDrawSteps(map.getZoom());
  const maxRangeKm = level3MaxRangeKm(layer);
  const binLimit = level3BinCount(layer);
  const pad = 64 * dpr;

  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;

  for (let ri = 0; ri < layer.radials.length; ri += radialStep) {
    const radial = layer.radials[ri]!;
    const [az0, az1Raw] = radialAzimuthSpan(radial, ri, layer);
    const azWiden =
      radialStep > 1
        ? ((az1Raw - az0 + 360) % 360 || 360 / Math.max(1, layer.radials.length)) *
          (radialStep - 1) *
          0.5
        : 0;
    const az1 = az1Raw + azWiden;

    const binsInRadial = Math.min(radial.bins.length, binLimit);
    // Far → near so closer gates paint on top
    for (let b = binsInRadial - 1; b >= 0; b -= binStep) {
      const binStart = Math.max(0, b - binStep + 1);
      let bestVal: number | null = null;
      for (let k = binStart; k <= b; k++) {
        const v = radial.bins[k];
        if (v == null) continue;
        if (bestVal == null || v > bestVal) bestVal = v;
      }
      if (bestVal == null) continue;

      const packed = lut[dbzToLutIndex(bestVal)]!;
      const { r, g, b: bc, a } = unpackColor(packed, opacity);
      if (a < 1) continue;

      const [r0] = level3BinRangeKm(layer, binStart);
      const [, r1Inner] = level3BinRangeKm(layer, b);
      if (r1Inner <= 0 || r0 >= maxRangeKm) continue;
      const outer = Math.min(r1Inner, maxRangeKm);
      if (outer <= r0) continue;

      const p1 = destination(siteLat, siteLon, az0, r0);
      const p2 = destination(siteLat, siteLon, az1, r0);
      const p3 = destination(siteLat, siteLon, az1, outer);
      const p4 = destination(siteLat, siteLon, az0, outer);

      const c1 = project(map, p1.lat, p1.lon, dpr);
      const c2 = project(map, p2.lat, p2.lon, dpr);
      const c3 = project(map, p3.lat, p3.lon, dpr);
      const c4 = project(map, p4.lat, p4.lon, dpr);

      if (!gateInView(width, height, c1.x, c1.y, c2.x, c2.y, c3.x, c3.y, c4.x, c4.y, pad)) {
        continue;
      }

      fillGate(ctx, c1.x, c1.y, c2.x, c2.y, c3.x, c3.y, c4.x, c4.y, r, g, bc, a);
    }
  }
}

/** Draw OPERA ODIM polar gates in map container pixel space. */
export function drawOdimGatesOnMap(
  ctx: CanvasRenderingContext2D,
  map: LeafletMap,
  scan: OdimScanMeta,
  lut: Uint32Array,
  opacity: number,
  viewport: PolarDrawViewport,
): void {
  const { width, height, dpr } = viewport;
  const { radialStep, binStep } = polarDrawSteps(map.getZoom());
  const { lat, lon, nbins, nrays, rstart, rscale, a1gate, values, nodata, undetect, gain, offset } =
    scan;
  const maxRangeKm = Math.max(1, (rstart + nbins * rscale) / 1000);
  const azStepBase = nrays > 0 ? 360 / nrays : 1;
  const pad = 64 * dpr;

  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;

  for (let ray = 0; ray < nrays; ray += radialStep) {
    const az = (a1gate + ray * azStepBase) % 360;
    const half = (azStepBase * radialStep) / 2;
    const az0 = az - half;
    const az1 = az + half;

    for (let bin = nbins - 1; bin >= 0; bin -= binStep) {
      const binStart = Math.max(0, bin - binStep + 1);
      let bestVal: number | null = null;
      for (let k = binStart; k <= bin; k++) {
        const raw = values[ray * nbins + k];
        if (raw === nodata || raw === undetect || Number.isNaN(raw)) continue;
        const val = raw * gain + offset;
        if (bestVal == null || val > bestVal) bestVal = val;
      }
      if (bestVal == null) continue;

      const packed = lut[dbzToLutIndex(bestVal)]!;
      const { r, g, b: bc, a } = unpackColor(packed, opacity);
      if (a < 1) continue;

      const r0 = (rstart + binStart * rscale) / 1000;
      const r1 = (rstart + (bin + 1) * rscale) / 1000;
      if (r1 <= 0 || r0 >= maxRangeKm) continue;
      const outer = Math.min(r1, maxRangeKm);
      if (outer <= r0) continue;

      const p1 = destination(lat, lon, az0, r0);
      const p2 = destination(lat, lon, az1, r0);
      const p3 = destination(lat, lon, az1, outer);
      const p4 = destination(lat, lon, az0, outer);

      const c1 = project(map, p1.lat, p1.lon, dpr);
      const c2 = project(map, p2.lat, p2.lon, dpr);
      const c3 = project(map, p3.lat, p3.lon, dpr);
      const c4 = project(map, p4.lat, p4.lon, dpr);

      if (!gateInView(width, height, c1.x, c1.y, c2.x, c2.y, c3.x, c3.y, c4.x, c4.y, pad)) {
        continue;
      }

      fillGate(ctx, c1.x, c1.y, c2.x, c2.y, c3.x, c3.y, c4.x, c4.y, r, g, bc, a);
    }
  }
}
