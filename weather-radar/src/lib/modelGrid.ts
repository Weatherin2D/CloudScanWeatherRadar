import {
  ecmwfForecastUrl,
  hourlyParamsFor,
  scalarParamForDisplay,
  type ModelVariable,
  type PressureLevel,
} from "@/lib/ecmwfModels";

export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface GridPoint {
  lat: number;
  lon: number;
  row: number;
  col: number;
}

export interface GridCell extends GridPoint {
  /** Full hourly time series per API parameter. */
  series: Record<string, (number | null)[]>;
}

export interface ModelGridData {
  cells: GridCell[];
  latStep: number;
  lonStep: number;
  rows: number;
  cols: number;
  south: number;
  north: number;
  west: number;
  east: number;
  times: string[];
  scalarParam: string;
  hourlyParams: string[];
  fetchedAt: number;
}

interface OpenMeteoLocationResponse {
  latitude?: number | number[];
  longitude?: number | number[];
  hourly?: Record<string, (number | null)[] | string[]>;
  hourly_units?: Record<string, string>;
  error?: boolean;
  reason?: string;
}

export interface ViewportGrid {
  points: GridPoint[];
  latStep: number;
  lonStep: number;
  rows: number;
  cols: number;
  south: number;
  north: number;
  west: number;
  east: number;
}

const FORECAST_DAYS = 3;
const MIN_REQUEST_GAP_MS = 1500;

let lastRequestAt = 0;

function normalizeLon(lon: number): number {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_GAP_MS) {
    await sleep(MIN_REQUEST_GAP_MS - elapsed);
  }
}

/** Point budget — denser lattice + bilinear interpolation = Windy-like smooth fields. */
function gridPointBudget(zoom: number): number {
  if (zoom >= 10) return 169;
  if (zoom >= 8) return 144;
  if (zoom >= 6) return 121;
  if (zoom >= 4) return 100;
  return 80;
}

/**
 * Build a 2D lattice that covers the full viewport (not a single scan line).
 * Points are evenly spaced in latitude and longitude across visible bounds.
 */
export function buildViewportGrid(bounds: MapBounds, zoom: number): ViewportGrid {
  const south = Math.max(-85, bounds.south);
  const north = Math.min(85, bounds.north);
  const west = normalizeLon(bounds.west);
  const east = normalizeLon(bounds.east);
  const latSpan = north - south;

  const empty: ViewportGrid = {
    points: [],
    latStep: 1,
    lonStep: 1,
    rows: 0,
    cols: 0,
    south,
    north,
    west,
    east,
  };

  if (latSpan <= 0) return empty;

  const maxPoints = gridPointBudget(zoom);
  const aspect = Math.max(0.25, Math.min(4, lonSpanForBounds(west, east) / latSpan));

  let cols = Math.max(3, Math.round(Math.sqrt(maxPoints * aspect)));
  let rows = Math.max(3, Math.round(maxPoints / cols));
  while (rows * cols > maxPoints) {
    if (cols >= rows && cols > 3) cols--;
    else if (rows > 3) rows--;
    else break;
  }

  const latStep = rows > 1 ? latSpan / (rows - 1) : latSpan;
  const lonStepDeg = cols > 1 ? lonSpanForBounds(west, east) / (cols - 1) : 1;

  const points: GridPoint[] = [];
  for (let row = 0; row < rows; row++) {
    const lat = rows === 1 ? (south + north) / 2 : south + (row / (rows - 1)) * latSpan;
    for (let col = 0; col < cols; col++) {
      const lon = lonAtFraction(west, east, cols === 1 ? 0.5 : col / (cols - 1));
      points.push({
        lat: roundCoord(lat),
        lon: roundCoord(lon),
        row,
        col,
      });
    }
  }

  return {
    points,
    latStep,
    lonStep: lonStepDeg,
    rows,
    cols,
    south,
    north,
    west,
    east,
  };
}

