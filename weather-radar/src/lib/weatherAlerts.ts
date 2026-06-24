import {
  EMPTY_GEOJSON,
  mergeGeoJson,
  type GeoJsonFeatureCollection,
  type GeoJsonGeometry,
} from "@/lib/geoJson";

export const IFRC_GRAPHQL_URL = "/api/ifrc-alerts";
export const NWS_ALERTS_URL =
  "https://api.weather.gov/alerts/active?status=actual";
export const CANADA_ALERTS_URL =
  "https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=10000";

export const ALERT_SEVERITY_LEGEND = [
  { key: "EXTREME", label: "Extreme", fill: "#ff00ff", stroke: "#aa00aa" },
  { key: "SEVERE", label: "Severe", fill: "#ff4444", stroke: "#cc0000" },
  { key: "MODERATE", label: "Moderate", fill: "#ff8800", stroke: "#cc6600" },
  { key: "MINOR", label: "Minor", fill: "#ffcc00", stroke: "#aa8800" },
  { key: "UNKNOWN", label: "Other", fill: "#888888", stroke: "#555555" },
] as const;

export type AlertSeverity = (typeof ALERT_SEVERITY_LEGEND)[number]["key"];

export interface AlertFeatureProperties {
  recordId: string;
  event: string;
  headline?: string;
  description?: string;
  severity: AlertSeverity;
  kind: "warning" | "watch" | "advisory" | "other";
  country?: string;
  area?: string;
  expires?: string;
  source: string;
}

export interface WeatherAlertRecord {
  id: string;
  event: string;
  headline: string;
  description: string;
  severity: AlertSeverity;
  kind: AlertFeatureProperties["kind"];
  country?: string;
  area?: string;
  expires?: string;
  source: string;
  lat: number;
  lon: number;
}

export interface WeatherAlertsResult {
  geojson: GeoJsonFeatureCollection;
  alerts: WeatherAlertRecord[];
  source: string;
}

const IFRC_PAGE_SIZE = 400;
const NWS_USER_AGENT = "CloudScan Weather Radar (alerts overlay)";

const ALERTS_GRAPHQL = `
  query GlobalAlerts($limit: Int!, $offset: Int!) {
    public {
      alerts(pagination: { limit: $limit, offset: $offset }) {
        count
        items {
          id
          sent
          status
          msgType
          country { name iso3 }
          infos {
            event
            severity
            urgency
            headline
            description
            expires
            category
            areas {
              areaDesc
              polygons { valuePolygon }
            }
          }
        }
      }
    }
  }
`;

function hasGeometry(geometry: GeoJsonGeometry | null): geometry is GeoJsonGeometry {
  if (!geometry?.type || geometry.type === "GeometryCollection") return false;
  const coords = geometry.coordinates;
  return Array.isArray(coords) && coords.length > 0;
}

function classifyKind(text: string): AlertFeatureProperties["kind"] {
  const lower = text.toLowerCase();
  if (/\bwatch\b/.test(lower)) return "watch";
  if (/\bwarning\b/.test(lower)) return "warning";
  if (/\badvisory\b/.test(lower)) return "advisory";
  return "other";
}

function isWeatherAlertText(text: string): boolean {
  const lower = text.toLowerCase();
  if (/test|exercise|drill|practice|debug|demo/.test(lower)) return false;
  if (/\b(warning|watch|advisory|alert)\b/.test(lower)) return true;
  return /\b(thunderstorm|tornado|hurricane|cyclone|typhoon|flood|heat|wind|storm|blizzard|frost|ice|snow|fog|fire|rain|hail|lightning|marine|gale|squall|drought|avalanche|tsunami|weather)\b/.test(lower);
}

function normalizeSeverity(raw: unknown): AlertSeverity {
  const value = String(raw ?? "UNKNOWN").toUpperCase();
  if (value === "EXTREME" || value === "SEVERE" || value === "MODERATE" || value === "MINOR") {
    return value;
  }
  return "UNKNOWN";
}

function nwsSeverity(raw: unknown): AlertSeverity {
  const map: Record<string, AlertSeverity> = {
    Extreme: "EXTREME",
    Severe: "SEVERE",
    Moderate: "MODERATE",
    Minor: "MINOR",
    Unknown: "UNKNOWN",
  };
  return map[String(raw ?? "Unknown")] ?? "UNKNOWN";
}

