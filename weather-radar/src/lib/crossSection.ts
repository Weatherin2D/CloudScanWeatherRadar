import { fetchEcmwfJson } from "@/lib/modelGrid";
import { PRESSURE_LEVELS } from "@/lib/ecmwfModels";

export interface LatLng {
  lat: number;
  lon: number;
}

export interface CrossSectionSample {
  lat: number;
  lon: number;
  distanceKm: number;
  levels: Record<string, number | null>;
}

export interface CrossSectionData {
  samples: CrossSectionSample[];
  levelLabels: string[];
  levelKeys: string[];
  variable: string;
  unit: string;
  time: string;
  source: "ecmwf" | "radar-composite" | "radar-volume";
  subtitle?: string;
  valueKind: "temperature" | "reflectivity";
}

const PROFILE_LEVELS = PRESSURE_LEVELS.filter((p) => p.id !== "surface").map((p) => p.suffix);
const PROFILE_PARAMS = [
  ...PROFILE_LEVELS.flatMap((s) => [`temperature_${s}`, `relative_humidity_${s}`]),
  "temperature_2m",
  "dew_point_2m",
  "cape",
  "precipitation",
  "wind_speed_10m",
  "wind_direction_10m",
];

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function interpolateLine(start: LatLng, end: LatLng, count: number): LatLng[] {
  const points: LatLng[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    points.push({
      lat: start.lat + t * (end.lat - start.lat),
      lon: start.lon + t * (end.lon - start.lon),
    });
  }
  return points;
}

export function lineLengthKm(start: LatLng, end: LatLng): number {
  return haversineKm(start, end);
}

async function fetchProfileBatch(
  points: LatLng[],
  hourIndex: number,
): Promise<Array<{ lat: number; lon: number; values: Record<string, number | null>; time: string }>> {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(2)).join(","),
    longitude: points.map((p) => p.lon.toFixed(2)).join(","),
    hourly: PROFILE_PARAMS.join(","),
    forecast_days: "3",
    wind_speed_unit: "kmh",
    temperature_unit: "celsius",
  });

  const res = await fetchEcmwfJson(params);
  const raw = res;
  const list = Array.isArray(raw) ? raw : [raw];

  return list.map((item: Record<string, unknown>) => {
    const lat = Array.isArray(item.latitude) ? item.latitude[0] : item.latitude;
    const lon = Array.isArray(item.longitude) ? item.longitude[0] : item.longitude;
    const hourly = (item.hourly ?? {}) as Record<string, unknown>;
    const times = (hourly.time as string[]) ?? [];
    const idx = Math.max(0, Math.min(hourIndex, times.length - 1));
    const values: Record<string, number | null> = {};
    for (const key of PROFILE_PARAMS) {
      const series = hourly[key] as (number | null)[] | undefined;
      values[key] = series?.[idx] ?? null;
    }
    return {
      lat: Number(lat),
      lon: Number(lon),
      values,
      time: times[idx] ?? "",
    };
  });
}

export async function fetchModelCrossSection(
  start: LatLng,
  end: LatLng,
  hourIndex: number,
  sampleCount = 16,
): Promise<CrossSectionData> {
  const line = interpolateLine(start, end, sampleCount);
  const totalKm = lineLengthKm(start, end);
  const batchSize = 16;
  const samples: CrossSectionSample[] = [];
  let time = "";

  for (let i = 0; i < line.length; i += batchSize) {
    const batch = line.slice(i, i + batchSize);
    const profiles = await fetchProfileBatch(batch, hourIndex);
    profiles.forEach((profile, j) => {
      const globalIndex = i + j;
      const distanceKm = (globalIndex / Math.max(1, sampleCount - 1)) * totalKm;
      if (profile.time) time = profile.time;
      samples.push({
        lat: profile.lat,
        lon: profile.lon,
        distanceKm,
        levels: profile.values,
      });
    });
  }

  const levelKeys = ["temperature_2m", ...PROFILE_LEVELS.map((s) => `temperature_${s}`)];
  const levelLabels = ["Surface", ...PROFILE_LEVELS.map((s) => `${s.replace("hPa", "")} hPa`)];

  return {
    samples,
    levelKeys,
    levelLabels,
    variable: "temperature",
    unit: "°C",
    time,
    source: "ecmwf",
    subtitle: "ECMWF IFS",
    valueKind: "temperature",
  };
}

/** @deprecated Use fetchModelCrossSection */
export const fetchCrossSection = fetchModelCrossSection;

export function crossSectionMatrix(data: CrossSectionData): (number | null)[][] {
  return data.levelKeys.map((key) =>
    data.samples.map((s) => s.levels[key] ?? null),
  );
}
