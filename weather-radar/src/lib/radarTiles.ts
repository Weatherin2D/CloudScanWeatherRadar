import type { TileLayerOptions } from "leaflet";

/** RainViewer only serves native tiles through zoom 7; higher levels are upscaled client-side. 
 * Updated to use 512px tiles for improved resolution. */
export const RAINVIEWER_MAX_NATIVE_ZOOM = 7;

/** Shared Leaflet options for smooth radar overlays (avoid reload flicker on pan/zoom). */
export const SMOOTH_RADAR_TILE_OPTS: TileLayerOptions = {
  updateWhenZooming: false,
  updateWhenIdle: true,
  keepBuffer: 10,
  fadeAnimation: false,
};

export const RAINVIEWER_TILE_OPTS: TileLayerOptions = {
  ...SMOOTH_RADAR_TILE_OPTS,
  maxNativeZoom: RAINVIEWER_MAX_NATIVE_ZOOM,
  maxZoom: 18,
  className: "radar-tile-raw",
  tileSize: 512,
  zoomOffset: -1,
};

export const IEM_RIDGE_TILE_OPTS: TileLayerOptions = {
  ...SMOOTH_RADAR_TILE_OPTS,
  maxNativeZoom: 15,
  maxZoom: 18,
  className: "radar-tile-raw",
  attribution: "IEM/NEXRAD",
};

/** Per-station overlay — keep georeferenced tiles crisp (no CSS scaling during pan/zoom). */
export const STATION_IEM_TILE_OPTS: TileLayerOptions = {
  ...IEM_RIDGE_TILE_OPTS,
  keepBuffer: 4,
};
