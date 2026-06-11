import { parseLevel3, type Level3Parsed } from "@/lib/level3Parse";
import { level3FetchCode, NEXRAD_TILTS, OPERA_TILTS, operaElevationForTilt } from "@/lib/radarTilt";
import { level3ObjectUrl, fetchLevel3Frames } from "@/lib/level3Radar";
import { isReflectivityProduct } from "@/lib/iemRadar";
import {
  beamHeightKm,
  haversineKm,
  sampleLevel3Reflectivity,
  sampleOdimReflectivity,
} from "@/lib/polarSample";
import { interpolateLine, lineLengthKm, type LatLng } from "@/lib/crossSection";
import { loadOdimScan, operaMetaForStation } from "@/lib/operaRadar";
import type { OdimScanMeta } from "@/lib/renderPolar";
import type { RadarStation } from "@/data/stations";
import { getRadarProduct, isReflectivityFamily } from "@/lib/radarProducts";

export interface RhiCrossSectionData {
  /** Distance along the slice line (km). */
  distancesKm: number[];
  /** Height above radar (km). */
  heightsKm: number[];
  /** values[heightIdx][distIdx] — dBZ or null. */
  values: (number | null)[][];
  variable: string;
  unit: string;
  valueKind: "reflectivity";
  time: string;
  subtitle: string;
  source: "radar-rhi";
  lineLengthKm: number;
  stationId: string;
}

export interface RhiCrossSectionInput {
  start: LatLng;
  end: LatLng;
  station: RadarStation;
  productId?: string;
  dataSource?: "iem" | "level3" | "opera" | null;
  frameTime?: number;
  iemTmsId?: string;
  sampleCount?: number;
  maxHeightKm?: number;
  heightStepKm?: number;
}

const DEFAULT_MAX_HEIGHT = 16;
const DEFAULT_HEIGHT_STEP = 0.25;

function buildHeightAxis(maxHeightKm: number, heightStepKm: number): number[] {
  const heights: number[] = [];
  for (let h = 0; h <= maxHeightKm + 1e-6; h += heightStepKm) {
    heights.push(Math.round(h * 100) / 100);
  }
  return heights;
}