function lonSpanForBounds(west: number, east: number): number {
  if (east >= west) return east - west;
  return (180 - west) + (east + 180);
}

function lonAtFraction(west: number, east: number, fraction: number): number {
  const span = lonSpanForBounds(west, east);
  let lon = west + fraction * span;
  return normalizeLon(lon);
}

function roundCoord(n: number): number {
  return Math.round(n * 100) / 100;
}

export function cellGeoBounds(
  data: ModelGridData,
  cell: GridCell,
): { latMin: number; latMax: number; lonMin: number; lonMax: number } {
  const latHalf = data.rows > 1 ? data.latStep / 2 : (data.north - data.south) / 2;
  const lonHalf = data.cols > 1 ? data.lonStep / 2 : lonSpanForBounds(data.west, data.east) / 2;

  let latMin = cell.lat - latHalf;
  let latMax = cell.lat + latHalf;
  latMin = Math.max(data.south, latMin);
  latMax = Math.min(data.north, latMax);

  let lonMin = cell.lon - lonHalf;
  let lonMax = cell.lon + lonHalf;
  if (data.east >= data.west) {
    lonMin = Math.max(data.west, lonMin);
    lonMax = Math.min(data.east, lonMax);
  }

  return { latMin, latMax, lonMin, lonMax };
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    await waitForRateLimit();
    lastRequestAt = Date.now();
    const res = await fetch(url);
    if (res.ok) return res;
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : MIN_REQUEST_GAP_MS * (i + 2);
      lastError = new Error("ECMWF rate limited — retrying…");
      if (i < attempts - 1) await sleep(backoff);
      continue;
    }
    throw new Error(`ECMWF grid request failed (${res.status})`);
  }
  throw lastError ?? new Error("ECMWF grid request failed (429)");
}

function seriesFromHourly(
  hourly: Record<string, (number | null)[] | string[]>,
  params: string[],
): Record<string, (number | null)[]> {
  const series: Record<string, (number | null)[]> = {};
  for (const param of params) {
    series[param] = (hourly[param] as (number | null)[] | undefined) ?? [];
  }
  return series;
}

function parseBatchResponses(
  raw: unknown,
  points: GridPoint[],
  hourlyParams: string[],
): { cells: GridCell[]; times: string[] } {
  const cells: GridCell[] = [];
  let times: string[] = [];

  if (Array.isArray(raw)) {
    raw.forEach((item, index) => {
      const resp = item as OpenMeteoLocationResponse;
      if (resp.error) throw new Error(resp.reason ?? "ECMWF error");
      const pt = points[index] ?? points[points.length - 1];
      const hourly = resp.hourly ?? {};
      const timeArr = (hourly.time as string[] | undefined) ?? [];
      if (!times.length && timeArr.length) times = timeArr;
      cells.push({
        lat: pt.lat,
        lon: pt.lon,
        row: pt.row,
        col: pt.col,
        series: seriesFromHourly(hourly, hourlyParams),
      });
    });
    return { cells, times };
  }

  const data = raw as OpenMeteoLocationResponse;
  if (data.error) throw new Error(data.reason ?? "ECMWF error");

  const hourly = data.hourly ?? {};
  const timeArr = (hourly.time as string[] | undefined) ?? [];
  if (timeArr.length) times = timeArr;

  const lats = Array.isArray(data.latitude) ? data.latitude : [data.latitude ?? 0];
  const lons = Array.isArray(data.longitude) ? data.longitude : [data.longitude ?? 0];
  const count = Math.min(points.length, lats.length, lons.length);

  for (let i = 0; i < count; i++) {
    const pt = points[i];
    cells.push({
      lat: pt.lat,
      lon: pt.lon,
      row: pt.row,
      col: pt.col,
      series: seriesFromHourly(hourly, hourlyParams),
    });
  }

  return { cells, times };
}