function isExpired(iso?: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return !Number.isNaN(t) && t < Date.now();
}

function pushPolygonFeature(
  features: GeoJsonFeatureCollection["features"],
  geometry: GeoJsonGeometry,
  properties: AlertFeatureProperties,
  id: string,
) {
  if (!hasGeometry(geometry)) return;
  features.push({ type: "Feature", id, geometry, properties: { ...properties } });
}

function ringCentroid(ring: unknown): { lat: number; lon: number } | null {
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let sumLat = 0;
  let sumLon = 0;
  let count = 0;
  for (const pair of ring) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const lon = Number(pair[0]);
    const lat = Number(pair[1]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    sumLon += lon;
    sumLat += lat;
    count++;
  }
  if (!count) return null;
  return { lat: sumLat / count, lon: sumLon / count };
}

export function geometryCenter(geometry: GeoJsonGeometry): { lat: number; lon: number } | null {
  if (geometry.type === "Polygon") {
    const ring = (geometry.coordinates as unknown[][])[0];
    return ringCentroid(ring);
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates as unknown[][];
    let sumLat = 0;
    let sumLon = 0;
    let count = 0;
    for (const poly of polygons) {
      if (!Array.isArray(poly) || !poly[0]) continue;
      const c = ringCentroid(poly[0]);
      if (!c) continue;
      sumLat += c.lat;
      sumLon += c.lon;
      count++;
    }
    if (!count) return null;
    return { lat: sumLat / count, lon: sumLon / count };
  }
  return null;
}

function upsertRecord(
  records: Map<string, WeatherAlertRecord>,
  record: WeatherAlertRecord,
) {
  const existing = records.get(record.id);
  if (!existing) {
    records.set(record.id, record);
    return;
  }
  if (record.description.length > existing.description.length) {
    existing.description = record.description;
  }
}

