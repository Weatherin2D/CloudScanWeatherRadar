import type { GeoJsonFeatureCollection, GeoJsonGeometry } from "@/lib/geoJson";

export type { GeoJsonFeatureCollection } from "@/lib/geoJson";

export type OutlookDay = 1 | 2 | 3;

/** SPC categorical outlook risk levels (Day 1–3). */
export const SPC_RISK_LEGEND = [
  { label: "TSTM", name: "General Thunderstorms", fill: "#C1E0C1", stroke: "#55AA55" },
  { label: "MRGL", name: "Marginal", fill: "#66A366", stroke: "#005500" },
  { label: "SLGT", name: "Slight", fill: "#FFE066", stroke: "#DDAA00" },
  { label: "ENH", name: "Enhanced", fill: "#FFAA66", stroke: "#FF6600" },
  { label: "MDT", name: "Moderate", fill: "#FF6666", stroke: "#DD0000" },
  { label: "HIGH", name: "High", fill: "#FF00FF", stroke: "#AA00AA" },
] as const;

export function spcOutlookUrl(day: OutlookDay, layered = true): string {
  const suffix = layered ? "lyr" : "nolyr";
  return `https://www.spc.noaa.gov/products/outlook/day${day}otlk_cat.${suffix}.geojson`;
}

function parseCoordPair(raw: unknown): [number, number] {
  if (Array.isArray(raw) && raw.length >= 2) {
    return [Number(raw[0]), Number(raw[1])];
  }
  if (typeof raw === "string") {
    const parts = raw.trim().split(/\s+/);
    if (parts.length >= 2) return [Number(parts[0]), Number(parts[1])];
  }
  return [NaN, NaN];
}

/** SPC GeoJSON uses space-separated "lon lat" strings instead of numeric pairs. */
function normalizeCoordinateRing(ring: unknown): [number, number][] {
  if (!Array.isArray(ring)) return [];
  return ring.map(parseCoordPair).filter(([lon, lat]) => !Number.isNaN(lon) && !Number.isNaN(lat));
}

function normalizeGeometry(geometry: GeoJsonGeometry | null): GeoJsonGeometry | null {
  if (!geometry) return null;

  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as unknown[];
    return {
      ...geometry,
      coordinates: rings.map(normalizeCoordinateRing),
    };
  }

  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates as unknown[];
    return {
      ...geometry,
      coordinates: polygons.map((poly) =>
        Array.isArray(poly) ? poly.map(normalizeCoordinateRing) : [],
      ),
    };
  }

  return geometry;
}

export interface SpcOutlookProperties {
  LABEL?: string;
  LABEL2?: string;
  fill?: string;
  stroke?: string;
  VALID_ISO?: string;
  EXPIRE_ISO?: string;
  ISSUE_ISO?: string;
  FORECASTER?: string;
  DN?: number;
}

export function normalizeSpcGeoJson(raw: unknown): GeoJsonFeatureCollection {
  const data = raw as GeoJsonFeatureCollection;
  if (!data?.features) return { type: "FeatureCollection", features: [] };

  return {
    type: "FeatureCollection",
    features: data.features.map((feature) => ({
      ...feature,
      geometry: normalizeGeometry(feature.geometry),
    })),
  };
}

export function riskStyleForFeature(
  props: SpcOutlookProperties | null | undefined,
  opacity: number,
): { fillColor: string; color: string; fillOpacity: number; weight: number } {
  const label = props?.LABEL ?? "";
  const legend = SPC_RISK_LEGEND.find((r) => r.label === label);
  const fill = props?.fill ?? legend?.fill ?? "#888888";
  const stroke = props?.stroke ?? legend?.stroke ?? "#666666";

  return {
    fillColor: fill,
    color: stroke,
    fillOpacity: opacity * 0.45,
    weight: 2,
  };
}

export function formatOutlookIssue(iso?: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}
