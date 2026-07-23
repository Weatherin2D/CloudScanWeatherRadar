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
  dpr: number;
}

/** Thin only when very zoomed out — avoids spoke artifacts at study zooms. */
export function polarDrawSteps(zoom: number): { radialStep: number; binStep: number } {
  if (zoom >= 7) return { radialStep: 1, binStep: 1 };
  if (zoom >= 5) return { radialStep: 1, binStep: 2 };
  return { radialStep: 2, binStep: 3 };
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

/** Scanline fill into a Uint32 buffer (ABGR), much faster than Canvas path API. */
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
        hits[n++] = xa + ((y - ya) / (yb - ya)) * (xb - xa);
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
      for (let x = xStart; x <= xEnd; x++) buf[row + x] = color;
    }
  }
}

function applyOpacity(packed: number, opacity: number): number {
  if (opacity >= 0.999) return packed;
  const a = Math.round(((packed >>> 24) & 255) * opacity);
  return (packed & 0x00ffffff) | (a << 24);
}

function gateInView(
  width: number,
  height: number,
  xs: number[],
  ys: number[],
  pad: number,
): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 4; i++) {
    minX = Math.min(minX, xs[i]!);
    maxX = Math.max(maxX, xs[i]!);
    minY = Math.min(minY, ys[i]!);
    maxY = Math.max(maxY, ys[i]!);
  }
  return maxX >= -pad && minX <= width + pad && maxY >= -pad && minY <= height + pad;
}

/** Paint Level-III gates into an ImageData buffer (caller putImageData). */
export function paintLevel3Gates(
  imageData: ImageData,
  map: LeafletMap,
  layer: Level3RadialLayer,
  siteLat: number,
  siteLon: number,
  lut: Uint32Array,
  opacity: number,
  dpr: number,
): void {
  const width = imageData.width;
  const height = imageData.height;
  const buf = new Uint32Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    width * height,
  );
  buf.fill(0);

  const { radialStep, binStep } = polarDrawSteps(map.getZoom());
  const maxRangeKm = level3MaxRangeKm(layer);
  const binLimit = level3BinCount(layer);
  const pad = 48 * dpr;

  for (let ri = 0; ri < layer.radials.length; ri += radialStep) {
    const radial = layer.radials[ri]!;
    const [az0, az1Raw] = radialAzimuthSpan(radial, ri, layer);
    const span =
      ((az1Raw - az0 + 360) % 360) || 360 / Math.max(1, layer.radials.length);
    const az1 = az1Raw + (radialStep > 1 ? span * (radialStep - 1) * 0.5 : 0);

    const binsInRadial = Math.min(radial.bins.length, binLimit);
    for (let b = binsInRadial - 1; b >= 0; b -= binStep) {
      const binStart = Math.max(0, b - binStep + 1);
      let bestVal: number | null = null;
      for (let k = binStart; k <= b; k++) {
        const v = radial.bins[k];
        if (v == null) continue;
        if (bestVal == null || v > bestVal) bestVal = v;
      }
      if (bestVal == null) continue;

      const color = applyOpacity(lut[dbzToLutIndex(bestVal)]!, opacity);
      if ((color >>> 24) === 0) continue;

      const [r0] = level3BinRangeKm(layer, binStart);
      const [, r1] = level3BinRangeKm(layer, b);
      if (r1 <= 0 || r0 >= maxRangeKm) continue;
      const outer = Math.min(r1, maxRangeKm);
      if (outer <= r0) continue;

      const p1 = destination(siteLat, siteLon, az0, r0);
      const p2 = destination(siteLat, siteLon, az1, r0);
      const p3 = destination(siteLat, siteLon, az1, outer);
      const p4 = destination(siteLat, siteLon, az0, outer);

      const c1 = project(map, p1.lat, p1.lon, dpr);
      const c2 = project(map, p2.lat, p2.lon, dpr);
      const c3 = project(map, p3.lat, p3.lon, dpr);
      const c4 = project(map, p4.lat, p4.lon, dpr);

      if (
        !gateInView(
          width,
          height,
          [c1.x, c2.x, c3.x, c4.x],
          [c1.y, c2.y, c3.y, c4.y],
          pad,
        )
      ) {
        continue;
      }

      fillConvexQuad(
        buf,
        width,
        height,
        c1.x,
        c1.y,
        c2.x,
        c2.y,
        c3.x,
        c3.y,
        c4.x,
        c4.y,
        color,
      );
    }
  }
}

export function paintOdimGates(
  imageData: ImageData,
  map: LeafletMap,
  scan: OdimScanMeta,
  lut: Uint32Array,
  opacity: number,
  dpr: number,
): void {
  const width = imageData.width;
  const height = imageData.height;
  const buf = new Uint32Array(
    imageData.data.buffer,
    imageData.data.byteOffset,
    width * height,
  );
  buf.fill(0);

  const { radialStep, binStep } = polarDrawSteps(map.getZoom());
  const { lat, lon, nbins, nrays, rstart, rscale, a1gate, values, nodata, undetect, gain, offset } =
    scan;
  const maxRangeKm = Math.max(1, (rstart + nbins * rscale) / 1000);
  const azStepBase = nrays > 0 ? 360 / nrays : 1;
  const pad = 48 * dpr;

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

      const color = applyOpacity(lut[dbzToLutIndex(bestVal)]!, opacity);
      if ((color >>> 24) === 0) continue;

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

      if (
        !gateInView(
          width,
          height,
          [c1.x, c2.x, c3.x, c4.x],
          [c1.y, c2.y, c3.y, c4.y],
          pad,
        )
      ) {
        continue;
      }

      fillConvexQuad(
        buf,
        width,
        height,
        c1.x,
        c1.y,
        c2.x,
        c2.y,
        c3.x,
        c3.y,
        c4.x,
        c4.y,
        color,
      );
    }
  }
}