function heightIndex(heightsKm: number[], heightKm: number): number {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < heightsKm.length; i++) {
    const d = Math.abs(heightsKm[i] - heightKm);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

function fillGridFromTilts(
  radarLat: number,
  radarLon: number,
  line: LatLng[],
  totalKm: number,
  tilts: Array<{ key: string; elevDeg: number; sample: (lat: number, lon: number) => number | null }>,
  heightsKm: number[],
  sampleCount: number,
): (number | null)[][] {
  const grid: (number | null)[][] = heightsKm.map(() =>
    line.map(() => null),
  );

  for (let di = 0; di < line.length; di++) {
    const pt = line[di];
    const rangeKm = haversineKm(radarLat, radarLon, pt.lat, pt.lon);

    for (const tilt of tilts) {
      const dbz = tilt.sample(pt.lat, pt.lon);
      if (dbz == null) continue;

      const h = beamHeightKm(rangeKm, tilt.elevDeg);
      const hi = heightIndex(heightsKm, h);
      const existing = grid[hi][di];
      if (existing == null || dbz > existing) {
        grid[hi][di] = dbz;
      }
    }
  }

  void totalKm;
  void sampleCount;
  return grid;
}

async function loadLevel3Tilt(
  stationId: string,
  productId: string,
  tiltIndex: number,
): Promise<Level3Parsed | null> {
  const code = level3FetchCode(productId, tiltIndex);
  const frames = await fetchLevel3Frames(stationId, code, 1);
  if (!frames.length) return null;
  const res = await fetch(level3ObjectUrl(frames[frames.length - 1].key));
  if (!res.ok) return null;
  return parseLevel3(await res.arrayBuffer());
}

async function loadOdimTilt(
  station: RadarStation,
  tiltIndex: number,
): Promise<OdimScanMeta | null> {
  const { fetchOperaFrames } = await import("@/lib/operaRadar");
  const meta = operaMetaForStation(station.id);
  if (!meta) return null;
  const frames = await fetchOperaFrames(station.id, "DBZH", tiltIndex, 1);
  if (!frames.length) return null;
  return loadOdimScan(frames[frames.length - 1].odimUrl, meta.lat, meta.lon);
}

async function buildLevel3Rhi(
  start: LatLng,
  end: LatLng,
  station: RadarStation,
  productId: string,
  frameTime: number,
  sampleCount: number,
  maxHeightKm: number,
  heightStepKm: number,
): Promise<RhiCrossSectionData> {
  const tilts = NEXRAD_TILTS;
  const parsedLayers = await Promise.all(
    tilts.map(async (t) => ({
      tilt: t,
      parsed: await loadLevel3Tilt(station.id, productId, t.index),
    })),
  );

  const active = parsedLayers.filter((p) => p.parsed);
  if (!active.length) {
    throw new Error("No Level-III tilt data available for cross-section");
  }

  const line = interpolateLine(start, end, sampleCount);
  const totalKm = lineLengthKm(start, end);
  const heightsKm = buildHeightAxis(maxHeightKm, heightStepKm);
  const distancesKm = line.map((_, i) =>
    (i / Math.max(1, sampleCount - 1)) * totalKm,
  );

  const radarLat = active[0].parsed!.latitude;
  const radarLon = active[0].parsed!.longitude;

  const tiltSamplers = active.map(({ tilt, parsed }) => ({
    key: `tilt_${tilt.index}`,
    elevDeg: parsed!.elevationAngle ?? parseFloat(tilt.label),
    sample: (lat: number, lon: number) =>
      sampleLevel3Reflectivity(parsed!.layer, parsed!.latitude, parsed!.longitude, lat, lon),
  }));

  const values = fillGridFromTilts(
    radarLat,
    radarLon,
    line,
    totalKm,
    tiltSamplers,
    heightsKm,
    sampleCount,
  );

  return {
    distancesKm,
    heightsKm,
    values,
    variable: "reflectivity",
    unit: "dBZ",
    valueKind: "reflectivity",
    time: frameTime ? new Date(frameTime * 1000).toISOString() : "",
    subtitle: `${station.id} · multi-tilt Level-III`,
    source: "radar-rhi",
    lineLengthKm: totalKm,
    stationId: station.id,
  };
}

async function buildOperaRhi(
  start: LatLng,
  end: LatLng,
  station: RadarStation,
  frameTime: number,
  sampleCount: number,
  maxHeightKm: number,
  heightStepKm: number,
): Promise<RhiCrossSectionData> {
  const tilts = OPERA_TILTS;
  const scans = await Promise.all(
    tilts.map(async (t) => ({
      tilt: t,
      scan: await loadOdimTilt(station, t.index),
    })),
  );
  const active = scans.filter((s) => s.scan);
  if (!active.length) throw new Error("No OPERA tilt data for cross-section");

  const line = interpolateLine(start, end, sampleCount);
  const totalKm = lineLengthKm(start, end);
  const heightsKm = buildHeightAxis(maxHeightKm, heightStepKm);
  const distancesKm = line.map((_, i) =>
    (i / Math.max(1, sampleCount - 1)) * totalKm,
  );

  const radarLat = active[0].scan!.lat;
  const radarLon = active[0].scan!.lon;

  const tiltSamplers = active.map(({ tilt, scan }) => ({
    key: `tilt_${tilt.index}`,
    elevDeg: operaElevationForTilt(tilt.index),
    sample: (lat: number, lon: number) => sampleOdimReflectivity(scan!, lat, lon),
  }));

  const values = fillGridFromTilts(
    radarLat,
    radarLon,
    line,
    totalKm,
    tiltSamplers,
    heightsKm,
    sampleCount,
  );

  return {
    distancesKm,
    heightsKm,
    values,
    variable: "reflectivity",
    unit: "dBZ",
    valueKind: "reflectivity",
    time: frameTime ? new Date(frameTime * 1000).toISOString() : "",
    subtitle: `${station.id} · OPERA multi-tilt`,
    source: "radar-rhi",
    lineLengthKm: totalKm,
    stationId: station.id,
  };
}

async function buildSingleTiltRhi(
  start: LatLng,
  end: LatLng,
  station: RadarStation,
  elevDeg: number,
  sample: (lat: number, lon: number) => number | null,
  frameTime: number,
  sampleCount: number,
  maxHeightKm: number,
  heightStepKm: number,
  subtitle: string,
): Promise<RhiCrossSectionData> {
  const line = interpolateLine(start, end, sampleCount);
  const totalKm = lineLengthKm(start, end);
  const heightsKm = buildHeightAxis(maxHeightKm, heightStepKm);
  const distancesKm = line.map((_, i) =>
    (i / Math.max(1, sampleCount - 1)) * totalKm,
  );

  const values: (number | null)[][] = heightsKm.map(() => line.map(() => null));

  for (let di = 0; di < line.length; di++) {
    const pt = line[di];
    const rangeKm = haversineKm(station.lat, station.lon, pt.lat, pt.lon);
    const dbz = sample(pt.lat, pt.lon);
    if (dbz == null) continue;
    const h = beamHeightKm(rangeKm, elevDeg);
    const hi = heightIndex(heightsKm, h);
    values[hi][di] = dbz;
  }

  return {
    distancesKm,
    heightsKm,
    values,
    variable: "reflectivity",
    unit: "dBZ",
    valueKind: "reflectivity",
    time: frameTime ? new Date(frameTime * 1000).toISOString() : "",
    subtitle,
    source: "radar-rhi",
    lineLengthKm: totalKm,
    stationId: station.id,
  };
}

export async function fetchRhiCrossSection(input: RhiCrossSectionInput): Promise<RhiCrossSectionData> {
  const sampleCount = input.sampleCount ?? 64;
  const maxHeightKm = input.maxHeightKm ?? DEFAULT_MAX_HEIGHT;
  const heightStepKm = input.heightStepKm ?? DEFAULT_HEIGHT_STEP;
  const { start, end, station } = input;
  const productId = input.productId ?? "N0Q";

  const product = getRadarProduct(productId);
  const isReflectivity = product
    ? isReflectivityFamily(product.family)
    : isReflectivityProduct(productId);
  if (!isReflectivity) {
    throw new Error("Cross-section requires a reflectivity product");
  }

  if (input.dataSource === "level3") {
    return buildLevel3Rhi(
      start,
      end,
      station,
      productId,
      input.frameTime ?? 0,
      sampleCount,
      maxHeightKm,
      heightStepKm,
    );
  }

  if (input.dataSource === "opera") {
    return buildOperaRhi(
      start,
      end,
      station,
      input.frameTime ?? 0,
      sampleCount,
      maxHeightKm,
      heightStepKm,
    );
  }

  if (input.dataSource === "iem") {
    const { clearTileSampleCache, pickSampleZoom, sampleIemDbz } = await import("@/lib/tileSample");
    clearTileSampleCache();
    const totalKm = lineLengthKm(start, end);
    const zoom = pickSampleZoom(totalKm);
    const tmsId = input.iemTmsId;
    if (!tmsId) throw new Error("No IEM frame for cross-section");

    return buildSingleTiltRhi(
      start,
      end,
      station,
      0.5,
      (lat, lon) => sampleIemDbz(lat, lon, station.id, productId, tmsId, zoom),
      input.frameTime ?? 0,
      sampleCount,
      maxHeightKm,
      heightStepKm,
      `${station.id} · lowest tilt (IEM)`,
    );
  }

  throw new Error("Cross-section requires multi-tilt radar data — select a NEXRAD or OPERA station");
}
