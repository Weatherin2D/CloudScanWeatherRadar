import type { Level3RadialLayer } from "./level3Parse";
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

function normalizeAngleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/** Approximate beam height (km) for a given slant range and elevation angle. */
export function beamHeightKm(rangeKm: number, elevationDeg: number): number {
  return rangeKm * Math.sin(elevationDeg * DEG);
}

export function sampleLevel3Reflectivity(
  layer: Level3RadialLayer,
  radarLat: number,
  radarLon: number,
  targetLat: number,
  targetLon: number,
): number | null {
  const rangeKm = haversineKm(radarLat, radarLon, targetLat, targetLon);
  if (rangeKm < 0.5) return null;

  const az = bearingDeg(radarLat, radarLon, targetLat, targetLon);
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

  const binF = rangeKm / layer.rangeScale - layer.firstBin;
  const bin = Math.round(binF);
  if (bin < 0 || bin >= best.bins.length) return null;
  return best.bins[bin];
}

export function sampleOdimReflectivity(
  scan: OdimScanMeta,
  targetLat: number,
  targetLon: number,
): number | null {
  const rangeKm = haversineKm(scan.lat, scan.lon, targetLat, targetLon);
  if (rangeKm < 0.5) return null;

  const az = bearingDeg(scan.lat, scan.lon, targetLat, targetLon);
  const rangeM = rangeKm * 1000;
  const azStep = scan.nrays > 0 ? 360 / scan.nrays : 1;
  const ray = Math.round(((az - scan.a1gate + 360) % 360) / azStep) % scan.nrays;
  const bin = Math.round((rangeM - scan.rstart) / scan.rscale);
  if (bin < 0 || bin >= scan.nbins) return null;

  const raw = scan.values[ray * scan.nbins + bin];
  if (raw === scan.nodata || raw === scan.undetect || Number.isNaN(raw)) return null;
  return raw * scan.gain + scan.offset;
}