export function alertStyleForFeature(
  props: AlertFeatureProperties | null | undefined,
  opacity: number,
): { fillColor: string; color: string; fillOpacity: number; weight: number; dashArray?: string } {
  const severity = props?.severity ?? "UNKNOWN";
  const legend = ALERT_SEVERITY_LEGEND.find((r) => r.key === severity) ?? ALERT_SEVERITY_LEGEND[4];
  const isWatch = props?.kind === "watch";

  return {
    fillColor: legend.fill,
    color: legend.stroke,
    fillOpacity: opacity * (isWatch ? 0.22 : 0.38),
    weight: isWatch ? 2 : 2.5,
    dashArray: isWatch ? "6 4" : undefined,
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Alerts request failed (${res.status})`);
  return res.json() as Promise<T>;
}

async function fetchIfrcPage(offset: number): Promise<{
  count: number;
  items: unknown[];
}> {
  try {
    const data = await fetchJson<{
      data?: { public?: { alerts?: { count: number; items: unknown[] } } };
      errors?: unknown[];
    }>(IFRC_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: ALERTS_GRAPHQL,
        variables: { limit: IFRC_PAGE_SIZE, offset },
      }),
    });

    if (data.errors?.length) throw new Error("IFRC alerts query failed");
    const alerts = data.data?.public?.alerts;
    if (!alerts) throw new Error("IFRC alerts unavailable");
    return alerts;
  } catch (err) {
    console.error("IFRC alerts fetch failed:", err);
    throw err;
  }
}

export function normalizeIfrcAlerts(items: unknown[]): WeatherAlertsResult {
  const features: GeoJsonFeatureCollection["features"] = [];
  const records = new Map<string, WeatherAlertRecord>();

  for (const item of items) {
    const alert = item as Record<string, unknown>;
    if (alert.status !== "ACTUAL") continue;
    if (alert.msgType === "CANCEL") continue;

    const country = (alert.country as { name?: string; iso3?: string } | undefined)?.name;
    const infos = (alert.infos as unknown[]) ?? [];

    for (let infoIndex = 0; infoIndex < infos.length; infoIndex++) {
      const info = infos[infoIndex] as Record<string, unknown>;
      const event = String(info.event ?? info.headline ?? "Alert");
      const headline = String(info.headline ?? event);
      const description = String(info.description ?? "").trim();
      const category = String(info.category ?? "");

      if (!isWeatherAlertText(`${event} ${headline}`)) continue;
      if (category && category !== "MET" && category !== "GEO" && !isWeatherAlertText(event)) continue;
      if (isExpired(info.expires as string | undefined)) continue;

      const kind = classifyKind(`${event} ${headline}`);
      if (kind === "other" && !/\balert\b/i.test(`${event} ${headline}`)) continue;

      const severity = normalizeSeverity(info.severity);
      const areas = (info.areas as unknown[]) ?? [];

      for (let areaIndex = 0; areaIndex < areas.length; areaIndex++) {
        const area = areas[areaIndex] as Record<string, unknown>;
        const areaDesc = String(area.areaDesc ?? "");
        const recordId = `ifrc-${alert.id}-${infoIndex}-${areaIndex}`;
        const polygons = (area.polygons as unknown[]) ?? [];
        let center: { lat: number; lon: number } | null = null;

        for (let polyIndex = 0; polyIndex < polygons.length; polyIndex++) {
          const poly = polygons[polyIndex] as { valuePolygon?: GeoJsonGeometry | null };
          const geometry = poly.valuePolygon;
          if (!geometry || !hasGeometry(geometry)) continue;
          if (!center) center = geometryCenter(geometry);
          const props: AlertFeatureProperties = {
            recordId,
            event,
            headline,
            description,
            severity,
            kind,
            country,
            area: areaDesc,
            expires: info.expires as string | undefined,
            source: "IFRC Alert Hub",
          };
          pushPolygonFeature(
            features,
            geometry,
            props,
            `${recordId}-${polyIndex}`,
          );
        }

        if (center) {
          upsertRecord(records, {
            id: recordId,
            event,
            headline,
            description,
            severity,
            kind,
            country,
            area: areaDesc,
            expires: info.expires as string | undefined,
            source: "IFRC Alert Hub",
            lat: center.lat,
            lon: center.lon,
          });
        }
      }
    }
  }

  return {
    geojson: { type: "FeatureCollection", features },
    alerts: [...records.values()],
    source: "IFRC Alert Hub (global CAP)",
  };
}

export async function fetchIfrcAlerts(): Promise<WeatherAlertsResult> {
  const first = await fetchIfrcPage(0);
  const allItems = [...first.items];

  for (let offset = IFRC_PAGE_SIZE; offset < first.count; offset += IFRC_PAGE_SIZE) {
    const page = await fetchIfrcPage(offset);
    allItems.push(...page.items);
  }

  return normalizeIfrcAlerts(allItems);
}

export function normalizeNwsAlerts(raw: unknown): WeatherAlertsResult {
  const data = raw as GeoJsonFeatureCollection;
  const features: GeoJsonFeatureCollection["features"] = [];
  const alerts: WeatherAlertRecord[] = [];

  for (const feature of data?.features ?? []) {
    const props = feature.properties ?? {};
    const event = String(props.event ?? "Alert");
    if (!isWeatherAlertText(event)) continue;
    if (props.status && props.status !== "Actual") continue;
    if (props.messageType === "Cancel") continue;
    if (isExpired(props.expires as string | undefined)) continue;

    const kind = classifyKind(event);
    if (kind === "other") continue;

    if (!hasGeometry(feature.geometry)) continue;
    const center = geometryCenter(feature.geometry);
    if (!center) continue;

    const recordId = String(feature.id ?? `nws-${alerts.length}`);
    const description = String(props.description ?? "").trim();
    const headline = String(props.headline ?? event);

    features.push({
      type: "Feature",
      id: recordId,
      geometry: feature.geometry,
      properties: {
        recordId,
        event,
        headline,
        description,
        severity: nwsSeverity(props.severity),
        kind,
        area: String(props.areaDesc ?? ""),
        country: "United States",
        expires: props.expires as string | undefined,
        source: "NWS/NOAA",
      } satisfies AlertFeatureProperties,
    });

    alerts.push({
      id: recordId,
      event,
      headline,
      description,
      severity: nwsSeverity(props.severity),
      kind,
      area: String(props.areaDesc ?? ""),
      country: "United States",
      expires: props.expires as string | undefined,
      source: "NWS/NOAA",
      lat: center.lat,
      lon: center.lon,
    });
  }

  return {
    geojson: { type: "FeatureCollection", features },
    alerts,
    source: "NWS/NOAA",
  };
}

export async function fetchNwsAlerts(): Promise<WeatherAlertsResult> {
  const raw = await fetchJson<unknown>(NWS_ALERTS_URL, {
    headers: {
      Accept: "application/geo+json",
      "User-Agent": NWS_USER_AGENT,
    },
  });
  return normalizeNwsAlerts(raw);
}

export function normalizeCanadaAlerts(raw: unknown): WeatherAlertsResult {
  const data = raw as GeoJsonFeatureCollection;
  const features: GeoJsonFeatureCollection["features"] = [];
  const alerts: WeatherAlertRecord[] = [];

  for (const feature of data?.features ?? []) {
    const props = feature.properties ?? {};
    const alertType = String(props.alert_type ?? "").toLowerCase();
    if (alertType !== "warning" && alertType !== "watch" && alertType !== "advisory") continue;
    if (isExpired(props.expiration_datetime as string | undefined)) continue;
    if (!hasGeometry(feature.geometry)) continue;

    const center = geometryCenter(feature.geometry);
    if (!center) continue;

    const event = String(props.alert_name_en ?? props.alert_short_name_en ?? "Alert");
    const description = String(props.alert_text_en ?? "").trim();
    const kind = alertType === "advisory"
      ? "advisory"
      : alertType === "watch"
        ? "watch"
        : "warning";

    const impact = String(props.impact_en ?? "Unknown").toUpperCase();
    const severity: AlertSeverity =
      impact.includes("EXTREME") ? "EXTREME"
        : impact.includes("HIGH") || impact.includes("SEVERE") ? "SEVERE"
          : impact.includes("MODERATE") ? "MODERATE"
            : impact.includes("LOW") || impact.includes("MINOR") ? "MINOR"
              : "UNKNOWN";

    const recordId = String(props.id ?? `ca-${alerts.length}`);

    features.push({
      type: "Feature",
      id: recordId,
      geometry: feature.geometry,
      properties: {
        recordId,
        event,
        headline: event,
        description,
        severity,
        kind,
        area: String(props.feature_name_en ?? props.province ?? ""),
        country: "Canada",
        expires: props.expiration_datetime as string | undefined,
        source: "Environment Canada",
      } satisfies AlertFeatureProperties,
    });

    alerts.push({
      id: recordId,
      event,
      headline: event,
      description,
      severity,
      kind,
      area: String(props.feature_name_en ?? props.province ?? ""),
      country: "Canada",
      expires: props.expiration_datetime as string | undefined,
      source: "Environment Canada",
      lat: center.lat,
      lon: center.lon,
    });
  }

  return {
    geojson: { type: "FeatureCollection", features },
    alerts,
    source: "Environment Canada",
  };
}

export async function fetchCanadaAlerts(): Promise<WeatherAlertsResult> {
  const raw = await fetchJson<unknown>(CANADA_ALERTS_URL, {
    headers: { Accept: "application/geo+json", "User-Agent": NWS_USER_AGENT },
  });
  return normalizeCanadaAlerts(raw);
}

function mergeResults(...results: WeatherAlertsResult[]): WeatherAlertsResult {
  return {
    geojson: mergeGeoJson(...results.map((r) => r.geojson)),
    alerts: results.flatMap((r) => r.alerts),
    source: results.map((r) => r.source).filter(Boolean).join(" + "),
  };
}

export async function fetchRegionalAlerts(): Promise<WeatherAlertsResult> {
  const [nws, canada] = await Promise.all([
    fetchNwsAlerts().catch(() => ({ geojson: EMPTY_GEOJSON, alerts: [], source: "NWS/NOAA" })),
    fetchCanadaAlerts().catch(() => ({ geojson: EMPTY_GEOJSON, alerts: [], source: "Environment Canada" })),
  ]);
  return mergeResults(nws, canada);
}

export async function fetchGlobalWeatherAlerts(): Promise<WeatherAlertsResult> {
  try {
    const result = await fetchIfrcAlerts();
    if (result.alerts.length > 0) return result;
  } catch (err) {
    console.error("IFRC alerts unavailable, falling back to regional feeds:", err);
    /* fall through to regional feeds */
  }

  return fetchRegionalAlerts();
}

export function formatAlertExpiry(iso?: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}
