import type { Level3RadialLayer } from "./level3Parse";
import { level3BinCount, level3RangeScaleKm } from "./level3Geometry";
import type { OdimScanMeta } from "./renderPolar";

const DEG = Math.PI / 180;

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a1 = (lat1 * Math.PI) / 180;
  const a2 = (lat2 * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a1) * Math.cos(a2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δλ = (lon2 - lon1) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function destinationPoint(
  lat: number,
  lon: number,
  bearing: number,
  distKm: number,
): { lat: number; lon: number } {
  const br = bearing * DEG;
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
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

function firstGateKm(layer: Level3RadialLayer): number {
  const scale = level3RangeScaleKm(layer);
  return Math.max(0.25, (layer.firstBin ?? 0) * scale);
}

function sampleCoordsAtRange(
  radarLat: number,
  radarLon: number,
  targetLat: number,
  targetLon: number,
  rangeKm: number,
  minRangeKm: number,
): { lat: number; lon: number; rangeKm: number } {
  if (rangeKm >= minRangeKm) {
    return { lat: targetLat, lon: targetLon, rangeKm };
  }
  const az = bearingDeg(radarLat, radarLon, targetLat, targetLon);
  const pt = destinationPoint(radarLat, radarLon, az, minRangeKm);
  return { lat: pt.lat, lon: pt.lon, rangeKm: minRangeKm };
}

function normalizeAngleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

const EFFECTIVE_EARTH_RADIUS_KM = (6371 * 4) / 3;

/** Beam center height (km AGL) using the standard 4/3 Earth-radius model. */
export function beamHeightKm(
  rangeKm: number,
  elevationDeg: number,
  siteHeightKm = 0,
): number {
  const theta = elevationDeg * DEG;
  const h =
    Math.sqrt(rangeKm ** 2 + EFFECTIVE_EARTH_RADIUS_KM ** 2 +
      2 * rangeKm * EFFECTIVE_EARTH_RADIUS_KM * Math.sin(theta)) - EFFECTIVE_EARTH_RADIUS_KM;
  return h + siteHeightKm;
}

/** Inverse of beamHeightKm — elevation angle (deg) for a target height at slant range. */
export function elevationForHeightKm(
  rangeKm: number,
  heightKm: number,
  siteHeightKm = 0,
): number {
  if (rangeKm < 0.01) return 0;
  const Re = EFFECTIVE_EARTH_RADIUS_KM;
  const target = heightKm - siteHeightKm + Re;
  const sinEl =
    (target * target - rangeKm * rangeKm - Re * Re) / (2 * rangeKm * Re);
  const clamped = Math.max(-1, Math.min(1, sinEl));
  return (Math.asin(clamped) * 180) / Math.PI;
}

function lerpNullable(a: number | null, b: number | null, t: number): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return a + t * (b - a);
}

function findBestRadialIndex(layer: Level3RadialLayer, az: number): number {
  if (!layer.radials.length) return 0;
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < layer.radials.length; i++) {
    const diff = normalizeAngleDiff(layer.radials[i].startAngle, az);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function sampleRadialRange(
  radial: Level3RadialLayer["radials"][0],
  layer: Level3RadialLayer,
  rangeKm: number,
): number | null {
  const scale = level3RangeScaleKm(layer);
  const binF = rangeKm / scale - layer.firstBin;
  const b0 = Math.floor(binF);
  const frac = binF - b0;
  const b1 = b0 + 1;

  if (b0 < 0) return radial.bins[0] ?? null;
  if (b1 >= radial.bins.length) {
    return b0 < radial.bins.length ? radial.bins[b0] : null;
  }

  return lerpNullable(radial.bins[b0], radial.bins[b1], frac);
}

/** Sample Level-III reflectivity at a fixed azimuth and slant range (km). */
export function sampleLevel3AtAzRange(
  layer: Level3RadialLayer,
  azDeg: number,
  rangeKm: number,
): number | null {
  const minRange = firstGateKm(layer);
  const effRange = Math.max(rangeKm, minRange);
  const radialIdx = findBestRadialIndex(layer, azDeg);
  const radial = layer.radials[radialIdx];
  if (!radial) return null;
  return sampleRadialRange(radial, layer, effRange);
}

export interface RadarSliceColumn {
  lat: number;
  lon: number;
  rangeKm: number;
  azimuthDeg: number;
}

/** Build slice columns on a great-circle ray from the radar site. */
export function buildRadarSliceColumns(
  radarLat: number,
  radarLon: number,
  end: LatLng,
  count: number,
): RadarSliceColumn[] {
  const azimuthDeg = bearingDeg(radarLat, radarLon, end.lat, end.lon);
  const totalKm = haversineKm(radarLat, radarLon, end.lat, end.lon);
  if (count <= 1 || totalKm < 0.001) {
    return [{ lat: radarLat, lon: radarLon, rangeKm: 0, azimuthDeg }];
  }

  const columns: RadarSliceColumn[] = [];
  for (let i = 0; i < count; i++) {
    const rangeKm = (i / (count - 1)) * totalKm;
    if (rangeKm < 0.001) {
      columns.push({ lat: radarLat, lon: radarLon, rangeKm: 0, azimuthDeg });
    } else {
      const pt = destinationPoint(radarLat, radarLon, azimuthDeg, rangeKm);
      columns.push({ lat: pt.lat, lon: pt.lon, rangeKm, azimuthDeg });
    }
  }
  return columns;
}

export function sampleLevel3Radial(
  layer: Level3RadialLayer,
  radarLat: number,
  radarLon: number,
  targetLat: number,
  targetLon: number,
): number | null {
  const rawRangeKm = haversineKm(radarLat, radarLon, targetLat, targetLon);
  const minRange = firstGateKm(layer);
  const { lat, lon, rangeKm } = sampleCoordsAtRange(
    radarLat,
    radarLon,
    targetLat,
    targetLon,
    rawRangeKm,
    minRange,
  );

  const az = bearingDeg(radarLat, radarLon, lat, lon);
  let best = layer.radials[0];
  let bestDiff = Infinity;
  for (const radial of layer.radials) {
    const diff = normalizeAngleDiff(radial.startAngle, az);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = radial;
    }
  }
  if (!best) return null;

  const scale = level3RangeScaleKm(layer);
  const binF = rangeKm / scale - layer.firstBin;
  const bin = Math.round(binF);
  const maxBin = level3BinCount(layer) - 1;
  if (bin < 0 || bin > maxBin) return null;
  return best.bins[bin] ?? null;
}

/** Range-interpolated Level-III sample (smoother cross-sections). */
export function sampleLevel3RadialInterp(
  layer: Level3RadialLayer,
  radarLat: number,
  radarLon: number,
  targetLat: number,
  targetLon: number,
): number | null {
  const rawRangeKm = haversineKm(radarLat, radarLon, targetLat, targetLon);
  const minRange = firstGateKm(layer);
  const { lat, lon, rangeKm } = sampleCoordsAtRange(
    radarLat,
    radarLon,
    targetLat,
    targetLon,
    rawRangeKm,
    minRange,
  );

  const az = bearingDeg(radarLat, radarLon, lat, lon);
  const radialIdx = findBestRadialIndex(layer, az);
  const radial = layer.radials[radialIdx];
  if (!radial) return null;

  return sampleRadialRange(radial, layer, rangeKm);
}

/** @deprecated Use sampleLevel3Radial */
export const sampleLevel3Reflectivity = sampleLevel3RadialInterp;

function odimValueAtBin(scan: OdimScanMeta, ray: number, bin: number): number | null {
  if (bin < 0 || bin >= scan.nbins) return null;
  const raw = scan.values[ray * scan.nbins + bin];
  if (raw === scan.nodata || raw === scan.undetect || Number.isNaN(raw)) return null;
  return raw * scan.gain + scan.offset;
}

/** Sample OPERA ODIM reflectivity at a fixed azimuth and slant range (km). */
export function sampleOdimAtAzRange(
  scan: OdimScanMeta,
  azDeg: number,
  rangeKm: number,
): number | null {
  const minRangeKm = Math.max(0.25, scan.rstart / 1000);
  const effRange = Math.max(rangeKm, minRangeKm);
  const rangeM = effRange * 1000;
  const azStep = scan.nrays > 0 ? 360 / scan.nrays : 1;
  const ray = Math.round(((azDeg - scan.a1gate + 360) % 360) / azStep) % scan.nrays;

  const binF = (rangeM - scan.rstart) / scan.rscale;
  const b0 = Math.floor(binF);
  const frac = binF - b0;
  const b1 = b0 + 1;

  return lerpNullable(odimValueAtBin(scan, ray, b0), odimValueAtBin(scan, ray, b1), frac);
}

export function sampleOdimRadial(
  scan: OdimScanMeta,
  targetLat: number,
  targetLon: number,
): number | null {
  const rawRangeKm = haversineKm(scan.lat, scan.lon, targetLat, targetLon);
  const minRangeKm = Math.max(0.25, scan.rstart / 1000);
  const { lat, lon, rangeKm } = sampleCoordsAtRange(
    scan.lat,
    scan.lon,
    targetLat,
    targetLon,
    rawRangeKm,
    minRangeKm,
  );

  const az = bearingDeg(scan.lat, scan.lon, lat, lon);
  const rangeM = rangeKm * 1000;
  const azStep = scan.nrays > 0 ? 360 / scan.nrays : 1;
  const ray = Math.round(((az - scan.a1gate + 360) % 360) / azStep) % scan.nrays;
  const bin = Math.round((rangeM - scan.rstart) / scan.rscale);
  if (bin < 0 || bin >= scan.nbins) return null;

  const raw = scan.values[ray * scan.nbins + bin];
  if (raw === scan.nodata || raw === scan.undetect || Number.isNaN(raw)) return null;
  return raw * scan.gain + scan.offset;
}

/** Range-interpolated OPERA ODIM sample. */
export function sampleOdimRadialInterp(
  scan: OdimScanMeta,
  targetLat: number,
  targetLon: number,
): number | null {
  const rawRangeKm = haversineKm(scan.lat, scan.lon, targetLat, targetLon);
  const minRangeKm = Math.max(0.25, scan.rstart / 1000);
  const { lat, lon, rangeKm } = sampleCoordsAtRange(
    scan.lat,
    scan.lon,
    targetLat,
    targetLon,
    rawRangeKm,
    minRangeKm,
  );

  const az = bearingDeg(scan.lat, scan.lon, lat, lon);
  const rangeM = rangeKm * 1000;
  const azStep = scan.nrays > 0 ? 360 / scan.nrays : 1;
  const ray = Math.round(((az - scan.a1gate + 360) % 360) / azStep) % scan.nrays;

  const binF = (rangeM - scan.rstart) / scan.rscale;
  const b0 = Math.floor(binF);
  const frac = binF - b0;
  const b1 = b0 + 1;

  function rawAt(bin: number): number | null {
    if (bin < 0 || bin >= scan.nbins) return null;
    const raw = scan.values[ray * scan.nbins + bin];
    if (raw === scan.nodata || raw === scan.undetect || Number.isNaN(raw)) return null;
    return raw * scan.gain + scan.offset;
  }

  return lerpNullable(rawAt(b0), rawAt(b1), frac);
}

/** @deprecated Use sampleOdimRadial */
export const sampleOdimReflectivity = sampleOdimRadialInterp;