async function fetchBatch(
  points: GridPoint[],
  hourlyParams: string[],
): Promise<{ cells: GridCell[]; times: string[] }> {
  const lat = points.map((p) => p.lat).join(",");
  const lon = points.map((p) => p.lon).join(",");
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: hourlyParams.join(","),
    forecast_days: String(FORECAST_DAYS),
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    temperature_unit: "celsius",
  });

  const res = await fetchWithRetry(ecmwfForecastUrl(params));
  const raw = await res.json();
  return parseBatchResponses(raw, points, hourlyParams);
}

export function cellValuesAtHour(
  cell: GridCell,
  hourIndex: number,
  params: string[],
): Record<string, number | null> {
  const values: Record<string, number | null> = {};
  for (const param of params) {
    const series = cell.series[param];
    values[param] = series?.[hourIndex] ?? null;
  }
  return values;
}

export async function fetchModelGrid(
  bounds: MapBounds,
  zoom: number,
  variable: ModelVariable,
  pressureLevel: PressureLevel,
): Promise<ModelGridData> {
  const layout = buildViewportGrid(bounds, zoom);
  const hourlyParams = [...new Set(hourlyParamsFor(variable, pressureLevel))];

  if (!layout.points.length) {
    return {
      cells: [],
      latStep: layout.latStep,
      lonStep: layout.lonStep,
      rows: layout.rows,
      cols: layout.cols,
      south: layout.south,
      north: layout.north,
      west: layout.west,
      east: layout.east,
      times: [],
      scalarParam: scalarParamForDisplay(variable, pressureLevel),
      hourlyParams,
      fetchedAt: Date.now(),
    };
  }

  const { cells, times } = await fetchBatch(layout.points, hourlyParams);

  return {
    cells,
    latStep: layout.latStep,
    lonStep: layout.lonStep,
    rows: layout.rows,
    cols: layout.cols,
    south: layout.south,
    north: layout.north,
    west: layout.west,
    east: layout.east,
    times,
    scalarParam: scalarParamForDisplay(variable, pressureLevel),
    hourlyParams,
    fetchedAt: Date.now(),
  };
}

export async function fetchEcmwfJson(params: URLSearchParams): Promise<unknown> {
  const res = await fetchWithRetry(ecmwfForecastUrl(params));
  return res.json();
}

/** Reference forecast times from a single global point. */
export async function fetchEcmwfTimeline(forecastDays = FORECAST_DAYS): Promise<string[]> {
  const params = new URLSearchParams({
    latitude: "48",
    longitude: "10",
    hourly: "temperature_2m",
    forecast_days: String(forecastDays),
  });
  const res = await fetchWithRetry(ecmwfForecastUrl(params));
  const data = (await res.json()) as OpenMeteoLocationResponse;
  if (data.error) throw new Error(data.reason ?? "ECMWF timeline error");
  return (data.hourly?.time as string[]) ?? [];
}

export function boundsKey(bounds: MapBounds, zoom: number): string {
  return [
    bounds.south.toFixed(0),
    bounds.west.toFixed(0),
    bounds.north.toFixed(0),
    bounds.east.toFixed(0),
    String(zoom),
  ].join("|");
}

export function leafletBoundsToMapBounds(bounds: {
  getSouth: () => number;
  getWest: () => number;
  getNorth: () => number;
  getEast: () => number;
}): MapBounds {
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
  };
}

/** @deprecated Use buildViewportGrid */
export function gridStepForZoom(zoom: number): number {
  if (zoom >= 9) return 0.5;
  if (zoom >= 7) return 1;
  if (zoom >= 5) return 1.5;
  if (zoom >= 3) return 2.5;
  return 4;
}

/** @deprecated Use buildViewportGrid */
export function quantizeBounds(bounds: MapBounds, step: number): MapBounds {
  return {
    south: Math.floor(bounds.south / step) * step,
    north: Math.ceil(bounds.north / step) * step,
    west: Math.floor(normalizeLon(bounds.west) / step) * step,
    east: Math.ceil(normalizeLon(bounds.east) / step) * step,
  };
}
