export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id?: string | number;
    geometry: GeoJsonGeometry | null;
    properties?: Record<string, unknown> | null;
  }>;
}

export type GeoJsonGeometry =
  | { type: "Polygon"; coordinates: unknown[] }
  | { type: "MultiPolygon"; coordinates: unknown[] }
  | { type: string; coordinates?: unknown };

export const EMPTY_GEOJSON: GeoJsonFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function mergeGeoJson(
  ...collections: GeoJsonFeatureCollection[]
): GeoJsonFeatureCollection {
  return {
    type: "FeatureCollection",
    features: collections.flatMap((c) => c.features),
  };
}
